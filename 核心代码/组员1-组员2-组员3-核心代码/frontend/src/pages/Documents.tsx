import {useEffect, useRef, useState} from 'react';
import type {Document, Shared} from '../types';
import {Button, PageHeader, Modal, Field, ErrorBox, Empty} from '../components/Common';
import {DocumentReader, replaceKnowledgeHash, useKnowledgeHash} from '../components/DocumentReader';
import {Icon} from '../components/Icon';

function previewText(content: string, keyword: string) {
  const index = keyword ? content.toLowerCase().indexOf(keyword) : -1;
  const start = Math.max(0, index - 22);
  const end = Math.min(content.length, Math.max(start + 105, index + keyword.length + 25));
  return <>{start > 0 && '…'}{index < 0 ? content.slice(start, end) : <>
    {content.slice(start, index)}<mark>{content.slice(index, index + keyword.length)}</mark>
    {content.slice(index + keyword.length, end)}
  </>}{end < content.length && '…'}</>;
}

export function Documents({state, change, notify}: Shared) {
  const [adding, setAdding] = useState(false);
  const [deleting, setDeleting] = useState<Document | null>(null);
  const [name, setName] = useState('');
  const [content, setContent] = useState('');
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const hash = useKnowledgeHash();
  useEffect(() => {
    if (hash !== '#documents') {
      setAdding(false);
      setDeleting(null);
    }
  }, [hash]);
  const view = state.documents.find(doc => hash === `#documents/${encodeURIComponent(doc.id)}`);
  const keyword = query.trim().toLowerCase();
  const filtered = state.documents.filter(doc =>
    doc.name.toLowerCase().includes(keyword) || doc.content.toLowerCase().includes(keyword)
  );

  function openAdd() {
    setAdding(true);
    setError('');
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (busy || reading) return;
    setBusy(true);
    setError('');
    try {
      await change('/api/documents', {name: name.trim(), content});
      setAdding(false);
      setName('');
      setContent('');
      setQuery('');
      notify(`已加入资料库：${name.trim()}`);
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!deleting || busy) return;
    setBusy(true);
    setError('');
    try {
      await change(`/api/documents/${deleting.id}`, undefined, 'DELETE');
      notify(`已删除资料：${deleting.name}`);
      setDeleting(null);
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function readFile(file?: File) {
    if (!file) return;
    if (file.size > 1024 * 1024) return setError('请选择 1 MB 以内的文本文件。');
    if (!/\.(txt|md)$/i.test(file.name)) return setError('支持 .txt 和 .md 文件，也可以直接粘贴内容。');
    setReading(true);
    try {
      const text = await file.text();
      if (text.length > 50000) return setError('资料内容最多 50,000 字，请缩减后导入。');
      if (!text.trim()) return setError('文件内容为空，请重新选择文件或粘贴正文。');
      setName(file.name.slice(0, 150));
      setContent(text);
      setError('');
    } catch {
      setError('文件读取失败，请重新选择文件或直接粘贴内容。');
    } finally {
      setReading(false);
    }
  }

  const closeView = () => replaceKnowledgeHash('#documents');
  return <>
    <PageHeader eyebrow="资料与知识" title="活动资料库" description="集中管理活动要求、场地规则和预算依据，打开原文即可对照提问。"
      action={<Button icon="plus" onClick={openAdd}>添加资料</Button>}/>
    <section className="panel document-panel">
      <div className="panel-heading library-heading">
        <div><h2>全部资料 <span className="library-count">{state.documents.length}</span></h2>
          <p>共 {state.documents.reduce((sum, doc) => sum + doc.content.length, 0).toLocaleString()} 字</p></div>
        <div className="library-search">
          <input type="search" aria-label="查找资料" placeholder="查找资料名称或正文" value={query}
            onChange={event => setQuery(event.target.value)}/>
          {query && <button className="icon-button" aria-label="清除资料搜索" onClick={() => setQuery('')}><Icon name="close" size={16}/></button>}
        </div>
      </div>
      {keyword && <p className="library-results" role="status">找到 {filtered.length} 份匹配资料</p>}
      {filtered.length > 0 ? <div className="document-grid library-grid">{filtered.map(doc =>
        <article className="document-item" key={doc.id}>
          <div className="document-top"><span className="document-icon"><Icon name="documents" size={24}/></span>
            <button className="icon-button" aria-label={`删除${doc.name}`} onClick={() => {setDeleting(doc); setError('');}}><Icon name="trash" size={18}/></button></div>
          <h3>{doc.name}</h3><p>{previewText(doc.content, keyword)}</p>
          <div className="document-meta"><span>{doc.content.length.toLocaleString()} 字</span><time dateTime={doc.created_at}>{doc.created_at.slice(0, 10)}</time></div>
          <button className="document-open" onClick={() => {window.location.hash = `documents/${encodeURIComponent(doc.id)}`;}}>查看原文 <Icon name="arrow" size={17}/></button>
        </article>)}</div> : keyword
        ? <Empty title="没有找到匹配的资料" description="试试场地名称、费用项目或正文中的关键词。" action={<Button variant="secondary" onClick={() => setQuery('')}>清除搜索</Button>}/>
        : <Empty title="从第一份活动资料开始" description="添加场地须知、活动目标或报名规则，问答即可引用这些材料。" action={<Button onClick={openAdd} icon="plus">添加资料</Button>}/>}
    </section>
    {hash === '#documents' && adding && <Modal title="添加活动资料" onClose={() => setAdding(false)}>
      <form id="document-form" onSubmit={save}>
        <input ref={input} hidden type="file" accept=".txt,.md,text/plain,text/markdown" onChange={event => {
          const file = event.target.files?.[0];
          event.target.value = '';
          void readFile(file);
        }}/>
        <button className="file-drop" type="button" disabled={reading || busy} onClick={() => input.current?.click()}>
          <Icon name="documents" size={25}/><strong>{reading ? '正在读取文件…' : '从文件导入'}</strong><span>支持 TXT、Markdown，最大 1 MB</span>
        </button>
        <Field label="资料名称"><input id="document-name" required maxLength={150} placeholder="例如：报告厅使用须知" value={name} onChange={event => setName(event.target.value)}/></Field>
        <Field label="资料内容" hint={`${content.length.toLocaleString()} / 50,000 字`}><textarea id="document-content" required rows={8} maxLength={50000} placeholder="粘贴活动要求、规则和背景信息" value={content} onChange={event => setContent(event.target.value)}/></Field>
        <ErrorBox error={error}/><div className="form-actions">
          <Button type="button" variant="secondary" onClick={() => setAdding(false)}>取消</Button>
          <Button disabled={busy || reading || !name.trim() || !content.trim()}>{busy ? '保存中…' : '加入资料库'}</Button>
        </div>
      </form>
    </Modal>}
    {view && <DocumentReader doc={view} onClose={closeView} onAsk={() => {window.location.hash = `qa/${encodeURIComponent(view.id)}`;}}/>}
    {hash.startsWith('#documents/') && !view && <Modal title="资料已不存在" onClose={closeView}>
      <p className="modal-copy">这份资料可能已被删除。可以返回资料库查找其他来源。</p>
      <div className="form-actions"><Button onClick={closeView}>返回资料库</Button></div>
    </Modal>}
    {hash === '#documents' && deleting && <Modal title="删除这份资料？" onClose={() => setDeleting(null)}>
      <p className="modal-copy">“{deleting.name}”将从资料库移除。当前对话中的引用摘录会保留，后续问答将使用剩余资料。</p>
      <ErrorBox error={error}/><div className="form-actions">
        <Button variant="secondary" onClick={() => setDeleting(null)}>取消</Button>
        <Button variant="danger" disabled={busy} onClick={() => void remove()}>{busy ? '删除中…' : '确认删除'}</Button>
      </div>
    </Modal>}
  </>;
}
