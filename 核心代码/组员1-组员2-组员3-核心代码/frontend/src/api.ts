export async function api<T>(path:string,body?:unknown,method?:string):Promise<T>{
  const controller=new AbortController();
  const timer=window.setTimeout(()=>controller.abort(),path.includes('/generate')||path.includes('/ask')?180000:20000);
  try {
    const response=await fetch(path,{method:method||(body===undefined?'GET':'POST'),headers:body===undefined?undefined:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal:controller.signal});
    const value=await response.json();
    if(!response.ok)throw new Error(value.error||`请求失败（${response.status}）`);
    return value as T;
  } catch(e){if(e instanceof DOMException&&e.name==='AbortError')throw new Error('请求超时，请稍后重试。');throw e;}finally{clearTimeout(timer);}
}
export const money=(v:number)=>new Intl.NumberFormat('zh-CN',{style:'currency',currency:'CNY',maximumFractionDigits:2}).format(v);
export const shortDate=(v:string)=>v?new Date(`${v.slice(0,10)}T12:00:00`).toLocaleDateString('zh-CN',{month:'long',day:'numeric'}):'待安排';
