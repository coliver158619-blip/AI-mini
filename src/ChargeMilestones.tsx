import {useEffect,useState} from 'react';
import {api,post} from './api';
import ChargeUnlock from './ChargeUnlock';

export const chargeStages=[
 {name:'初次见面',value:0,benefit:'解锁人物换装 & 更多动作 & 语音'},
 {name:'渐渐熟悉',value:400,benefit:'解锁一天免费会员'},
 {name:'默契搭子',value:800,benefit:'解锁人物换装 & 更多动作 & 语音'},
 {name:'心有灵犀',value:1600,benefit:'解锁全套换装、动作、语音'},
];
export default function ChargeMilestones({value,max,scope='total',label='陪伴电量进度'}:{value:number|undefined;max:number;scope?:string;label?:string}) {
 const [claimed,setClaimed]=useState<number[]|null>(null),[pending,setPending]=useState<number|null>(null);
 const [error,setError]=useState(''),[retry,setRetry]=useState(0);
 useEffect(()=>{
  const controller=new AbortController();setClaimed(null);setError('');setPending(null);
  api<{claimed:number[]}>(`/api/charge/rewards/${scope}`,{signal:controller.signal})
   .then(result=>{if(!controller.signal.aborted)setClaimed(result.claimed)})
   .catch(cause=>{if(!controller.signal.aborted)setError(cause.message)});
  return()=>controller.abort();
 },[scope,retry]);
 async function accept(stage:number){
  const result=await post<{claimed:number[]}>(`/api/charge/rewards/${scope}`,{stage});
  setClaimed(result.claimed);setPending(null);
 }
 return <div className="charge-growth">
  <div className="relationship-progress" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={max} aria-valuenow={value===undefined?undefined:Math.min(max,value)}><span style={{width:`${Math.min(100,(value??0)/max*100)}%`}}/></div>
  <div className="charge-milestones">{chargeStages.map((stage,i)=>{
   const reached=value!==undefined&&value>=stage.value;
   const opened=claimed?.includes(stage.value)??false;
   const ready=reached&&!opened&&claimed!==null;
   return <div className={`charge-milestone${reached?' is-reached':''}${opened?' is-opened':ready?' is-ready':''}`} key={stage.name}>
    <button onClick={()=>{if((reached||opened)&&claimed!==null)setPending(i)}} aria-disabled={(!reached&&!opened)||claimed===null} aria-label={`${stage.name}，${stage.value} 电量，${opened?'已领取':reached?'已达成，待领取':'未达成'}，${stage.benefit}`} aria-describedby={`charge-benefit-${i}`}><svg viewBox="0 0 48 48" aria-hidden="true"><path className="gift-box" d="M9 24h30v19H9z"/><path d="M23 24h3v19" stroke="white" strokeWidth="3"/><g className="gift-lid"><path d="M6 17h36v9H6z"/><path d="M24 17c-17 1-16-14-7-10 4 2 7 10 7 10Zm0 0c17 1 16-14 7-10-4 2-7 10-7 10Z" fill="none" stroke="currentColor" strokeWidth="3"/><path d="M24 17v9" stroke="white" strokeWidth="3"/></g>{opened&&<path className="gift-spark" d="m24 13 2 4 5 1-4 3 1 5-4-3-4 3 1-5-4-3 5-1Z"/>}</svg><span>{stage.name}</span><small>{stage.value} 电量</small></button>
    <div className="charge-benefit" role="tooltip" id={`charge-benefit-${i}`}><b>{opened?'已领取':reached?'已达成 · 点击解锁':'待达成'} · {stage.name}</b><span>{stage.benefit}</span>{i===1&&<small>会员权益为 Demo 展示</small>}</div>
   </div>;
  })}</div>
  {error&&<div className="charge-claim-error" role="alert">{error}<button onClick={()=>setRetry(n=>n+1)}>重试领取状态</button></div>}
  {pending!==null&&<ChargeUnlock stage={chargeStages[pending]} index={pending} claimed={claimed?.includes(chargeStages[pending].value)??false} onAccept={()=>accept(chargeStages[pending].value)} onClose={()=>setPending(null)}/>}
 </div>;
}
