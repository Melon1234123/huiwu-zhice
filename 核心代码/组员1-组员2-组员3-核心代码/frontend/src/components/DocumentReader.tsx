import {useEffect, useRef, useSyncExternalStore} from 'react';
import type {Document} from '../types';
import {Button, Modal} from './Common';
import '../pages/knowledge.css';

const subscribeHash = (listener: () => void) => {
  window.addEventListener('hashchange', listener);
  return () => window.removeEventListener('hashchange', listener);
};

export function useKnowledgeHash() {
  return useSyncExternalStore(subscribeHash, () => window.location.hash);
}

export function replaceKnowledgeHash(hash: string) {
  const oldURL = window.location.href;
  window.history.replaceState(window.history.state, '', hash);
  window.dispatchEvent(new HashChangeEvent('hashchange', {oldURL, newURL: window.location.href}));
}

function excerptRange(text: string, excerpt: string) {
  const exact = text.indexOf(excerpt);
  if (exact >= 0) return [exact, exact + excerpt.length];

  // Retrieval joins paragraphs, so a citation can omit original line breaks.
  const needle = excerpt.replace(/\s/g, '');
  if (!needle) return null;
  const offset = text.replace(/\s/g, '').indexOf(needle);
  if (offset < 0) return null;
  let seen = 0;
  let start = 0;
  for (let index = 0; index < text.length; index++) {
    if (/\s/.test(text[index])) continue;
    if (seen === offset) start = index;
    if (++seen === offset + needle.length) return [start, index + 1];
  }
  return null;
}

export function DocumentReader({doc, excerpt, onClose, onAsk}: {
  doc: Document;
  excerpt?: string;
  onClose: () => void;
  onAsk?: () => void;
}) {
  const match = excerpt ? excerptRange(doc.content, excerpt) : null;
  const highlighted = useRef<HTMLElement>(null);
  useEffect(() => {
    highlighted.current?.scrollIntoView({block: 'center'});
  }, [doc.id, excerpt]);

  return <Modal title={doc.name} onClose={onClose}>
    <div className="reader-meta">
      <span>资料原文</span><span>{doc.content.length.toLocaleString()} 字</span>
      <time dateTime={doc.created_at}>{doc.created_at.slice(0, 10)}</time>
    </div>
    {excerpt && <p className="reader-caption">{match ? '已标出本条引用，可上下滚动查看前后文。' : '下方显示当前资料全文。'}</p>}
    <div className="source-content knowledge-reader" tabIndex={0} aria-label="资料全文">
      {match ? <>{doc.content.slice(0, match[0])}<mark ref={highlighted}>{doc.content.slice(match[0], match[1])}</mark>{doc.content.slice(match[1])}</> : doc.content}
    </div>
    <div className="form-actions">
      <Button id="document-close" variant="secondary" onClick={onClose}>关闭原文</Button>
      {onAsk && <Button icon="qa" onClick={onAsk}>对照资料提问</Button>}
    </div>
  </Modal>;
}
