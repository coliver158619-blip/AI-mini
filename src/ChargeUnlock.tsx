import {useEffect,useRef,useState} from 'react';
import {ArrowLeft,Shirt,AudioLines,Music2,Heart,Star,Crown,Gift,PersonStanding,LoaderCircle} from 'lucide-react';
import './charge-unlock.css';

type Stage={name:string;value:number;benefit:string};
export default function ChargeUnlock({stage,index,claimed,onAccept,onClose}:{stage:Stage;index:number;claimed:boolean;onAccept:()=>Promise<void>;onClose:()=>void}) {
 const dialog=useRef<HTMLDialogElement>(null);
 const [replay,setReplay]=useState(0),[saving,setSaving]=useState(false),[error,setError]=useState('');
 const busy=useRef(false);
 async function accept(){if(busy.current)return;if(claimed){onClose();return}busy.current=true;setSaving(true);setError('');try{await onAccept()}catch(cause){setError(cause instanceof Error?cause.message:'领取暂时没成功，请重试')}finally{busy.current=false;setSaving(false)}}
 useEffect(()=>{const element=dialog.current; element?.showModal(); return()=>element?.close()},[]);
 return <dialog ref={dialog} className={`charge-unlock unlock-stage-${index}`} aria-labelledby="unlock-title" onCancel={event=>{event.preventDefault();if(!busy.current)onClose()}}>
  <div className="unlock-content">
   <header className="unlock-header"><button autoFocus disabled={saving} onClick={onClose} aria-label="返回听歌充电"><ArrowLeft size={22}/></button><span>礼盒解锁</span><span/></header>
   <div className="unlock-heading"><h1 id="unlock-title">{stage.name}</h1><p>{stage.value} 电量已达成</p><div className="unlock-dots" aria-label={`第 ${index+1} 阶段`}>{[0,1,2,3].map(i=><i key={i} className={i===index?'is-current':''}/>)}</div></div>
   <div className="unlock-art" key={`${index}-${replay}`} aria-hidden="true">
    <div className="unlock-aura"/>
    {index===1&&<><i className="unlock-ribbon ribbon-left"/><i className="unlock-ribbon ribbon-right"/></>}
    {index===2&&<><i className="unlock-orbit orbit-one"/><i className="unlock-orbit orbit-two"/></>}
    {index===3&&<Heart className="unlock-heart" strokeWidth={1}/>}
    <div className="unlock-reward">{index===1?<div className="unlock-ticket"><Crown/><b>1 天</b></div>:index===3?<div className="unlock-stars">{[0,1,2,3,4].map(i=><Star key={i} fill="currentColor"/>)}</div>:<><Shirt className="unlock-shirt"/><span className="unlock-voice"><AudioLines/></span></>}</div>
    <svg className="unlock-gift" viewBox="0 0 320 350">
     <defs>
      <linearGradient id="unlock-front" x2="100%" y2="100%"><stop stopColor="#e4c9ff"/><stop offset=".4" stopColor="#b68af5"/><stop offset="1" stopColor="#9463dd"/></linearGradient>
      <linearGradient id="unlock-side" x2="100%" y2="20%"><stop stopColor="#9f6ce5"/><stop offset=".6" stopColor="#c59cfa"/><stop offset="1" stopColor="#b17aee"/></linearGradient>
      <linearGradient id="unlock-top" x2="10%" y2="100%"><stop stopColor="#f5e8ff"/><stop offset="1" stopColor="#c49df2"/></linearGradient>
      <linearGradient id="unlock-silk" x2="100%" y2="100%"><stop stopColor="#fff"/><stop offset=".5" stopColor="#f5dffc"/><stop offset="1" stopColor="#d9baee"/></linearGradient>
      <radialGradient id="unlock-light"><stop stopColor="white"/><stop offset="1" stopColor="#fff" stopOpacity="0"/></radialGradient>
     </defs>
     <ellipse cx="164" cy="322" rx="119" ry="14" fill="#b18ada" opacity=".14"/>
     <g className="unlock-box">
      <path d="M37 204 151 170 282 204 167 245Z" fill="#c9a0f3" stroke="#f6e5ff" strokeWidth="3"/>
      <path d="M37 204 167 241 167 324 51 293Q37 289 37 274Z" fill="url(#unlock-front)" stroke="#dfc2ff" strokeWidth="1.5"/>
      <path d="M167 241 282 204 282 276Q282 290 270 294L167 324Z" fill="url(#unlock-side)" stroke="#d5b7f7" strokeWidth="1.5"/>
      <path d="M83 217 110 225 110 308 83 301Z M213 226 239 217 239 303 213 311Z" fill="url(#unlock-silk)" stroke="#fff" strokeOpacity=".7"/>
      <path d="m43 209 119 34v74" fill="none" stroke="#f7e4ff" strokeWidth="2" strokeOpacity=".65"/>
     </g>
     <ellipse className="unlock-box-light" cx="158" cy="206" rx="117" ry="55" fill="url(#unlock-light)"/>
     <g className="unlock-lid">
      <path d="M29 181 151 148 291 183 166 225Z" fill="url(#unlock-top)" stroke="#f9edff" strokeWidth="2"/>
      <path d="M29 181 166 220 166 247 36 212Q29 210 29 202Z" fill="url(#unlock-front)" stroke="#e9d3ff" strokeWidth="2"/>
      <path d="M166 220 291 183 291 206Q291 212 283 215L166 247Z" fill="url(#unlock-side)" stroke="#e4c9ff" strokeWidth="2"/>
      <path d="M80 196 107 204 235 169 206 162Z" fill="url(#unlock-silk)"/>
      <path d="M80 196 107 204 107 231 80 224Z M218 204 245 196 245 227 218 235Z" fill="url(#unlock-silk)" stroke="#fff" strokeOpacity=".7"/>
      <path d="M158 178C121 115 66 118 77 151c8 26 55 35 81 27Z" fill="url(#unlock-silk)" stroke="#f7eaff" strokeWidth="2"/>
      <path d="M151 177c-21-33-49-44-58-31 13 12 33 20 58 31Z" fill="#bd96e9"/>
      <path d="M157 176c1-61 41-81 50-51 10 32-25 54-50 51Z" fill="url(#unlock-silk)" stroke="#fcf3ff" strokeWidth="2"/>
      <path d="M162 167c6-26 20-40 31-34-1 14-11 25-31 34Z" fill="#c59bed"/>
      <path d="M150 165q13-8 23 8l-7 15-22-7Z" fill="url(#unlock-silk)" stroke="#f3dfff"/>
     </g>
    </svg>
    <div className="unlock-particles">{[0,1,2,3,4,5].map(i=><span key={i} style={{'--particle':i} as React.CSSProperties}>{index===2?<Music2/>:<Star fill="currentColor"/>}</span>)}</div>
   </div>
   <section className={`unlock-benefit${index===3?' unlock-benefit-complete':''}`}><h2><Gift size={24}/>本阶段权益</h2>
    {index===1?<><div className="unlock-member"><Crown/><b>一天免费会员</b></div><small>会员权益为 Demo 展示</small></>:index===3?<p>全套换装 · 动作 · 语音</p>:<div className="unlock-benefit-grid"><div><Shirt/><span>人物换装</span></div><div><PersonStanding/><span>更多动作</span></div><div><AudioLines/><span>语音</span></div></div>}
   </section>
   <footer className="unlock-actions">{error&&<p className="unlock-error" role="alert">{error}</p>}<button className="unlock-accept" disabled={saving} onClick={()=>void accept()}>{saving?<><LoaderCircle size={19} className="spin"/>正在收下…</>:claimed?'已收下，返回':'收下这份惊喜'}</button><button className="unlock-replay" disabled={saving} onClick={()=>setReplay(value=>value+1)}>重播动画</button></footer>
  </div>
 </dialog>;
}
