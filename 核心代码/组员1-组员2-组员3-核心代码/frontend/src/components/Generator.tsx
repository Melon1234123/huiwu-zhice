import {useEffect, useLayoutEffect, useRef, useState} from 'react';
import type {ReactNode} from 'react';
import type {Kind, Shared} from '../types';
import {Button, ErrorBox, Mode, Spinner} from './Common';
import {Icon} from './Icon';
import {Markdown} from './Markdown';
import './generator.css';

type GeneratorProps = Shared & {
  kind: Kind;
  title: string;
  description: string;
  placeholder: string;
  children?: ReactNode;
};

export function Generator({kind, title, description, placeholder, state, change, notify, children}: GeneratorProps) {
  const [instruction, setInstruction] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [panelHeight, setPanelHeight] = useState<number | null>(null);
  const [copyStatus, setCopyStatus] = useState('');
  const panel = useRef<HTMLElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const exitButton = useRef<HTMLButtonElement>(null);
  const readerButton = useRef<HTMLButtonElement>(null);
  const restoreFocus = useRef(false);
  const reading = panelHeight !== null;
  const output = state.outputs[kind];

  useLayoutEffect(() => {
    if (!reading) {
      if (restoreFocus.current && readerButton.current?.getClientRects().length) {
        readerButton.current.focus({preventScroll: true});
      }
      restoreFocus.current = false;
      return;
    }
    const reader = dialog.current;
    reader?.showModal();
    exitButton.current?.focus({preventScroll: true});
    return () => reader?.close();
  }, [reading]);

  useEffect(() => {
    if (!reading) return;
    const closeOnNavigation = () => setPanelHeight(null);
    window.addEventListener('hashchange', closeOnNavigation);
    return () => window.removeEventListener('hashchange', closeOnNavigation);
  }, [reading]);

  function toggleReader() {
    setCopyStatus('');
    if (reading) {
      restoreFocus.current = true;
      setPanelHeight(null);
    } else {
      setPanelHeight(panel.current?.getBoundingClientRect().height ?? 0);
    }
  }

  async function generate() {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await change('/api/generate', {kind, instruction});
      notify(`${title}已生成`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    if (!output) return;
    let message = '内容已复制';
    try {
      await navigator.clipboard.writeText(output.content);
    } catch {
      message = '复制失败，请手动选择内容复制';
    }
    if (reading) setCopyStatus(message);
    else notify(message);
  }

  const result = <>
    <div className="output-toolbar">
      <div className="generator-output-title">
        <span className="output-dot"/><strong id={`${kind}-result-title`}>{title}</strong>
        {output && <Mode mode={output.mode}/>}
      </div>
      {output && <div className="generator-output-actions">
        <button type="button" onClick={() => void copy()} className="output-copy">
          <Icon name="copy" size={15}/>复制内容
        </button>
        {reading
          ? <button type="button" className="output-copy generator-reader-toggle" ref={exitButton} onClick={toggleReader}>
              <Icon name="close" size={15}/>退出专注阅读
            </button>
          : <button type="button" className="output-copy generator-reader-toggle" ref={readerButton} aria-haspopup="dialog" onClick={toggleReader}>
              <svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M9 4H4v5m11-5h5v5M4 15v5h5m11-5v5h-5"/></svg>专注阅读
            </button>}
      </div>}
    </div>
    {busy && <div className="generation-progress" role="status"><Spinner/>正在结合活动资料整理内容，请稍候…</div>}
    {output ? <>
      <div className="output-meta">
        <span>最近生成 <time dateTime={output.created_at}>
          {new Date(output.created_at).toLocaleString('zh-CN', {month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'})}
        </time></span>
        {reading && <span role="status" className="generator-copy-status">{copyStatus}</span>}
        <span>请在执行前人工核对</span>
      </div>
      <div id={`${kind}-output`} className="output-content" tabIndex={reading ? 0 : undefined}
        role={reading ? 'region' : undefined} aria-label={reading ? `${title}正文` : undefined}>
        <Markdown text={output.content}/>
      </div>
    </> : <div className="output-empty">
      <div className="output-empty-art">
        <Icon name={kind === 'copy' ? 'copy' : kind === 'review' ? 'review' : 'planning'} size={36}/>
        <span className="art-line wide"/><span className="art-line"/><span className="art-line short"/>
      </div>
      <h3>你的{title}将显示在这里</h3>
      <p>基于活动信息和资料库生成，<br/>填写补充要求可以让结果更贴合实际。</p>
      <span className="empty-note"><Icon name="info" size={14}/>此处尚无生成内容</span>
    </div>}
  </>;

  return <div className="generation-layout">
    <aside className="panel generation-controls">
      <div className="panel-heading"><div><h2>生成{title}</h2><p>{description}</p></div></div>
      <div className="generation-form">
        <div className="context-box">
          <span><Icon name="planning" size={17}/>当前活动</span>
          <strong>{state.project.name}</strong><small>{state.project.attendees} 人 · {state.documents.length} 份资料 · {state.tasks.length} 项任务</small>
        </div>
        <label className="field">
          <span>补充要求 <em>选填</em></span>
          <textarea rows={6} maxLength={3000} value={instruction} onChange={e => setInstruction(e.target.value)} placeholder={placeholder} disabled={busy}/>
        </label>
        <ErrorBox error={error} retry={() => void generate()}/>
        <Button className="button full" disabled={busy} onClick={() => void generate()} icon="spark">
          {busy ? <><Spinner/>正在生成…</> : `${output ? '重新生成' : '生成'}${title}`}
        </Button>
        <p className="generation-footnote">
          {state.settings.configured ? '由配置的大模型生成，失败时会保留当前内容。' : '当前使用本地规则生成，可在后端配置真实模型。'}
        </p>
        {children}
      </div>
    </aside>
    <section className="panel output-panel" ref={panel} style={reading ? {minHeight: panelHeight} : undefined}>
      {reading ? <dialog ref={dialog} className="generation-reader" aria-labelledby={`${kind}-result-title`}
        onCancel={event => {event.preventDefault(); toggleReader();}}>
        {result}
      </dialog> : result}
    </section>
  </div>;
}
