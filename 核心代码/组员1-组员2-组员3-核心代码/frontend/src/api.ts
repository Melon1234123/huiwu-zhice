import type {State} from './types';

export type Snapshot = {state: State; revision: number};
export class ApiError extends Error {
  constructor(message: string, public readonly status: number, public readonly snapshot?: Snapshot) {
    super(message);
  }
}

async function request<T>(path: string, body?: unknown, method?: string) {
  const controller = new AbortController();
  const timeout = path.includes('/generate') || path.includes('/ask') ? 180000 : 20000;
  const timer = window.setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(path, {
      method: method || (body === undefined ? 'GET' : 'POST'),
      headers: body === undefined ? undefined : {'Content-Type': 'application/json'},
      body: body === undefined ? undefined : JSON.stringify(body), signal: controller.signal,
    });
    const value = await response.json();
    const revision = Number(response.headers.get('X-Workspace-Revision') || 0);
    if (!response.ok) {
      const snapshot = response.status === 409 && value.state ? {state: value.state as State, revision} : undefined;
      throw new ApiError(value.error || `请求失败（${response.status}）`, response.status, snapshot);
    }
    return {value: value as T, revision};
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') throw new Error('请求超时，请稍后重试。');
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

export async function apiSnapshot(path: string, body?: unknown, method?: string): Promise<Snapshot> {
  const {value, revision} = await request<State>(path, body, method);
  return {state: value, revision};
}

export async function api<T>(path: string, body?: unknown, method?: string): Promise<T> {
  return (await request<T>(path, body, method)).value;
}

export const money=(v:number)=>new Intl.NumberFormat('zh-CN',{style:'currency',currency:'CNY',maximumFractionDigits:2}).format(v);
export const shortDate=(v:string)=>v?new Date(`${v.slice(0,10)}T12:00:00`).toLocaleDateString('zh-CN',{month:'long',day:'numeric'}):'待安排';
