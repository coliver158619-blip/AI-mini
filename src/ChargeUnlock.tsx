import {useEffect,useRef,useState} from 'react';
import {ArrowLeft,Shirt,AudioLines,Music2,Heart,Star,Crown,Gift} from 'lucide-react';
import './charge-unlock.css';

type Stage={name:string;value:number;benefit:string};
export default function ChargeUnlock({stage,index,onClose}:{stage:Stage;index:number;onClose:()=>void}) {
 const dialog=useRef<HTMLDialogElement>(null);
 const [replay,setReplay]=useState(0);
 useEffect(()=>{const element=dialog.current; element?.showModal(); return()=>element?.close()},[]);
 return <dialog ref={dialog} className={`charge-unlock unlock-stage-${index}`} aria-labelledby="unlock-title" onCancel={event=>{event.preventDefault();onClose()}}>
  <div className="unlock-content">
   <header className="unlock-header"><button autoFocus onClick={onClose} aria-label="返回听歌充电"><ArrowLeft size={22}/></button><span>礼盒解锁</span><span/></header>
   <div className="unlock-heading"><h1 id="unlock-title">{stage.name}</h1><p>{stage.value} 电量已达成</p><div className="unlock-dots" aria-label={`第 ${index+1} 阶段`}>{[0,1,2,3].map(i=><i key={i} className={i===index?'is-current':''}/>)}</div></div>
   <div className="unlock-art" key={`${index}-${replay}`} aria-hidden="true">
    <div className="unlock-aura"/>
    {index===1&&<><i className="unlock-ribbon ribbon-left"/><i className="unlock-ribbon ribbon-right"/></>}
    {index===2&&<><i className="unlock-orbit orbit-one"/><i className="unlock-orbit orbit-two"/></>}
    {index===3&&<Heart className="unlock-heart" strokeWidth={1}/>}
    <div className="unlock-reward">{index===1?<div className="unlock-ticket"><Crown/><b>1 天</b></div>:index===3?<div className="unlock-stars">{[0,1,2,3].map(i=><Star key={i} fill="currentColor"/>)}</div>:<><Shirt className="unlock-shirt"/><AudioLines className="unlock-voice"/></>}</div>
    <svg className="unlock-gift" viewBox="0 0 240 250"><defs><linearGradient id="unlock-box-fill" x2="1" y2="1"><stop stopColor="#c7a7fa"/><stop offset="1" stopColor="#9466e4"/></linearGradient></defs><g className="unlock-box"><rect x="43" y="148" width="154" height="92" rx="12" fill="url(#unlock-box-fill)"/><path d="M111 148h20v92h-20z" fill="#f9f1ff"/><path d="M52 155h136" stroke="#e6d4ff" strokeWidth="3"/></g><g className="unlock-lid"><rect x="34" y="124" width="172" height="31" rx="8" fill="url(#unlock-box-fill)"/><path d="M111 124h20v31h-20z" fill="#fff5ff"/><path d="M120 125C35 121 68 66 94 91c17 16 26 34 26 34Zm0 0c85-4 52-59 26-34-17 16-26 34-26 34Z" fill="none" stroke="#bd99ee" strokeWidth="11"/></g></svg>
    <div className="unlock-particles">{[0,1,2,3,4,5].map(i=><span key={i} style={{'--particle':i} as React.CSSProperties}>{index===2?<Music2/>:<Star fill="currentColor"/>}</span>)}</div>
   </div>
   <section className="unlock-benefit"><h2><Gift size={20}/>本阶段权益</h2><p>{stage.benefit.replaceAll(' & ',' · ')}</p>{index===1&&<small>会员权益为 Demo 展示</small>}</section>
   <footer className="unlock-actions"><button className="unlock-accept" onClick={onClose}>收下这份惊喜</button><button className="unlock-replay" onClick={()=>setReplay(value=>value+1)}>重播动画</button></footer>
  </div>
 </dialog>;
}
