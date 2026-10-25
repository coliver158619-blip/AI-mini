import {useEffect,useRef,useState} from 'react';
import {ArrowLeft,ArrowUpRight,BookHeart,Check,Headphones,MessageCircle,Zap} from 'lucide-react';
import CharacterVisual from './CharacterVisual';
import {api,post} from './api';
import {relationshipPreview} from './relationship-preview';
import type {Profile} from './types';
import './relationship-pages.css';
type Week={isDemo:boolean;summary:{minutes:number;activeDays:number;favoriteCount:number}};
type Props={profile:Profile;onBack:()=>void;onProfile:(profile:Profile)=>void;onNotice:(message:string)=>void;onChat:()=>void;onListen:()=>void;onDiary:()=>void};
export default function CompanionEnergy({profile,onBack,onProfile,onNotice,onChat,onListen,onDiary}:Props){
 const [week,setWeek]=useState<Week|null>(relationshipPreview?.week ?? null),[error,setError]=useState(''),[retry,setRetry]=useState(0),[feeding,setFeeding]=useState(false),[reaction,setReaction]=useState(0);
 const busy=useRef(false),heading=useRef<HTMLHeadingElement>(null);
 useEffect(()=>{heading.current?.focus()},[]);
 useEffect(()=>{if(relationshipPreview)return;const controller=new AbortController();setError('');api<Week>('/api/reports?period=week',{signal:controller.signal}).then(result=>{if(!controller.signal.aborted)setWeek(result)}).catch(cause=>{if(!controller.signal.aborted)setError(cause.message)});return()=>controller.abort()},[retry,profile]);
 const progress=Math.max(0,Math.min(100,profile.energy/Math.max(1,profile.energyMax)*100));
 const levels=['初次见面','渐渐熟悉','默契搭子','心有灵犀'];
 const level=Math.min(3,Math.floor(progress/25));
 async function feed(){
  if(busy.current||profile.fedToday)return;busy.current=true;setFeeding(true);
  try{const result=await post<{profile:Profile;message:string}>('/api/feed',{});onProfile(result.profile);onNotice(result.message);setReaction(value=>value+1)}
  catch(cause){onNotice(cause instanceof Error?cause.message:'点心暂时没送到，再试一次吧')}
  finally{busy.current=false;setFeeding(false)}
 }
 return <main className="relationship-page personal-energy-page"><div className="relationship-content">
  <header className="relationship-header"><button onClick={onBack} aria-label="返回音乐小屋"><ArrowLeft size={21}/></button><h1 ref={heading} tabIndex={-1}>我们的陪伴能量</h1></header>
  <section className="personal-bond"><span className="relationship-eyebrow">每一次来找我，都让我们更熟悉</span><h2>你与 {profile.name} 的第 <b>{profile.days}</b> 天</h2>
   <div className="personal-bond-art"><span className="personal-orbit"/><button aria-label={`和${profile.name}打招呼`} onClick={()=>setReaction(value=>value+1)}><CharacterVisual key={profile.appearance.id} id={profile.appearance.id} src={profile.appearance.imageUrl} alt="你的当前 AI 形象" animated reaction={reaction}/></button><span className="personal-bond-badge"><Zap size={13}/>{levels[level]}</span></div>
   <p>你愿意分享，我就认真听</p>
  </section>
  <section className="relationship-card personal-growth"><div className="relationship-card-heading"><span><Zap size={19}/>我们的成长进度</span><small>{levels[level]}</small></div><div className="personal-energy-number"><strong>{profile.energy}</strong><span> / {profile.energyMax} 能量</span></div>
   <div className="relationship-progress" role="progressbar" aria-label="个人陪伴能量" aria-valuemin={0} aria-valuemax={profile.energyMax} aria-valuenow={profile.energy}><span style={{width:`${progress}%`}}/></div><div className="personal-levels">{levels.map((name,index)=><span key={name} className={index<=level?'is-reached':''}><i/>{name}</span>)}</div>
   <p className="relationship-progress-caption">{progress===100?'能量满格啦，接着收藏我们的日常吧':`还有 ${Math.max(0,profile.energyMax-profile.energy)} 点能量，就能让陪伴满格`}</p>
  </section>
  <section className="relationship-card personal-week"><div className="relationship-card-heading"><span>这周，你常来找我吗？</span><small>本周相处</small></div>
   {error?<div className="relationship-error" role="alert"><p>{error}</p><button onClick={()=>setRetry(value=>value+1)}>重新加载</button></div>:!week?<p className="relationship-loading" role="status">正在打开我们的音乐时光…</p>:<><div className="relationship-stats"><div><strong>{week.summary.minutes}<small> 分钟</small></strong><span>听歌相伴</span></div><div><strong>{week.summary.activeDays}<small> 天</small></strong><span>来听过音乐</span></div><div><strong>{week.summary.favoriteCount}<small> 首</small></strong><span>新收藏的歌</span></div></div>{week.isDemo&&!relationshipPreview&&<small className="relationship-data-note">本周数据含小屋初始示例</small>}</>}
  </section>
  <div className="relationship-links personal-links"><button onClick={onChat}><MessageCircle/><span><b>聊聊今天</b><small>开心和烦恼，都可以说给我听</small></span><ArrowUpRight size={17}/></button><button onClick={onListen}><Headphones/><span><b>陪我听首歌</b><small>在喜欢的旋律里，攒一点能量</small></span><ArrowUpRight size={17}/></button><button onClick={onDiary}><BookHeart/><span><b>翻翻我们的日记</b><small>看看那些一起走过的日常</small></span><ArrowUpRight size={17}/></button></div>
  <button className="relationship-primary personal-feed" disabled={feeding||profile.fedToday} onClick={()=>void feed()}>{profile.fedToday?<Check size={18}/>:<Zap size={18}/>} {feeding?'正在送出点心…':profile.fedToday?'今天的点心，已经收到啦':'送搭子一份点心 · +40 能量'}</button>
  <details className="relationship-rules"><summary>我们的能量怎么积累？</summary><p>陪伴能量记录你使用音乐搭子的成长进度：听歌积累能量，每天还可以送一次点心获得 40 点能量，最高 {profile.energyMax} 点。聊天、日记也会留下相处的记忆；更换形象或装扮不会清空已有进度。</p></details>
 </div></main>;
}
