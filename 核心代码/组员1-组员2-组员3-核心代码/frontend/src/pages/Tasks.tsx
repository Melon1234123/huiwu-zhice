import {useEffect, useEffectEvent, useState} from 'react';
import type {FormEvent} from 'react';
import type {Shared, Task, TaskStatus} from '../types';
import {shortDate} from '../api';
import {Button, PageHeader, Modal, Field, ErrorBox, Spinner} from '../components/Common';
import {Icon} from '../components/Icon';
import './tasks.css';

const columns: {key: TaskStatus; name: string}[] = [
  {key: 'todo', name: '待开始'},
  {key: 'doing', name: '进行中'},
  {key: 'done', name: '已完成'},
];

const deadlineFilters = [
  {key: 'all', label: '全部任务'},
  {key: 'overdue', label: '已逾期'},
  {key: 'today', label: '今天到期'},
  {key: 'week', label: '7 天内到期'},
] as const;
type DeadlineFilter = typeof deadlineFilters[number]['key'];

function localDateKey(date: Date) {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

function matchesDeadline(task: Task, filter: DeadlineFilter, today: string, weekEnd: string) {
  if (filter === 'all') return true;
  if (task.status === 'done' || !task.due) return false;
  if (filter === 'overdue') return task.due < today;
  if (filter === 'today') return task.due === today;
  return task.due >= today && task.due <= weekEnd;
}

export function Tasks({state, change, notify}: Shared) {
  const [editing, setEditing] = useState<Partial<Task> | null>(null);
  const [deleting, setDeleting] = useState<Task | null>(null);
  const [busy, setBusy] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');
  const [genError, setGenError] = useState('');
  const [moving, setMoving] = useState('');
  const [query, setQuery] = useState('');
  const [deadline, setDeadline] = useState<DeadlineFilter>('all');
  const [today, setToday] = useState(() => localDateKey(new Date()));

  useEffect(() => {
    const now = new Date();
    const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const refreshDay = () => setToday(localDateKey(new Date()));
    const timer = window.setTimeout(refreshDay, midnight.getTime() - now.getTime() + 100);
    window.addEventListener('focus', refreshDay);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('focus', refreshDay);
    };
  }, [today]);

  const openTaskRoute = useEffectEvent(() => {
    const hash = window.location.hash;
    setEditing(null);
    setDeleting(null);
    if (!hash.startsWith('#tasks/')) return;
    setError('');
    setQuery('');
    const target = hash.slice('#tasks/'.length);
    if (target === 'overdue') {
      setDeadline('overdue');
      return;
    }
    setDeadline('all');
    const task = state.tasks.find(item => item.id === target || encodeURIComponent(item.id) === target);
    if (task) {
      setEditing({...task});
    } else {
      window.history.replaceState(window.history.state, '', '#tasks');
      notify('找不到这项任务，请在看板中重新查找。');
    }
  });
  useEffect(() => {
    openTaskRoute();
    const followHash = () => openTaskRoute();
    window.addEventListener('hashchange', followHash);
    return () => window.removeEventListener('hashchange', followHash);
  }, []);

  function closeEditor() {
    if (window.location.hash.startsWith('#tasks/') && window.location.hash !== '#tasks/overdue') {
      window.history.replaceState(window.history.state, '', '#tasks');
      const taskId = editing?.id;
      if (taskId) window.requestAnimationFrame(() => document.getElementById(`task-edit-${taskId}`)?.focus());
    }
    setEditing(null);
  }

  function selectDeadline(value: DeadlineFilter) {
    if (value !== 'overdue' && window.location.hash === '#tasks/overdue') {
      window.history.replaceState(window.history.state, '', '#tasks');
    }
    setDeadline(value);
  }

  const lastDay = new Date(today + 'T12:00:00');
  lastDay.setDate(lastDay.getDate() + 6);
  const weekEnd = localDateKey(lastDay);
  const search = query.trim().toLocaleLowerCase();
  const filtered = Boolean(search) || deadline !== 'all';
  const matchingTasks = state.tasks.filter(task =>
    !search || [task.title, task.owner || '待分配'].some(field => field.toLocaleLowerCase().includes(search))
  );
  const visibleTasks = matchingTasks
    .filter(task => matchesDeadline(task, deadline, today, weekEnd))
    .sort((a, b) => (a.due || '9999-12-31').localeCompare(b.due || '9999-12-31'));
  const done = state.tasks.filter(task => task.status === 'done').length;

  function clearFilters() {
    setQuery('');
    selectDeadline('all');
  }

  function addTask(status: TaskStatus = 'todo') {
    setError('');
    setEditing({title: '', owner: '', due: state.project.date, status});
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!editing) return;
    setBusy(true);
    setError('');
    try {
      const {id, title, owner, due, status} = editing;
      await change(id ? `/api/tasks/${id}` : '/api/tasks', {title, owner: owner || '', due, status: status || 'todo'}, id ? 'PATCH' : 'POST');
      closeEditor();
      notify(id ? '任务已更新' : '任务已添加');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!deleting) return;
    setBusy(true);
    setError('');
    try {
      await change(`/api/tasks/${deleting.id}`, undefined, 'DELETE');
      setDeleting(null);
      notify('任务已删除');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function move(task: Task, destination: typeof columns[number]) {
    setMoving(task.id);
    try {
      await change(`/api/tasks/${task.id}`, {status: destination.key}, 'PATCH');
      notify(`“${task.title}”已移至「${destination.name}」`);
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setMoving('');
    }
  }

  async function generate() {
    setGenerating(true);
    setGenError('');
    const before = state.tasks.length;
    try {
      const next = await change('/api/generate', {kind: 'tasks', instruction: ''});
      notify(next.tasks.length > before ? `已新增 ${next.tasks.length - before} 项任务` : '已检查任务，未添加重复事项');
    } catch (e) {
      setGenError((e as Error).message);
    } finally {
      setGenerating(false);
    }
  }

  return <>
    <PageHeader eyebrow="策划与执行" title="把筹备事项，一项项推进" description="明确负责人和截止日期，让团队知道现在该做什么。" action={<>
      <Button icon="spark" variant="secondary" disabled={generating} onClick={() => void generate()}>
        {generating ? <><Spinner/>生成中…</> : '智能拆解任务'}
      </Button>
      <Button icon="plus" onClick={() => addTask()}>新建任务</Button>
    </>}/>
    <ErrorBox error={genError} retry={() => void generate()}/>
    <div className="tasks-workbench">
      <div className="task-board-tools">
        <div className="board-progress">
          <span className="board-progress-icon"><Icon name="tasks"/></span>
          <strong>执行看板</strong><span>{state.tasks.length} 项任务</span>
          <span className="board-progress-divider"/><span className="done-count">已完成 {done} 项</span>
        </div>
        <label className="task-search">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
            <circle cx="10" cy="10" r="6.5"/><path d="m15 15 5 5"/>
          </svg>
          <input type="search" aria-label="搜索任务或负责人" placeholder="搜索任务或负责人" value={query} onChange={e => setQuery(e.target.value)}/>
        </label>
      </div>
      <div className="task-deadline-bar">
        <div className="task-filter-options" role="group" aria-label="按截止时间筛选">
          {deadlineFilters.map(option => <button key={option.key} type="button" aria-pressed={option.key === deadline}
            title={option.key === 'week' ? '今天起七个自然日内截止的未完成任务' : undefined}
            onClick={() => selectDeadline(option.key)}>
            {option.label}<span>{matchingTasks.filter(task => matchesDeadline(task, option.key, today, weekEnd)).length}</span>
          </button>)}
        </div>
        <div className="task-sort-note">
          {filtered && <button type="button" onClick={clearFilters}>清除筛选</button>}
          <span role="status">{filtered ? `显示 ${visibleTasks.length} 项` : '按截止日期从近到远排列'}</span>
        </div>
      </div>
      <div className="kanban">
        {columns.map(column => {
          const tasks = visibleTasks.filter(task => task.status === column.key);
          return <section className={`kanban-column ${column.key}`} key={column.key} aria-label={column.name}>
            <div className="column-heading">
              <span className={`column-dot ${column.key}`}/><h2>{column.name}</h2>
              <span className="column-count">{tasks.length}</span>
              <button className="icon-button" aria-label={`添加${column.name}任务`} onClick={() => addTask(column.key)}><Icon name="plus" size={18}/></button>
            </div>
            <div className="kanban-cards">
              {tasks.map(task => {
                const overdue = matchesDeadline(task, 'overdue', today, weekEnd);
                const dueToday = matchesDeadline(task, 'today', today, weekEnd);
                return <article className="kanban-card" key={task.id} aria-busy={moving === task.id}>
                  <div className="task-card-top">
                    <span className={`task-deadline ${overdue ? 'is-overdue' : dueToday ? 'is-today' : ''}`}>
                      <Icon name="clock" size={14}/>
                      <time dateTime={task.due || undefined} title={task.due}>{shortDate(task.due)}</time>
                      {overdue ? <b>已逾期</b> : dueToday ? <b>今天到期</b> : null}
                    </span>
                    <div className="task-card-actions">
                      <button id={`task-edit-${task.id}`} className="icon-button" disabled={moving === task.id} aria-label={`编辑${task.title}`} onClick={() => {setError(''); setEditing({...task});}}><Icon name="edit" size={16}/></button>
                      <button className="icon-button" disabled={moving === task.id} aria-label={`删除${task.title}`} onClick={() => {setError(''); setDeleting(task);}}><Icon name="trash" size={16}/></button>
                    </div>
                  </div>
                  <h3>{task.title}</h3>
                  <div className="task-card-bottom">
                    <span className="task-owner" title={task.owner || '待分配'}>
                      <span aria-hidden="true">{Array.from(task.owner || '待')[0]}</span><em>{task.owner || '待分配'}</em>
                    </span>
                    <label className="sr-only" htmlFor={`status-${task.id}`}>更改{task.title}状态</label>
                    <select id={`status-${task.id}`} className="task-status-select" value={task.status} disabled={Boolean(moving)}
                      onChange={e => {const target = columns.find(c => c.key === e.target.value); if (target) void move(task, target);}}>
                      {columns.map(option => <option key={option.key} value={option.key}>{option.name}</option>)}
                    </select>
                  </div>
                </article>;
              })}
              {!tasks.length && <div className="column-empty">
                <Icon name={column.key === 'done' ? 'check' : 'tasks'} size={24}/>
                <p>{filtered ? '没有符合条件的任务' : `暂无${column.name}任务`}</p>
                {filtered && <small>{deadline !== 'all' && column.key === 'done' ? '截止提醒仅显示未完成事项' : '可调整关键词或截止时间'}</small>}
              </div>}
            </div>
            <button className="add-task-link" onClick={() => addTask(column.key)}><Icon name="plus" size={17}/>添加任务</button>
          </section>;
        })}
      </div>
    </div>
    <div className="reading-tip"><Icon name="info"/><p>智能拆解将追加新任务并跳过同名事项，已有任务的负责人和完成状态会保留。</p></div>
    {editing && <Modal title={editing.id ? '编辑任务' : '新建任务'} onClose={closeEditor}>
      <form id={editing.id ? 'task-edit-form' : 'task-form'} onSubmit={save}>
        <Field label="任务名称"><input id="task-title" autoFocus required maxLength={200} value={editing.title} placeholder="例如：确认嘉宾到场时间" onChange={e => setEditing({...editing, title: e.target.value})}/></Field>
        <Field label="负责人"><input id="task-owner" maxLength={80} value={editing.owner} placeholder="例如：活动统筹组" onChange={e => setEditing({...editing, owner: e.target.value})}/></Field>
        <div className="form-grid">
          <Field label="截止日期"><input id="task-due" required type="date" value={editing.due} onChange={e => setEditing({...editing, due: e.target.value})}/></Field>
          <Field label="任务状态"><select id="task-status" value={editing.status} onChange={e => setEditing({...editing, status: e.target.value as TaskStatus})}>
            {columns.map(column => <option key={column.key} value={column.key}>{column.name}</option>)}
          </select></Field>
        </div>
        <ErrorBox error={error}/>
        <div className="form-actions"><Button variant="secondary" type="button" onClick={closeEditor}>取消</Button><Button disabled={busy}>{busy ? '保存中…' : '保存任务'}</Button></div>
      </form>
    </Modal>}
    {deleting && <Modal title="删除这项任务？" onClose={() => setDeleting(null)}>
      <p className="modal-copy">“{deleting.title}”将从执行看板移除。</p><ErrorBox error={error}/>
      <div className="form-actions">
        <Button variant="secondary" onClick={() => setDeleting(null)}>取消</Button>
        <Button variant="danger" disabled={busy} onClick={() => void remove()}>确认删除</Button>
      </div>
    </Modal>}
  </>;
}
