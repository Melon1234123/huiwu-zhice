import {useCallback, useEffect, useState} from 'react';
import {Button, ErrorBox, Modal, Spinner} from './components/Common';
import {Icon} from './components/Icon';
import {QuickFind} from './components/QuickFind';
import {Overview} from './pages/Overview';
import {Documents} from './pages/Documents';
import {QA} from './pages/QA';
import {Planning} from './pages/Planning';
import {Tasks} from './pages/Tasks';
import {Budget} from './pages/Budget';
import {Copy} from './pages/Copy';
import {Review} from './pages/Review';
import {currentPage, navigation} from './navigation';
import type {Change, Page, State} from './types';

type Props = {
  active: boolean;
  state: State | null;
  error: string;
  refresh: () => Promise<void>;
  change: Change;
  startEditRequest: number;
  consumeEdit: () => void;
};
const modules = {documents: Documents, qa: QA, planning: Planning, tasks: Tasks, budget: Budget, copy: Copy, review: Review};
const isMac = /Mac/.test(navigator.platform);

export default function Workspace({active, state, error, refresh, change, startEditRequest, consumeEdit}: Props) {
  const [page, setPage] = useState<Page>(currentPage);
  const [toast, setToast] = useState<{message: string} | null>(null);
  const [menu, setMenu] = useState(false);
  const [find, setFind] = useState(false);
  const [reset, setReset] = useState(false);
  const [resetError, setResetError] = useState('');
  const [resetting, setResetting] = useState(false);
  const [resetVersion, setResetVersion] = useState(0);
  const current = navigation.find(n => n.page === page)!;
  const notify = useCallback((message: string) => setToast({message}), []);
  const notifyClose = () => setToast(null);

  useEffect(() => {
    const route = () => {setPage(currentPage()); setMenu(false); setFind(false); setReset(false)};
    window.addEventListener('hashchange', route);
    return () => window.removeEventListener('hashchange', route);
  }, []);
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 4500);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    if (!active || !state) return;
    function keydown(event: KeyboardEvent) {
      if (event.isComposing || event.defaultPrevented) return;
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k' && !event.altKey && !event.shiftKey) {
        if (document.querySelector('dialog[open]') && !find) return;
        event.preventDefault();
        setFind(open => !open);
      }
      if (event.key === 'Escape') setMenu(false);
    }
    window.addEventListener('keydown', keydown);
    return () => window.removeEventListener('keydown', keydown);
  }, [active, state, find]);
  async function doReset() {
    setResetting(true); setResetError('');
    try {
      await change('/api/reset', {});
      setReset(false); setResetVersion(v => v + 1); notify('已重置为虚构教学示例');
      window.location.hash = 'overview';
    } catch (error) {setResetError((error as Error).message)}
    finally {setResetting(false)}
  }

  return <div className="app-shell">
    <a className="skip-link" href="#main-content" onClick={e => {e.preventDefault(); document.getElementById('main-content')?.focus()}}>跳到主要内容</a>
    {menu && <button className="nav-overlay" aria-label="关闭导航" onClick={() => setMenu(false)}/>}
    <aside className={'sidebar' + (menu ? ' open' : '')} aria-label="主导航">
      <a className="brand" href="#home" aria-label="返回产品首页">
        <span className="workspace-brand-mark" aria-hidden="true"><i/><i/><i/><i/></span>
        <span>会务智策<small>活动运营工作台</small></span>
      </a>
      <nav>{navigation.map((item, i) => <div key={item.page}>
        {(i === 0 || navigation[i - 1].group !== item.group) && <div className="nav-group">{item.group}</div>}
        <a href={'#' + item.page} data-page={item.page} className={'nav-item' + (page === item.page ? ' active' : '')}
          aria-current={page === item.page ? 'page' : undefined} onClick={() => setMenu(false)}>
          <Icon name={item.page} size={19}/><span>{item.name}</span>
          {item.page === 'tasks' && state && <span className="nav-count">{state.tasks.filter(t => t.status !== 'done').length}</span>}
          {page === item.page && <span className="nav-active-dot"/>}
        </a>
      </div>)}</nav>
      <div className="sidebar-bottom">
        <button className="reset-link" onClick={() => {setReset(true); setResetError('')}}><Icon name="refresh" size={16}/>重置演示数据</button>
      </div>
    </aside>
    <div className="main-shell">
      <header className="topbar">
        <div className="breadcrumb">
          <button className="icon-button mobile-menu" aria-label="打开导航" aria-expanded={menu} onClick={() => setMenu(!menu)}><Icon name="menu"/></button>
          <a href="#overview" title={state?.project.name}>{state?.project.name || '活动工作区'}</a><Icon name="chevron" size={14}/><strong>{current.name}</strong>
        </div>
        <div className="topbar-right">
          <button className="find-trigger" aria-label="快捷查找" disabled={!state} onClick={() => setFind(true)}><Icon name="search" size={16}/><span>快捷查找</span><kbd>{isMac ? '⌘ K' : 'Ctrl K'}</kbd></button>
          <span id="mode-badge" className="connection" title={state?.settings.model || undefined}><span className={state?.settings.configured ? '' : 'rule'}/>{!state ? '正在连接' : state.settings.configured ? '真实模型模式' : '本地规则模式'}</span>
        </div>
      </header>
      <main id="main-content" tabIndex={-1}>
        {!state && (error ? <div className="load-error"><Icon name="info" size={32}/><h2>工作台暂时无法连接</h2><ErrorBox error={error}/><Button icon="refresh" onClick={() => void refresh()}>重新加载</Button></div> :
          <div className="loading-screen"><Spinner/><h2>正在打开活动工作台</h2></div>)}
        {state && <div key={resetVersion}>{navigation.map(item => {
          const shared = {state, change, notify};
          const Module = item.page === 'overview' ? null : modules[item.page];
          return <section key={item.page} className="page" hidden={page !== item.page} aria-label={item.name}>
            {Module ? <Module {...shared}/> : <Overview {...shared} active={active && page === 'overview'} startEditRequest={startEditRequest} consumeEdit={consumeEdit}/>}
          </section>;
        })}</div>}
      </main>
      <footer className="app-footer"><span>会务智策 · 活动运营工作台</span><span>生成的活动方案请在执行前核对</span></footer>
    </div>
    {active && find && state && <QuickFind state={state} onClose={() => setFind(false)}/>}
    {toast && <div className="toast" role="status"><span><Icon name="check" size={17}/></span>{toast.message}<button className="icon-button" aria-label="关闭提示" onClick={notifyClose}><Icon name="close" size={16}/></button></div>}
    {active && reset && <Modal title="重置演示数据？" onClose={() => {if (!resetting) setReset(false)}}>
      <p className="modal-copy">当前活动、导入的资料、任务、预算和生成内容将被清空，并恢复为虚构教学示例。此操作无法撤销。</p>
      <ErrorBox error={resetError}/><div className="form-actions"><Button disabled={resetting} variant="secondary" onClick={() => setReset(false)}>保留当前数据</Button>
        <Button variant="danger" disabled={resetting} onClick={() => void doReset()}>{resetting ? '重置中…' : '确认重置'}</Button></div></Modal>}
  </div>;
}
