import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {once} from 'node:events';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createInterface} from 'node:readline';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';

const root = fileURLToPath(new URL('../../', import.meta.url));
const args = process.argv.slice(2);
if (args.length && (args.length !== 2 || args[0] !== '--report')) {
  throw Error('用法：npm run test:desktop [-- --report <JSON 文件>]');
}
const bundle = await fs.readFile(path.join(root, 'static/app.js'));
const result = {
  timestamp: new Date().toISOString(),
  bundle_sha256: createHash('sha256').update(bundle).digest('hex'),
  mode: 'isolated local rules',
  checks: [],
  page_errors: [],
  external_requests: [],
};
const service = spawn(process.env.PYTHON || 'python3', ['-u', path.join(root, 'tests/serve_rules.py')],
  {cwd:root, stdio:['pipe', 'pipe', 'inherit']});
const serviceExit = once(service, 'close');
let base;
let browser;
const stateGet = request => request.method() === 'GET' && new URL(request.url()).pathname === '/api/state';
const button = (page, name) => page.getByRole('button', {name, exact: true});
const activeNav = (page, key) => page.locator('[data-page="'+key+'"][aria-current="page"]');
async function nav(page, key) {
  await page.locator('[data-page="'+key+'"]').click();
  await activeNav(page, key).waitFor();
}
async function check(name, hash, exercise) {
  const context = await browser.newContext({locale: 'zh-CN', timezoneId: 'Asia/Shanghai', viewport: {width:1440,height:900}});
  await context.route(/^https?:/, route => {
    if (new URL(route.request().url()).origin === base) return route.continue();
    result.external_requests.push(route.request().url()); return route.abort();
  });
  const page = await context.newPage();
  page.setDefaultTimeout(4500);
  page.on('pageerror', e => result.page_errors.push(e.message));
  const gets = [];
  page.on('request', req => {if (stateGet(req)) gets.push(req.url());});
  try {
    const first = page.waitForResponse(r => stateGet(r.request()));
    await page.goto(base + '/#' + hash);
    assert.equal((await (await first).json()).settings.configured, false);
    if (hash !== 'home') await activeNav(page, hash).waitFor();
    const evidence = await exercise(page, gets);
    result.checks.push({name, pass:true, ...(evidence ? {evidence} : {})});
  } catch (e) {
    result.checks.push({name, pass:false, error:e.message.slice(0,680)});
  } finally {
    await context.close();
  }
}
try {
  const messages = createInterface({input:service.stdout});
  const firstLine = once(messages, 'line');
  const port = await Promise.race([
    firstLine.then(([line]) => Number(line)),
    serviceExit.then(([code]) => {throw Error('测试服务启动失败，退出码 ' + code);}),
  ]);
  assert.ok(Number.isInteger(port) && port > 0 && port <= 65535, '测试服务未发布有效端口');
  base = 'http://127.0.0.1:' + port;
  browser = await chromium.launch({headless:true, executablePath:process.env.CHROMIUM_PATH || undefined});
  result.chromium = browser.version();

  await check('首页首次加载及进入工作台只取一次状态', 'home', async (p, gets) => {
    await p.locator('.landing-nav-cta').click(); await p.locator('.event-banner').waitFor();
    await p.waitForLoadState('networkidle'); assert.equal(gets.length,1); return {GET_state:gets.length};
  });
  await check('工作台深链首次加载只取一次状态', 'tasks', async (p, gets) => {
    await p.locator('.kanban-card').first().waitFor(); await p.waitForLoadState('networkidle');
    assert.equal(gets.length,1); return {GET_state:gets.length};
  });
  const input = p => p.getByRole('combobox', {name:'查找功能、资料或任务'});
  await check('Ctrl+K / ⌘K 与无结果恢复', 'overview', async p => {
    await p.keyboard.press('Control+k'); await input(p).waitFor();
    assert.equal(await input(p).evaluate(el => el === document.activeElement),true);
    await input(p).fill('物料编号-NO-MATCH-728463');
    await p.getByText('找到 0 项',{exact:true}).waitFor(); assert.equal(await p.getByRole('option').count(),0);
    await input(p).fill('活动日程'); await p.getByRole('option',{name:/活动日程/}).waitFor();
    await p.keyboard.press('Escape'); await input(p).waitFor({state:'hidden'});
    await p.keyboard.press('Meta+k'); await input(p).waitFor();
    await p.keyboard.press('Meta+k'); await input(p).waitFor({state:'hidden'});
  });
  await check('查找任务后回车定位精确任务', 'overview', async p => {
    await button(p,'快捷查找').click(); await input(p).fill('整理分享主题与议程');
    const target = p.getByRole('option',{name:/整理分享主题与议程/});
    const href = await target.getAttribute('href'); await input(p).press('Enter');
    await p.locator('#task-edit-form').waitFor(); assert.equal(new URL(p.url()).hash,href);
    assert.equal(await p.locator('#task-title').inputValue(),'整理分享主题与议程');
    assert.equal(await p.locator('#task-owner').inputValue(),'内容组');
  });
  await check('查找原文、对照提问及引用回查', 'overview', async p => {
    await p.keyboard.press('Control+k'); await input(p).fill('两支无线麦克风');
    await input(p).press('Enter'); await p.locator('.source-content').waitFor();
    assert.match(await p.locator('.source-content').innerText(),/最多容纳 100 人/);
    await button(p,'对照资料提问').click(); await p.locator('.reference-strip').waitFor();
    await p.locator('#question').fill('场地最多可容纳多少人？');
    const api = p.waitForResponse(r => r.request().method()==='POST' && r.url().endsWith('/api/ask'));
    await p.locator('#question').press('Enter');
    const response = await (await api).json(); assert.equal(response.source,'rule_retrieval');
    await p.locator('.citation summary').first().click(); await button(p,'核对完整原文').first().click();
    const highlight=p.locator('.knowledge-reader mark');
    assert.match(await highlight.innerText(),/100/); return {answer_source:response.source, citations:response.citations.length};
  });
  await check('预算草稿跨页面保留且未写入已保存预算', 'budget', async p => {
    await button(p,'添加费用').click(); const row=p.locator('#budget-items tr').last();
    await row.locator('.budget-item-name').fill('现场验算'); await row.locator('.budget-qty').fill('3');
    await row.locator('.budget-price').fill('2.35');
    await nav(p,'tasks'); await nav(p,'budget');
    assert.equal(await row.locator('.budget-item-name').inputValue(),'现场验算');
    assert.match(await p.locator('.budget-summary').innerText(),/2,097.76/);
    assert.match(await p.locator('.draft-label').innerText(),/未保存/);
    const exported=await (await p.request.get(base+'/api/export?format=json')).json();
    assert.equal(exported.budget.total,2090);
    return {preview:2097.76, saved:exported.budget.total};
  });
  await check('问答输入草稿跨页保持，未发送请求','qa',async p => {
    let asks=0;
    p.on('request',r=>{if(r.method()==='POST' && r.url().endsWith('/api/ask')) asks++;});
    await p.locator('#question').fill('活动正式开始前需要预留多久？');
    await nav(p,'tasks'); await nav(p,'qa');
    assert.equal(await p.locator('#question').inputValue(),'活动正式开始前需要预留多久？');
    assert.equal(asks,0);return {ask_requests:asks};
  });
  await check('首页主动暂停后往返工作台仍暂停','home',async (p,gets) => {
    const video=p.locator('.landing-hero video');
    await button(p,'暂停背景影像').click();
    await button(p,'播放背景影像').waitFor();assert.equal(await video.evaluate(v=>v.paused),true);
    await p.locator('.landing-nav-cta').click();await p.locator('.event-banner').waitFor();
    await p.goBack();await button(p,'播放背景影像').waitFor();
    assert.equal(await video.evaluate(v=>v.paused),true);
    await p.waitForLoadState('networkidle');assert.equal(gets.length,1);return {video_paused:true,GET_state:gets.length};
  });
  const scenarios=[
    ['活动编辑','overview','编辑活动','保存活动信息'],
    ['新增资料','documents','添加资料','加入资料库'],
    ['重置确认','overview','重置演示数据','确认重置'],
  ];
  for (const [label,key,opener,confirmation] of scenarios) {
    await check(label+'弹窗中浏览器后退，任务页恢复点击','tasks',async p => {
      await nav(p,key); await button(p,opener).first().click();
      await p.getByRole('dialog').getByRole('button',{name:confirmation,exact:true}).waitFor();
      await p.goBack(); await activeNav(p,'tasks').waitFor();
      await p.waitForFunction(() => !document.querySelector('dialog:modal'));
      await button(p,'新建任务').click(); await p.locator('#task-form').waitFor();
      await p.keyboard.press('Escape'); await p.locator('#task-form').waitFor({state:'hidden'});
    });
  }
} finally {
  await browser?.close();
  service.stdin.end();
  await serviceExit;
  const passed = result.checks.filter(check => check.pass).length;
  result.pass = result.checks.length === 11 && passed === 11 && !result.page_errors.length && !result.external_requests.length;
  if (args[1]) await fs.writeFile(args[1], JSON.stringify(result, null, 2) + '\n');
  for (const check of result.checks) console.log((check.pass ? 'PASS' : 'FAIL') + ' ' + check.name);
  console.log(`Chromium ${result.chromium ?? '未启动'} · ${passed}/11 通过`);
  if (!result.pass) {
    console.error(JSON.stringify(result, null, 2));
    process.exitCode = 1;
  }
}
