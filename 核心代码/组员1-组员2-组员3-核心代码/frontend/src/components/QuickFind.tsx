import {useEffect, useMemo, useRef, useState} from 'react';
import {Modal} from './Common';
import {Icon} from './Icon';
import {navigation} from '../navigation';
import {shortDate} from '../api';
import type {State} from '../types';

type Result = {title: string; detail: string; href: string; icon: string; group: string; search: string};
function buildIndex(state: State): Result[] {
  const pages = [
    ...navigation.map(n => ({title: n.name, detail: n.group, href: '#' + n.page, icon: n.page})),
    {title: '活动日程', detail: '策划方案', href: '#planning/agenda', icon: 'clock'},
    {title: '风险预案', detail: '策划方案', href: '#planning/risks', icon: 'review'},
  ];
  return [
    ...pages.map(p => ({...p, group: '功能', search: p.title + ' ' + p.detail})),
    ...state.documents.map(d => ({
      title: d.name, detail: '查看原文', href: '#documents/' + encodeURIComponent(d.id), icon: 'documents',
      group: '资料', search: d.name + ' ' + d.content,
    })),
    ...state.tasks.map(t => ({
      title: t.title, detail: [t.owner || '待分配', shortDate(t.due)].join(' · '),
      href: '#tasks/' + encodeURIComponent(t.id), icon: 'tasks', group: '任务', search: t.title + ' ' + t.owner,
    })),
  ];
}

const normalize = (s: string) => s.normalize('NFKC').toLocaleLowerCase().trim();

export function QuickFind({state, onClose}: {state: State; onClose: () => void}) {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const choices = useRef<(HTMLAnchorElement | null)[]>([]);
  const items = useMemo(() => buildIndex(state).map(item => ({
    ...item, search: normalize(item.search), normalizedTitle: normalize(item.title),
  })), [state]);
  const terms = normalize(query).split(/\s+/).filter(Boolean);
  const hasQuery = terms.length > 0;
  const matches = hasQuery
    ? items.filter(r => terms.every(word => r.search.includes(word))).sort((a, b) =>
        Number(terms.every(t => b.normalizedTitle.includes(t))) - Number(terms.every(t => a.normalizedTitle.includes(t))))
    : items.filter(r => ['#documents', '#qa', '#tasks', '#budget', '#planning/agenda', '#review'].includes(r.href));
  const activeIndex = Math.min(selected, Math.max(0, matches.length - 1));
  useEffect(() => {input.current?.focus()}, []);
  function move(next: number) {
    if (!matches.length) return;
    const index = (next + matches.length) % matches.length;
    setSelected(index);
    choices.current[index]?.scrollIntoView({block: 'nearest'});
  }
  return <Modal title="查找活动内容" onClose={onClose}>
    <div className="find-input">
      <Icon name="search" size={20}/>
      <input ref={input} aria-label="查找功能、资料或任务" role="combobox" aria-expanded="true"
        aria-autocomplete="list" aria-controls="find-results" aria-activedescendant={matches.length ? 'find-result-' + activeIndex : undefined}
        placeholder="搜索功能、资料原文、任务或负责人" value={query}
        onChange={e => {setQuery(e.target.value); setSelected(0); document.getElementById('find-results')?.scrollTo(0, 0)}}
        onKeyDown={e => {
          if (e.nativeEvent.isComposing) return;
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault(); move(activeIndex + (e.key === 'ArrowDown' ? 1 : -1));
          } else if (e.key === 'Enter' && matches.length) {
            e.preventDefault(); choices.current[activeIndex]?.click();
          }
        }}/>
    </div>
    <p className="find-count" role="status">{hasQuery ? '找到 ' + matches.length + ' 项' : '常用入口'}</p>
    <div role="listbox" id="find-results" className="find-results" aria-label="查找结果">
      {matches.map((r, i) => <a key={r.href} ref={el => {choices.current[i] = el}} href={r.href}
        role="option" aria-selected={i === activeIndex} id={'find-result-' + i} tabIndex={-1}
        className={'find-option' + (i === activeIndex ? ' selected' : '')}
        onClick={() => {onClose()}}>
        <Icon name={r.icon}/><span><strong>{r.title}</strong><small>{r.detail}</small></span><em>{r.group}</em>
      </a>)}
    </div>
    {hasQuery && matches.length === 0 && <p className="find-empty">试试资料名称、原文关键词或任务负责人。</p>}
    <p className="find-keys"><kbd>↑</kbd><kbd>↓</kbd> 选择 <kbd>Enter</kbd> 打开 <kbd>Esc</kbd> 关闭</p>
  </Modal>;
}
