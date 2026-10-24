import {useEffect,useState} from 'react';
import Workspace from './Workspace';
import Landing from './Landing';
import './landing.css';
const isHome=()=>!window.location.hash||window.location.hash==='#home';
export default function App(){
 const [home,setHome]=useState(isHome),[editRequest,setEditRequest]=useState(0);
 useEffect(()=>{const update=()=>{setHome(isHome());window.scrollTo(0,0)};window.addEventListener('hashchange',update);return()=>window.removeEventListener('hashchange',update)},[]);
 useEffect(()=>{if(home)document.title='会务智策 · 让每一场活动，从容发生'},[home]);
 const start=()=>{setHome(false);setEditRequest(v=>v+1);window.location.hash='overview'};
 return <><div hidden={!home}><Landing active={home} onStart={start}/></div><div hidden={home}><Workspace startEditRequest={editRequest}/></div></>;
}
