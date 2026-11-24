import {useEffect, useState} from 'react';
import type {Shared} from '../types';
import {money, shortDate} from '../api';
import {Button, StatusBadge} from '../components/Common';
import {Icon} from '../components/Icon';
import {ProjectEditor} from './ProjectEditor';

type Props = Shared & {active: boolean; startEditRequest: number; consumeEdit: () => void};
const outputLinks = [
  {key: 'plan', name: '活动策划', href: '#planning/plan'},
  {key: 'agenda', name: '活动日程', href: '#planning/agenda'},
  {key: 'risks', name: '风险预案', href: '#planning/risks'},
  {key: 'copy', name: '宣传文案', href: '#copy'},
  {key: 'review', name: '方案审阅', href: '#review'},
] as const;

function localDateKey(date: Date) {
  const pad = (n: number) => String(n).padStart(2, '0');
  return [date.getFullYear(), pad(date.getMonth() + 1), pad(date.getDate())].join('-');
}
function lastUpdated(value: string) {
  const date = new Date(value);
  return date.toLocaleString('zh-CN', {month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit'});
}

export function Overview({state, change, notify, active, startEditRequest, consumeEdit}: Props) {
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    if (!active) setEditing(false);
    else if (startEditRequest > 0) {setEditing(true); consumeEdit()}
  }, [active, startEditRequest, consumeEdit]);
  const {project, tasks, budget, documents, outputs} = state;
  const today = localDateKey(new Date());
  const pending = tasks.filter(t => t.status !== 'done').sort((a, b) => (a.due || '9999-12-31').localeCompare(b.due || '9999-12-31'));
  const overdue = pending.filter(t => t.due && t.due < today).length;
  const done = tasks.length - pending.length;
  const progress = tasks.length ? Math.round(done / tasks.length * 100) : 0;
  const expensePercent = project.budget_limit > 0 ? Math.min(100, budget.total / project.budget_limit * 100) : budget.total > 0 ? 100 : 0;
  const savedOutputs = outputLinks.filter(link => outputs[link.key]).length;

  return <div className="desk-overview">
    <section className="event-banner">
      <div className="event-intro">
        <h1 className="workspace-view-title">活动总览</h1>
        <h2>{project.name}</h2><p>{project.goal}</p>
        <div className="event-meta">
          <span><Icon name="planning" size={16}/><time dateTime={project.date}>{project.date.replace(/-/g, '.')}</time></span>
          <span><Icon name="pin" size={16}/>{project.location}</span>
          <span><Icon name="users" size={16}/>{project.attendees} 人</span>
        </div>
      </div>
      <Button variant="secondary" icon="edit" onClick={() => setEditing(true)}>编辑活动</Button>
    </section>
    <div className="desk-stats">
      <a href="#tasks"><span>任务完成率</span><strong>{progress}<small>%</small></strong><em>{done} / {tasks.length} 项已完成</em></a>
      <a href={overdue ? '#tasks/overdue' : '#tasks'} className={overdue ? 'attention' : ''}><span>{overdue ? '已逾期任务' : '待推进任务'}</span><strong>{overdue || pending.length}<small>项</small></strong><em>{overdue ? '查看逾期事项' : '打开任务看板'} ↗</em></a>
      <a href="#documents"><span>活动资料</span><strong>{documents.length}<small>份</small></strong><em>查阅原文 ↗</em></a>
      <a href="#review"><span>已保存草案</span><strong>{savedOutputs}<small>/ {outputLinks.length}</small></strong><em>审阅与导出 ↗</em></a>
    </div>
    <div className="overview-grid">
      <section className="panel upcoming">
        <div className="panel-heading"><div><h2>近期任务</h2><p>按截止日期排列</p></div><a className="text-button" href="#tasks">查看全部 <Icon name="arrow" size={15}/></a></div>
        <div className="task-list">
          {pending.slice(0, 4).map(t => <a className="task-row" key={t.id} href={'#tasks/' + encodeURIComponent(t.id)}>
            <span className={'task-marker ' + t.status}><Icon name={t.status === 'doing' ? 'clock' : 'tasks'} size={18}/></span>
            <span className="task-row-title"><strong>{t.title}</strong><small>{t.owner || '待分配负责人'} · {shortDate(t.due)}{t.due === today && ' · 今天到期'}</small></span>
            <StatusBadge status={t.status}/><Icon name="chevron" size={15}/>
          </a>)}
          {!pending.length && <div className="compact-empty">{tasks.length ? '全部任务已完成。' : '还没有执行任务。'} <a className="text-button" href={tasks.length ? '#review' : '#tasks'}>{tasks.length ? '审阅方案' : '打开看板添加任务'} ↗</a></div>}
        </div>
      </section>
      <section className="panel budget-overview">
        <div className="panel-heading"><div><h2>预算概况</h2><p>含已保存的预备金</p></div><a className="text-button" href="#budget">管理明细 <Icon name="arrow" size={15}/></a></div>
        <div className="budget-total"><small>预计支出</small><strong>{money(budget.total)}</strong><span>预算上限 {money(project.budget_limit)}</span></div>
        <div className="budget-line"><div className={budget.remaining < 0 ? 'over' : ''} style={{width: expensePercent + '%'}}/></div>
        <div className={'budget-remaining' + (budget.remaining < 0 ? ' negative' : '')}><span>{budget.remaining < 0 ? '已超出预算' : '剩余可用'}</span><strong>{money(Math.abs(budget.remaining))}</strong></div>
      </section>
    </div>
    <div className="overview-bottom">
      <section className="panel desk-drafts"><div className="panel-heading"><div><h2>活动草案</h2><p>打开已有内容，或开始第一版</p></div></div>
        <ul>{outputLinks.map(link => <li key={link.key}><a href={link.href}>
          <Icon name={link.key === 'copy' ? 'copy' : link.key === 'review' ? 'review' : 'planning'} size={17}/>
          <strong>{link.name}</strong><small>{outputs[link.key] ? lastUpdated(outputs[link.key]!.created_at) : '待生成'}</small><Icon name="chevron" size={14}/>
        </a></li>)}</ul>
      </section>
      <section className="panel activity-panel"><div className="panel-heading"><div><h2>最近动态</h2><p>最近三次已保存的操作</p></div></div>
        <ol className="activity-list">{state.activity.slice(0, 3).map(a => <li key={a.id}><span className="activity-dot"/><div><strong>{a.action}</strong><p>{a.detail}</p></div><time dateTime={a.created_at}>{lastUpdated(a.created_at)}</time></li>)}</ol>
        {!state.activity.length && <p className="compact-empty">暂时没有操作记录。</p>}
      </section>
    </div>
    {active && editing && <ProjectEditor state={state} change={change} notify={notify} close={() => setEditing(false)}/>}
  </div>;
}
