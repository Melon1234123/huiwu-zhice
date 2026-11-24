import {useCallback, useEffect, useRef, useState} from 'react';
import Workspace from './Workspace';
import Landing from './Landing';
import {ApiError, apiSnapshot, type Snapshot} from './api';
import {currentPage, navigation} from './navigation';
import type {Change, State} from './types';
import './landing.css';

const isHome = () => !window.location.hash || window.location.hash === '#home';

export default function App() {
  const [home, setHome] = useState(isHome);
  const [paused, setPaused] = useState(false);
  const [visitedWorkspace, setVisitedWorkspace] = useState(() => !isHome());
  const [editRequest, setEditRequest] = useState(0);
  const [state, setState] = useState<State | null>(null);
  const [loadError, setLoadError] = useState('');
  const readAttempt = useRef(0);
  const latestRevision = useRef(-1);
  const pendingRead = useRef<Promise<Snapshot> | null>(null);

  const apply = useCallback((snapshot: Snapshot) => {
    // Responses can arrive out of order when two pages save in the same tab.
    if (snapshot.revision < latestRevision.current) return;
    latestRevision.current = snapshot.revision;
    setState(snapshot.state);
    setLoadError('');
  }, []);

  const refresh = useCallback(async () => {
    const request = ++readAttempt.current;
    setLoadError('');
    const read = pendingRead.current ??= apiSnapshot('/api/state');
    try {
      const fresh = await read;
      if (request === readAttempt.current) apply(fresh);
    } catch (error) {
      if (request === readAttempt.current) setLoadError((error as Error).message);
    } finally {
      if (pendingRead.current === read) pendingRead.current = null;
    }
  }, [apply]);
  const change: Change = useCallback(async (path, body, method) => {
    try {
      const snapshot = await apiSnapshot(path, body, method);
      apply(snapshot);
      return snapshot.state;
    } catch (error) {
      if (error instanceof ApiError && error.snapshot) apply(error.snapshot);
      throw error;
    }
  }, [apply]);

  useEffect(() => {
    void refresh();
    const route = () => {
      const landing = isHome();
      setHome(landing);
      if (!landing) setVisitedWorkspace(true);
      const name = navigation.find(item => item.page === currentPage())?.name;
      document.title = landing ? '会务智策 · AI 活动运营工作台' : name + ' · 会务智策';
      window.scrollTo(0, 0);
    };
    route();
    window.addEventListener('hashchange', route);
    return () => {window.removeEventListener('hashchange', route); readAttempt.current++};
  }, [refresh]);

  const consumeEdit = useCallback(() => setEditRequest(0), []);
  function start() {
    setVisitedWorkspace(true);
    setEditRequest(n => n + 1);
    window.location.hash = 'overview';
  }
  return <>
    {home && <Landing paused={paused} setPaused={setPaused} state={state} error={loadError} active={home} onStart={start}/>}
    {visitedWorkspace && <div hidden={home}><Workspace
      active={!home} state={state} error={loadError} refresh={refresh} change={change}
      startEditRequest={editRequest} consumeEdit={consumeEdit}/></div>}
  </>;
}
