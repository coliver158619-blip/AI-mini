import {useEffect,useRef,useState} from 'react';
import {ArrowLeft,ArrowUpRight,BookHeart,Music2,Share2,Shirt,Zap,Check,MessageCircle} from 'lucide-react';
import type {Profile,Song} from './types';
import CharacterVisual from './CharacterVisual';
import StarWheel,{stars} from './StarWheel';
import ChargeMilestones,{chargeStages} from './ChargeMilestones';
import {api,post} from './api';
import {relationshipPreview} from './relationship-preview';
import './relationship-pages.css';

type StarStats={id:string;name:string;seconds:number;minutes:number;energy?:number;songs:number;diaries:number;isDemo:boolean};
type Props={profile:Profile;starMode:boolean;artistId:string;onMode:()=>void;onArtist:(id:string)=>void;onStarEnergy:(value:{artistId:string;energy:number|undefined})=>void;onBack:()=>void;onAppearance:()=>void;onDiary:(artistId?:string)=>void;onListen:(songs?:Song[],artist?:string)=>void;onChat:()=>void;onProfile:(profile:Profile)=>void;onNotice:(message:string)=>void};
export default function SparkPage({profile,starMode,artistId,onMode,onArtist,onStarEnergy,onBack,onAppearance,onDiary,onListen,onChat,onProfile,onNotice}:Props){
 const [stats,setStats]=useState<{artists:StarStats[];catalog:Record<string,Song[]>}|null>(null),[error,setError]=useState(''),[retry,setRetry]=useState(0);
 const [week,setWeek]=useState<{minutes:number;activeDays:number;favoriteCount:number}|null>(relationshipPreview?.week.summary??null);
 const [feeding,setFeeding]=useState(false),[reaction,setReaction]=useState(0);
 const heading=useRef<HTMLHeadingElement>(null);
 useEffect(()=>{heading.current?.focus()},[]);
 useEffect(()=>{const controller=new AbortController();setError('');
  Promise.all([api<typeof stats>('/api/charge/artists',{signal:controller.signal}),relationshipPreview?Promise.resolve({summary:relationshipPreview.week.summary}):api<{summary:NonNullable<typeof week>}>('/api/reports?period=week',{signal:controller.signal})])
   .then(([result,report])=>{if(!controller.signal.aborted){setStats(result);setWeek(report.summary)}})
   .catch(cause=>{if(!controller.signal.aborted)setError(cause.message)});
  return()=>controller.abort();
 },[profile,retry]);
 const artist=stars.find(s=>s.id===artistId)!,selected=stats?.artists.find(s=>s.id===artistId);
 const starEnergy=selected?.energy??(typeof selected?.seconds==='number'?Math.floor(selected.seconds/3600):undefined);
 useEffect(()=>{onStarEnergy({artistId,energy:starEnergy})},[artistId,starEnergy,onStarEnergy]);
 const value=starMode?starEnergy:profile.energy;
 const nextStage=chargeStages.find(stage=>stage.value>(value??0));
 const listen=()=>starMode?onListen(stats?.catalog[artistId]??[],artist.name):onListen();
 const diary=()=>onDiary(starMode?artistId:undefined);
 async function share(){
  const url=new URL(location.href);url.hash='/spark';
  const text=starMode?`我听了 ${artist.name} 的歌 ${selected?.minutes??0} 分钟，让喜欢继续充电。`:`和${profile.name}相伴 ${profile.days} 天，陪伴电量 ${profile.energy}。一起听，让旋律继续。`;
  try{if(navigator.share)await navigator.share({title:'听歌充电',text,url:url.href});else{await navigator.clipboard.writeText(`${text}\n${url.href}`);onNotice('充电链接已复制，可以分享给朋友啦')}}
  catch(cause){if(!(cause instanceof DOMException&&cause.name==='AbortError'))onNotice('暂时没能分享，请稍后再试')}
 }
 async function feed(){if(feeding||profile.fedToday)return;setFeeding(true);try{const r=await post<{profile:Profile;message:string}>('/api/feed',{});onProfile(r.profile);onNotice(r.message)}catch(e){onNotice(e instanceof Error?e.message:'点心暂时没送到')}finally{setFeeding(false)}}
 return <main className="relationship-page spark-page"><div className="relationship-content">
  <header className="relationship-header"><button onClick={onBack} aria-label="返回音乐小屋"><ArrowLeft size={21}/></button><h1 ref={heading} tabIndex={-1}>听歌充电</h1><button className="charge-share" aria-label="分享听歌充电" onClick={()=>void share()}><Share2 size={20}/></button></header>
  <section className="spark-hero"><span className="relationship-eyebrow"><Music2 size={14}/>喜欢的旋律，给每天充电</span><h2>和 {artist.name} 的音乐同频</h2>
   <div className="star-charge-scene"><StarWheel value={artistId} onChange={onArtist}/><span className="star-charge-note" aria-hidden="true">♫</span><button className="star-charge-companion" onClick={()=>setReaction(n=>n+1)} aria-label={`和${profile.name}打招呼`}><CharacterVisual key={profile.appearance.id} id={profile.appearance.id} src={profile.appearance.imageUrl} alt="你的当前音乐搭子" animated reaction={reaction}/></button></div>
   <p>停在哪一位，就看看属于这段音乐的回忆</p>
  </section>
  <section className="relationship-card spark-score" aria-label={starMode?'明星电量值':'电量值'}><div className="relationship-card-heading"><button className="charge-mode-toggle" onClick={onMode} aria-label={starMode?'明星电量值，点击切换电量值':'电量值，点击切换明星电量值'}><Zap size={19}/>{starMode?'明星电量值':'电量值'}</button><small>{starMode?artist.name:'我们的成长进度'}</small></div>
   <div className="spark-number"><strong>{value??'—'}</strong><span>{starMode?'点明星电量':`/ ${profile.energyMax} 电量`}</span><Zap size={52} fill="currentColor"/></div>
   <ChargeMilestones key={starMode?artistId:'total'} scope={starMode?artistId:'total'} value={value} max={profile.energyMax} label={starMode?'明星电量进度':'陪伴电量进度'}/>
   <p className="relationship-progress-caption">{starMode ? value===undefined ? '累计听歌满 60 分钟，获得 1 点明星电量' : nextStage ? `60 分钟 = 1 点；再积累 ${nextStage.value-value} 点，解锁「${nextStage.name}」` : '明星电量已满格，点击礼盒领取四阶段权益' : profile.energy>=profile.energyMax?'陪伴满格啦，继续收藏我们的日常吧':`还有 ${profile.energyMax-profile.energy} 点电量，就能让陪伴满格`}</p>
   {error?<div className="relationship-error" role="alert">{error}<button onClick={()=>setRetry(n=>n+1)}>重新加载</button></div>:starMode?<div className="relationship-stats"><div><strong>{selected?.minutes??'—'}<small> 分钟</small></strong><span>听歌时长</span></div><div><strong>{selected?.songs??'—'}<small> 首</small></strong><span>听过的歌</span></div><div><strong>{selected?.diaries??'—'}<small> 篇</small></strong><span>专属日记</span></div></div>:<div className="relationship-stats"><div><strong>{week?.minutes??'—'}<small> 分钟</small></strong><span>本周听歌相伴</span></div><div><strong>{week?.activeDays??'—'}<small> 天</small></strong><span>来听过音乐</span></div><div><strong>{week?.favoriteCount??'—'}<small> 首</small></strong><span>新收藏的歌</span></div></div>}
  </section>
  <div className="relationship-actions"><button className="relationship-primary" onClick={onAppearance}><Shirt size={19}/>形象<ArrowUpRight size={17}/></button></div>
  <div className="relationship-links"><button onClick={diary}><BookHeart/><span><b>专属日记</b><small>{starMode?`记下听 ${artist.name} 时的心情`:'写下两人的共同经历'}</small></span><ArrowUpRight size={17}/></button></div>
  <section className="charge-tasks relationship-card" aria-label="充电任务">
   <div className="charge-task-wallet"><span><Zap size={18} fill="currentColor"/>当前电量 <b>{value??'—'}</b></span><button onClick={onAppearance}>查看电量权益<ArrowUpRight size={15}/></button></div>
   <h2>让喜欢，为陪伴充电</h2><p className="charge-task-note">听喜欢的音乐，留住每一次心动。</p>
   <div className="charge-task"><span className="charge-reward"><Zap fill="currentColor"/><b>+</b></span><div><h3>{starMode?`听听 ${artist.name} 的歌`:'听一首喜欢的歌'}</h3><p>{starMode?'累计听满 60 分钟，增加 1 点明星电量':'播放时自动累积陪伴电量'}</p></div><button onClick={listen} disabled={starMode&&!stats}>去听歌</button></div>
   <div className="charge-task"><span className="charge-reward pink"><BookHeart/></span><div><h3>写一篇专属日记</h3><p>把喜欢的旋律，写进今天的回忆</p></div><button onClick={diary}>去记录</button></div>
   <div className="charge-task"><span className="charge-reward purple"><Shirt/></span><div><h3>解锁喜欢的装扮</h3><p>看看为你准备的电量权益</p></div><button onClick={onAppearance}>去看看</button></div>
  </section>
  {!starMode&&<><div className="relationship-links"><button onClick={onChat}><MessageCircle/><span><b>聊聊今天</b><small>开心和烦恼，都可以说给我听</small></span><ArrowUpRight size={17}/></button></div><button className="relationship-primary personal-feed" disabled={feeding||profile.fedToday} onClick={()=>void feed()}>{profile.fedToday?<Check size={18}/>:<Zap size={18}/>} {feeding?'正在送出点心…':profile.fedToday?'今天的点心，已经收到啦':'送搭子一份点心 · +40 电量'}</button></>}
  <details className="relationship-rules"><summary>电量怎么积累？</summary><p>{starMode?'明星电量 = 累计听该歌手的分钟数 ÷ 60，向下取整；不足 60 分钟的部分保留累计。重复听歌累积时长，歌曲数量按听过的歌曲去重，每位明星的专属日记单独保存。':'陪伴电量沿用原来的成长进度，听歌与每日点心继续累计，换装不会清空已有电量。礼盒依次在 0、400、800、1600 电量达成，悬浮或轻点查看权益。'}</p></details>
 </div></main>;
}
