import {useRef, useSyncExternalStore} from 'react';
import type {KeyboardEvent} from 'react';
import type {Shared} from '../types';
import {PageHeader} from '../components/Common';
import {Generator} from '../components/Generator';
import {Icon} from '../components/Icon';

const tabs = [
  {kind: 'plan', title: '策划方案', description: '把目标、流程与执行要求整理成完整方案。', placeholder: '例如：强调新生友好，互动环节不少于两处。', icon: 'planning'},
  {kind: 'agenda', title: '活动日程', description: '围绕活动时段与场地限制，安排可执行的日程。', placeholder: '例如：14:00 开始，17:00 结束，保留问答时间。', icon: 'clock'},
  {kind: 'risks', title: '风险预案', description: '识别可能影响活动的情况，提前制定应对措施。', placeholder: '例如：重点考虑设备故障、报名人数变化和迟到。', icon: 'review'},
] as const;
type PlanningTab = typeof tabs[number]['kind'];

function readTab(): PlanningTab {
  if (window.location.hash === '#planning/agenda') return 'agenda';
  if (window.location.hash === '#planning/risks') return 'risks';
  return 'plan';
}

function subscribeToRoute(listener: () => void) {
  window.addEventListener('hashchange', listener);
  return () => window.removeEventListener('hashchange', listener);
}

function navigateTab(kind: PlanningTab) {
  if (readTab() !== kind) window.location.hash = kind === 'plan' ? 'planning' : `planning/${kind}`;
}

export function Planning(props: Shared) {
  const tab = useSyncExternalStore(subscribeToRoute, readTab);
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  function switchByKey(event: KeyboardEvent, index: number) {
    let next: number;
    switch (event.key) {
      case 'ArrowRight': next = (index + 1) % tabs.length; break;
      case 'ArrowLeft': next = (index + tabs.length - 1) % tabs.length; break;
      case 'Home': next = 0; break;
      case 'End': next = tabs.length - 1; break;
      default: return;
    }
    event.preventDefault();
    navigateTab(tabs[next].kind);
    refs.current[next]?.focus();
  }

  return <>
    <PageHeader eyebrow="策划与执行" title="把想法整理成可执行方案" description="从完整策划到现场日程，再到风险预案，逐步完善活动安排。"/>
    <div className="tabs" role="tablist" aria-label="策划内容类型">
      {tabs.map((item, index) =>
        <button ref={element => {refs.current[index] = element;}} id={`tab-${item.kind}`} key={item.kind}
          role="tab" aria-selected={tab === item.kind} aria-controls={`panel-${item.kind}`} tabIndex={tab === item.kind ? 0 : -1}
          onClick={() => navigateTab(item.kind)} onKeyDown={event => switchByKey(event, index)}>
          <Icon name={item.icon} size={18}/>{item.title}{props.state.outputs[item.kind] && <span className="tab-dot"/>}
        </button>)}
    </div>
    {tabs.map(item =>
      <div id={`panel-${item.kind}`} role="tabpanel" aria-labelledby={`tab-${item.kind}`} hidden={tab !== item.kind} key={item.kind}>
        <Generator {...props} {...item}/>
      </div>)}
  </>;
}
