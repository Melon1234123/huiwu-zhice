# 会务智策

面向校园社团和小型活动组织者的本地活动运营工作台。把活动资料、带引用的问答、策划与日程、执行任务、费用预算、风险预案、宣传文案和方案审阅放在同一项目中。所有自带活动资料均为虚构教学示例。

默认打开深色展示首页：全屏概念影像、玻璃质感固定导航、功能预览、活动案例与收尾入口。点击“进入工作台”继续当前活动；直接访问 `/#overview` 也可进入业务界面。“开始筹备”打开当前活动编辑窗口，不会自动清空已有资料。

## 启动

安装 Python 3.9 或更新版本。生产前端已构建在 `static/`，日常运行不需要 Node.js、npm 或独立数据库服务。

macOS / Linux 在本目录运行：

```sh
python3 server.py
```

Windows 在本目录运行：

```powershell
py -3 server.py
```

打开 <http://127.0.0.1:8765>。macOS 也可双击 `start.command`，首次需要执行权限时运行 `chmod +x start.command`。服务只监听本机。更换端口可使用 `python3 server.py --port 8766`。

SQLite 自动保存当前活动和工作结果。恢复示例会替换当前内容，请先导出。不要将个人数据库或真实活动资料随源代码交给他人。

## 模型配置

把 `.env.example` 复制为本目录 `.env`，填入自己的模型配置。也可在用户目录 `~/.config/huiwu-zhice/runtime.env` 保存本机私有配置。模型密钥只由 Python 后端读取，不进入浏览器构建。

```dotenv
LLM_BASE_URL=https://tokendance.space/gateway/v1
LLM_MODEL=deepseek-v4.1-flash
LLM_API_KEY=在本机填写自己的密钥
LLM_TIMEOUT=60
LLM_MAX_TOKENS=4096
LLM_THINKING=disabled
```

接口使用 OpenAI 兼容的 `/chat/completions` 协议。请确认你的服务商支持所填根地址和模型名称。根地址不要重复附上 `/chat/completions`。

配置后会显示真实模型模式，实际可用性取决于供应商。没有配置时显示规则演示，文本来自本地模板和原文检索，不代表真实模型生成。真实模型报错会显示错误，不能悄悄降级为规则并冒充成功。少量真实接口案例和本地测试记录放在 `examples/`、`verification/`，它们不代表总体模型准确率或生产并发性能。

调用真实模型会把当前项目及相关资料片段发送到配置的服务商。勿导入密码、密钥或无权发送的资料。交付文件不含 `.env`、私有配置和个人数据库。

## 使用流程

1. 设置活动目标、时间、地点、人数与预算上限。
2. 保存活动通知、场地规则等原始资料，可导入 TXT / Markdown。
3. 向资料提问，展开引用核对原文；证据不足时补充资料。
4. 生成活动策划、日程和风险预案，检查未确认事项。
5. 把准备工作落实为任务，编辑负责人、截止日期和状态。
6. 填写费用数量与单价，保存预算并查看预备金和超支。
7. 生成宣传文案，核对时间、地点、嘉宾和报名信息。
8. 审阅方案并导出 Markdown、JSON 或 CSV。

同名生成任务去重，保留现有任务信息。模型输出均为待审核草案。预算金额由确定性 Decimal 规则计算，不能用模型文本替代核算。

## 开发

后端为 Python 标准库 HTTP 服务与 SQLite。前端为 React、TypeScript 和 Vite，源码在 `frontend/`。需要修改界面时，在该目录运行：

```sh
npm ci
npm run build
```

构建产物写入 `static/`，刷新 Python 服务页面即可。开发代理的端口与配置参见 `frontend/`，不要把密钥写进 `VITE_` 环境变量。

后端测试使用临时数据库和本地 mock 供应商，不需要密钥，也不会修改日常工作台。在代码根目录运行 `python3 tests/run_tests.py`（Windows 使用 `py -3 tests/run_tests.py`）。本轮结果见 `verification/backend-test-results.json`，浏览器验证另行记录，不与模型效果混为一谈。

本次界面从零使用用户指定的 [frontend-showcase skill](https://github.com/Melon1234123/skill-fronted) 重新生成。视觉素材为 CSS、排印、SVG 图标及真实应用状态，没有外部照片或将生成图片当作功能证据。减少动态时保留完整内容与操作。

## 实用边界

这是可运行的单用户课程原型，尚未提供多人权限、报名、审批、日历同步或生产部署。原文检索可能漏检，引用存在也不保证每句话都受到支持。请人工核对生成结果，尤其是时间、金额、活动约束与未确认信息。
