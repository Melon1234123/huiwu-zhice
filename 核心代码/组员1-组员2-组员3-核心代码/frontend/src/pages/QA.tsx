import {useEffect, useRef, useState} from 'react';
import type {Answer, Document, Shared} from '../types';
import {api} from '../api';
import {Button, PageHeader, ErrorBox, Spinner} from '../components/Common';
import {DocumentReader, replaceKnowledgeHash, useKnowledgeHash} from '../components/DocumentReader';
import {Icon} from '../components/Icon';
import {Markdown} from '../components/Markdown';

type Message = {question: string; result: Answer};
type Reading = {doc: Document; excerpt?: string};
const suggestions = ['场地最多容纳多少人？', '签到和清场各需要预留多久？', '活动的预算上限是多少？'];
const answerLabels: Record<Answer['source'], string> = {
  model: '真实模型回答', guard: '安全检查', retrieval_refusal: '资料不足', rule_retrieval: '本地检索回答',
};

export function QA({state}: Shared) {
  const [question, setQuestion] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [reading, setReading] = useState<Reading | null>(null);
  const conversation = useRef<HTMLDivElement>(null);
  const composer = useRef<HTMLTextAreaElement>(null);
  const pending = useRef(false);
  const hash = useKnowledgeHash();
  const reference = state.documents.find(doc => hash === `#qa/${encodeURIComponent(doc.id)}`);
  useEffect(() => {
    if (!reference) return;
    const frame = requestAnimationFrame(() => composer.current?.focus({preventScroll: true}));
    return () => cancelAnimationFrame(frame);
  }, [reference?.id]);
  useEffect(() => {
    if (hash !== '#qa' && !hash.startsWith('#qa/')) setReading(null);
  }, [hash]);
  useEffect(() => {
    const pane = conversation.current;
    if (pane && messages.length + Number(busy) > 0) {
      pane.scrollTo({top: pane.scrollHeight, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'});
    }
  }, [messages, busy]);

  async function ask(value: string) {
    const submitted = value.trim();
    if (!submitted || pending.current) return;
    pending.current = true;
    setBusy(true);
    setError('');
    setQuestion(value);
    try {
      const result = await api<Answer>('/api/ask', {question: submitted});
      setMessages(previous => [...previous, {question: submitted, result}]);
      setQuestion('');
    } catch (error) {
      setError((error as Error).message);
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  return <>
    <PageHeader eyebrow="资料与知识" title="有依据的活动问答" description="询问活动要求、时间或费用，展开回答下方的引用即可核对原文。"
      action={<a className="button secondary" href="#documents"><Icon name="documents" size={17}/>管理资料</a>}/>
    <div className="qa-layout knowledge-layout">
      <section className="panel qa-panel">
        <div className="qa-topbar"><span className="assistant-avatar"><Icon name="spark" size={19}/></span>
          <div><strong>活动知识助手</strong><small>检索范围 · 全部 {state.documents.length} 份资料</small></div>
          <span className="live-label"><span/>{state.settings.configured ? '真实模型模式' : '本地规则模式'}</span>
        </div>
        <div className="conversation" ref={conversation} role="log" aria-label="问答记录" aria-live="polite">
          {!messages.length && <div className="qa-welcome">
            <div className="welcome-icon"><Icon name="qa" size={32}/></div>
            <h2>{state.documents.length ? '你想核对哪一项活动安排？' : '先为活动添加一份资料'}</h2>
            {state.documents.length ? <><p>可以从下面的问题开始，也可以输入具体的活动要求。</p>
              <div className="suggestion-grid">{suggestions.map(prompt => <button key={prompt} onClick={() => void ask(prompt)} disabled={busy}>
                <Icon name="qa" size={17}/><span>{prompt}</span><Icon name="arrow" size={16}/>
              </button>)}</div></> : <><p>加入场地须知、报名细则或预算说明后，就能检索相关原文。</p>
                <a className="button secondary" href="#documents">前往资料库</a></>}
          </div>}
          {messages.map((message, i) => <div className="qa-exchange" key={i}>
            <div className="user-message"><span className="user-avatar">我</span><div>{message.question}</div></div>
            <div className="assistant-message"><span className="assistant-avatar"><Icon name="spark" size={18}/></span>
              <div className="answer-body"><div className="answer-label">会务智策 <span>{answerLabels[message.result.source]}</span></div>
                <Markdown text={message.result.answer}/>
                {message.result.citations.length > 0 && <div className="citations">
                  <div className="citation-label"><Icon name="link" size={14}/>参考来源 · {message.result.citations.length} 条</div>
                  {message.result.citations.map((citation, j) => {
                    const doc = state.documents.find(item => item.id === citation.id);
                    return <details className="citation" key={`${citation.id}-${j}`}>
                      <summary><span className="citation-number">{j + 1}</span><span>{citation.title}</span><Icon name="chevron" size={15}/></summary>
                      <p>{citation.excerpt}</p>
                      {doc ? <button className="source-action" onClick={() => setReading({doc, excerpt: citation.excerpt})}>
                        核对完整原文 <Icon name="arrow" size={14}/></button> : <small className="source-removed">来源已移除，保留提问时的摘录</small>}
                    </details>;
                  })}
                </div>}
                {message.result.source === 'retrieval_refusal' && <a className="source-action" href="#documents">前往资料库补充依据 <Icon name="arrow" size={14}/></a>}
              </div>
            </div>
          </div>)}
          {busy && <div className="answer-loading"><Spinner/><span>正在检索资料并整理回答…</span></div>}
        </div>
        <div className="qa-composer">
          {reference && <div className="reference-strip">
            <Icon name="documents" size={17}/><div><small>正在对照 · 仍检索全部资料</small>
              <button onClick={() => setReading({doc: reference})}>{reference.name}</button></div>
            <button className="icon-button" aria-label="结束对照" onClick={() => replaceKnowledgeHash('#qa')}><Icon name="close" size={16}/></button>
          </div>}
          {hash.startsWith('#qa/') && !reference && <p className="reader-caption">对照资料已移除，仍可检索资料库中的其他内容。</p>}
          <ErrorBox error={error} retry={() => void ask(question)}/>
          <form id="ask-form" onSubmit={event => {event.preventDefault(); void ask(question);}}>
            <label className="sr-only" htmlFor="question">输入活动问题</label>
            <textarea id="question" ref={composer} rows={2} placeholder={reference ? '输入要核实的问题，可使用原文中的关键词' : '提问，例如：报告厅可以提前多久入场？'}
              value={question} onChange={event => {setQuestion(event.target.value); setError('');}}
              onKeyDown={event => {
                if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing && event.nativeEvent.keyCode !== 229) {
                  event.preventDefault();
                  void ask(question);
                }
              }} maxLength={1500} disabled={busy}/>
            <Button type="submit" icon="send" disabled={busy || !question.trim()}>发送</Button>
          </form>
          <small>Enter 发送 · Shift + Enter 换行</small>
        </div>
      </section>
      <aside className="qa-side">
        <div className="panel"><div className="panel-heading"><div><h2>本次可用资料</h2><p>选择资料查看完整原文</p></div></div>
          <div className="source-list">{state.documents.map(doc => <button key={doc.id} onClick={() => setReading({doc})}>
            <Icon name="documents" size={18}/><span>{doc.name}<small>{doc.content.length.toLocaleString()} 字</small></span><Icon name="chevron" size={14}/>
          </button>)}{!state.documents.length && <p>资料库为空</p>}</div>
        </div>
      </aside>
    </div>
    {reading && <DocumentReader doc={reading.doc} excerpt={reading.excerpt} onClose={() => setReading(null)}/>}
  </>;
}
