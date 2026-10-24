import {useEffect,useRef,useState} from 'react';
import type {MouseEvent} from 'react';
import type {State} from './types';
import {api,money,shortDate} from './api';
import {Icon} from './components/Icon';
import {Modal,Button} from './components/Common';
import GlassSurface from './components/GlassSurface';

const media='/static/media/';
const capabilities=[
 {icon:'qa',title:'资料问答',text:'回到活动原文，核对每一条关键依据。',href:'#qa'},
 {icon:'planning',title:'策划生成',text:'结合活动目标与资料，整理可执行的方案。',href:'#planning'},
 {icon:'tasks',title:'执行看板',text:'明确负责人和截止日期，逐项推进筹备。',href:'#tasks'},
 {icon:'budget',title:'预算审阅',text:'算清费用与预备金，提前发现预算压力。',href:'#budget'}
];
const events=[
 {image:'campus',name:'校园 AI 创意分享会',type:'科技交流',text:'围绕主题分享与小组共创，串联报名、内容准备、设备联调和现场执行。',details:['活动目标与场地约束统一归档','签到、分享、交流与清场安排','任务负责人、费用明细与风险检查']},
 {image:'creators',name:'创作者交流夜',type:'主题沙龙',text:'让灵感交流有清楚的组织节奏，从话题与宣传准备，到现场引导与会后整理。',details:['活动定位、参与对象与话题整理','宣传文案、物料准备与分工','现场流程、费用与会后复盘']}
];
function Brand(){return <span className="landing-brand"><span className="landing-brand-symbol" aria-hidden="true"><i/><i/><i/><i/></span><span>会务智策</span></span>}
function Arrow(){return <span className="landing-arrow" aria-hidden="true">↗</span>}
function LivePreview({state,error}:{state:State|null;error:string}){
 const used=state&&state.project.budget_limit>0?Math.max(0,Math.min(1,state.budget.total/state.project.budget_limit)):0;
 return <a className="landing-preview" href="#overview" aria-label="打开当前真实项目工作台">
  <div className="preview-window-top"><Brand/><span>当前项目 · 实时读取</span><Icon name="arrow" size={16}/></div>
  <div className="preview-window-body">
   <div className="preview-mini-nav" aria-hidden="true">{['overview','documents','qa','planning','tasks','budget'].map((name,i)=><span key={name} className={i===0?'selected':''}><Icon name={name} size={17}/>{['活动总览','资料库','知识问答','策划方案','任务看板','费用预算'][i]}</span>)}</div>
   <div className="preview-current"><div className="preview-project-eyebrow">YOUR NEXT EVENT</div><h3>{state?.project.name||'你的活动工作台'}</h3><p>{state?`${shortDate(state.project.date)} · ${state.project.attendees} 人 · ${state.documents.length} 份资料`:error||'正在读取当前项目…'}</p><div className="preview-project-tabs"><span>筹备进度</span><span>任务清单</span><span>现场执行</span></div><div className="preview-task-list">{state?.tasks.slice(0,4).map(t=><div key={t.id}><span className={t.status==='done'?'checked':'unchecked'}>{t.status==='done'?<Icon name="check" size={11}/>:null}</span><strong>{t.title}</strong><small>{t.due.slice(5).replace('-','/')}</small></div>)}{!state?.tasks.length&&<p className="preview-empty">从整理活动信息开始，逐步完善筹备安排。</p>}</div></div>
   <div className="preview-budget"><strong>预算总览</strong><div className="preview-ring"><svg viewBox="0 0 120 120" aria-hidden="true"><circle cx="60" cy="60" r="51" fill="none" stroke="#243347" strokeWidth="5"/><circle cx="60" cy="60" r="51" fill="none" stroke="#a4ccf4" strokeWidth="5" strokeLinecap="round" strokeDasharray={`${used*320.44} 320.44`} transform="rotate(-90 60 60)"/></svg><span>{state?money(state.budget.total):'—'}<small>/{state?money(state.project.budget_limit):'—'}</small></span></div>{[['直接费用',state?.budget.subtotal],['预备金',state?.budget.reserve],[state&&state.budget.remaining<0?'超出预算':'剩余预算',state?Math.abs(state.budget.remaining):undefined]].map(([label,value])=><div className="preview-budget-line" key={label}><span>{label}</span><strong>{typeof value==='number'?money(value):'—'}</strong></div>)}</div>
  </div>
 </a>;
}

export default function Landing({active,onStart}:{active:boolean;onStart:()=>void}){
 const [state,setState]=useState<State|null>(null),[error,setError]=useState(''),[menu,setMenu]=useState(false),[guide,setGuide]=useState(false),[selected,setSelected]=useState<number|null>(null),[section,setSection]=useState('landing-hero');
 const [reduced,setReduced]=useState(()=>matchMedia('(prefers-reduced-motion: reduce)').matches),[paused,setPaused]=useState(false),[videoFailed,setVideoFailed]=useState(false);
 const [onScreen,setOnScreen]=useState(true),[pageVisible,setPageVisible]=useState(!document.hidden);
 const video=useRef<HTMLVideoElement>(null),hero=useRef<HTMLElement>(null);
 useEffect(()=>{if(!active)return;let alive=true;api<State>('/api/state').then(s=>{if(alive){setState(s);setError('')}}).catch(()=>{if(alive)setError('工作台暂未连接，可进入后重新加载。')});return()=>{alive=false}},[active]);
 useEffect(()=>{const query=matchMedia('(prefers-reduced-motion: reduce)');const update=()=>setReduced(query.matches);query.addEventListener('change',update);const visibility=()=>setPageVisible(!document.hidden);document.addEventListener('visibilitychange',visibility);return()=>{query.removeEventListener('change',update);document.removeEventListener('visibilitychange',visibility)}},[]);
 useEffect(()=>{const node=hero.current;if(!node)return;const observer=new IntersectionObserver(entries=>setOnScreen(entries[0]?.isIntersecting??false),{threshold:.1});observer.observe(node);return()=>observer.disconnect()},[]);
 useEffect(()=>{const node=video.current;if(!node)return;if(active&&onScreen&&pageVisible&&!paused&&!reduced&&!videoFailed){void node.play().catch(()=>setPaused(true))}else node.pause();return()=>node.pause()},[active,onScreen,pageVisible,paused,reduced,videoFailed]);
 useEffect(()=>{const observer=new IntersectionObserver(entries=>{for(const e of entries)if(e.isIntersecting)setSection(e.target.id)},{rootMargin:'-20% 0px -60% 0px'});for(const id of ['landing-hero','landing-workflow','landing-events','landing-capabilities']){const node=document.getElementById(id);if(node)observer.observe(node)}return()=>observer.disconnect()},[]);
 useEffect(()=>{if(!menu)return;const key=(e:KeyboardEvent)=>{if(e.key==='Escape')setMenu(false)};window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key)},[menu]);
 function jump(id:string,e?:MouseEvent){e?.preventDefault();setMenu(false);document.getElementById(id)?.scrollIntoView({behavior:reduced?'auto':'smooth',block:'start'})}
 const start=()=>{setGuide(false);setSelected(null);onStart()};
 return <div className="showcase">
  <a className="skip-link" href="#landing-main" onClick={e=>{e.preventDefault();document.getElementById('landing-main')?.focus()}}>跳到首页内容</a>
  <header className="landing-header">
   <GlassSurface width="100%" height="100%" borderRadius={999} borderWidth={.12} backgroundOpacity={.18} brightness={50} opacity={.87} blur={10} displace={3} distortionScale={-35} redOffset={0} greenOffset={1} blueOffset={2} mixBlendMode="overlay" renderer="svg" className="landing-nav-glass">
    <a href="#home" aria-label="会务智策首页" onClick={e=>jump('landing-hero',e)}><Brand/></a>
    <nav className="landing-desktop-nav" aria-label="产品导航"><a className={section==='landing-hero'?'active':''} href="#landing-hero" onClick={e=>jump('landing-hero',e)}>产品首页</a><a className={section==='landing-capabilities'?'active':''} href="#landing-capabilities" onClick={e=>jump('landing-capabilities',e)}>核心能力</a><a className={section==='landing-events'?'active':''} href="#landing-events" onClick={e=>jump('landing-events',e)}>活动案例</a><button onClick={()=>setGuide(true)}>使用指南</button></nav>
    <a className="landing-nav-cta" href="#overview">进入工作台 <Arrow/></a><button className="landing-menu-toggle" aria-label={menu?'关闭产品导航':'打开产品导航'} aria-expanded={menu} onClick={()=>setMenu(!menu)}><Icon name={menu?'close':'menu'} size={21}/></button>
   </GlassSurface>
   {menu&&<nav className="landing-mobile-nav" aria-label="移动产品导航"><a href="#landing-hero" onClick={e=>jump('landing-hero',e)}>产品首页</a><a href="#landing-capabilities" onClick={e=>jump('landing-capabilities',e)}>核心能力</a><a href="#landing-events" onClick={e=>jump('landing-events',e)}>活动案例</a><button onClick={()=>{setMenu(false);setGuide(true)}}>使用指南</button></nav>}
  </header>
  <main id="landing-main" tabIndex={-1}>
   <section className="landing-hero" id="landing-hero" ref={hero} aria-labelledby="landing-title">
    <div className="landing-hero-media" aria-hidden="true"><img src={media+'hero.jpg'} alt="" width="1672" height="941" fetchPriority="high"/>{active&&!reduced&&!videoFailed&&<video ref={video} src={media+'hero-film.mp4'} poster={media+'hero.jpg'} muted playsInline loop preload="metadata" onError={()=>setVideoFailed(true)}/>}</div><div className="landing-hero-shade"/>
    <div className="landing-width landing-hero-content"><p className="landing-kicker">AI EVENT OPERATING SYSTEM</p><h1 id="landing-title">让每一场活动，<br/>从容发生。</h1><p className="landing-hero-description">从最初的想法，到有序的现场。</p><div className="landing-hero-actions"><button className="landing-primary" onClick={start}>开始筹备 <Arrow/></button><a className="landing-secondary" href="#landing-workflow" onClick={e=>jump('landing-workflow',e)}>了解工作流</a></div></div>
    <div className="landing-width landing-hero-bottom"><div className="landing-domains"><span>资料与知识</span><span>策划与执行</span><span>内容与交付</span></div><div className="landing-hero-controls"><span>AI 概念影像</span>{!reduced&&!videoFailed&&<button className="landing-media-toggle" onClick={()=>setPaused(!paused)} aria-label={paused?'播放背景影像':'暂停背景影像'}>{paused?'播放':'暂停'}<span aria-hidden="true">{paused?'▷':'Ⅱ'}</span></button>}<a className="landing-scroll" href="#landing-workflow" onClick={e=>jump('landing-workflow',e)} aria-label="向下了解工作流">↓</a></div></div>
   </section>
   <section className="landing-workflow landing-width" id="landing-workflow" aria-labelledby="workflow-title"><div className="landing-workflow-copy"><p className="landing-kicker">ALL IN ONE WORKSPACE</p><h2 id="workflow-title">把复杂筹备，<br/>整理成清晰的下一步。</h2><p className="landing-section-note">一个工作台，连接资料、方案与现场执行。</p><a className="landing-text-link" href="#overview">打开我的工作台 <Arrow/></a></div><LivePreview state={state} error={error}/></section>
   <section className="landing-events landing-width" id="landing-events" aria-labelledby="events-title"><div className="landing-section-heading"><div><p className="landing-kicker">SELECTED EVENTS</p><h2 id="events-title">活动案例</h2></div><span className="landing-examples-label">虚构场景 · AI 概念图</span></div><div className="landing-event-grid">{events.map((event,i)=><button className="landing-event" key={event.name} onClick={()=>setSelected(i)} aria-label={'查看示例：'+event.name}><div className="landing-event-image"><img src={media+event.image+'.jpg'} alt={i===0?'蓝色舞台灯光下的报告厅概念场景':'夜色中创作者交流的概念场景'} width="1672" height="941" loading="lazy"/><span>EXPLORE EVENT <Arrow/></span></div><div className="landing-event-caption"><div><h3>{event.name}</h3><p>虚构示例 · {event.type}</p></div><span>查看示例 <Arrow/></span></div></button>)}</div></section>
   <section className="landing-capabilities landing-width" id="landing-capabilities" aria-labelledby="capabilities-title"><p className="landing-kicker">CORE CAPABILITIES</p><h2 id="capabilities-title">从资料到交付，一步步落实。</h2><div className="landing-capability-grid">{capabilities.map(c=><a href={c.href} className="landing-capability" key={c.title}><Icon name={c.icon} size={31}/><h3>{c.title}</h3><p>{c.text}</p><Arrow/></a>)}</div><div className="landing-more-capabilities"><a href="#planning/agenda"><Icon name="clock" size={22}/>日程安排<Arrow/></a><a href="#planning/risks"><Icon name="review" size={22}/>风险预案<Arrow/></a><a href="#copy"><Icon name="copy" size={22}/>宣传文案<Arrow/></a><a href="#review"><Icon name="download" size={22}/>成果导出<Arrow/></a></div></section>
   <section className="landing-closing" aria-labelledby="closing-title"><img src={media+'closing.jpg'} alt="" width="1672" height="941" loading="lazy"/><div className="landing-closing-shade"/><div className="landing-width landing-closing-content"><p className="landing-kicker">YOUR NEXT EVENT STARTS HERE</p><h2 id="closing-title">下一场活动，<br/>从这里开始。</h2><button className="landing-primary" onClick={start}>创建我的活动 <Arrow/></button><p>从当前项目开始编辑，保留已有资料和筹备进度。</p></div><footer className="landing-width landing-footer"><a href="#home" onClick={e=>jump('landing-hero',e)} aria-label="返回首页顶部"><Brand/></a><span>课程综合项目 · 场景影像为 AI 生成的概念表达</span><a href="#overview">进入工作台 <Arrow/></a></footer></section>
  </main>
  {guide&&<Modal title="从资料到交付，开始筹备" onClose={()=>setGuide(false)}><ol className="landing-guide">{[['完善活动信息','填写活动目标、日期、人数、场地和预算上限。'],['整理活动资料','导入通知、场地要求与已确认的信息，保留完整原文。'],['提问并核对出处','围绕当前资料提问，展开引用检查回答依据。'],['形成策划与日程','分别生成活动方案、日程和风险预案，核对待确认项。'],['推进任务与预算','明确负责人和截止日期，保存费用与预备金。'],['审阅并导出','核查草案、任务与预算，再导出项目文件。']].map(([t,d])=><li key={t}><strong>{t}</strong><p>{d}</p></li>)}</ol><div className="form-actions"><Button variant="secondary" onClick={()=>setGuide(false)}>关闭指南</Button><Button onClick={start}>开始筹备</Button></div></Modal>}
  {selected!==null&&<Modal title={events[selected].name} onClose={()=>setSelected(null)}><img className="landing-case-modal-image" src={media+events[selected].image+'.jpg'} alt="虚构活动概念场景"/><p className="landing-case-label">虚构示例 · AI 概念图</p><p className="landing-case-description">{events[selected].text}</p><ul className="landing-case-points">{events[selected].details.map(d=><li key={d}>{d}</li>)}</ul><p className="landing-case-note">此处展示适用场景，不代表真实举办记录。可在工作台编辑当前项目，按自己的活动使用。</p><div className="form-actions"><Button variant="secondary" onClick={()=>setSelected(null)}>关闭示例</Button><Button onClick={()=>{setSelected(null);window.location.hash='overview'}}>用当前项目试一试</Button></div></Modal>}
 </div>;
}
