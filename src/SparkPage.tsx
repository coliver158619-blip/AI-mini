import {useEffect,useRef} from 'react';
import {ArrowLeft,ArrowUpRight,BookHeart,Flame,Headphones,Music2,Share2} from 'lucide-react';
import type {Profile} from './types';
import CoupleCharacters from './CoupleCharacters';
import {usePairSpark} from './usePairSpark';
import {relationshipPreview} from './relationship-preview';
import './relationship-pages.css';
type Props={profile:Profile;onBack:()=>void;onOpenSpace:()=>void;onDiary:()=>void;onPlaylist:()=>void;onNotice:(message:string)=>void};
export default function SparkPage({profile,onBack,onOpenSpace,onDiary,onPlaylist,onNotice}:Props){
 const {data,error,retry}=usePairSpark(profile),heading=useRef<HTMLHeadingElement>(null);
 useEffect(()=>{heading.current?.focus()},[]);
 async function share(){
  const url=new URL(location.href);url.hash='/spark';
  const text=`KUGUY 和 KUGIRL 已在小屋相伴 ${profile.days} 天${data?`，攒下 ${data.value} 点双人火花`:''}。一起听，让旋律继续。`;
  try{if(navigator.share)await navigator.share({title:'听歌续火花',text,url:url.href});else{await navigator.clipboard.writeText(`${text}\n${url.href}`);onNotice('火花链接已复制，可以分享给朋友啦')}}
  catch(cause){if(!(cause instanceof DOMException&&cause.name==='AbortError'))onNotice('暂时没能分享，请稍后再试')}
 }
 return <main className="relationship-page spark-page"><div className="relationship-content">
  <header className="relationship-header"><button onClick={onBack} aria-label="返回音乐小屋"><ArrowLeft size={21}/></button><h1 ref={heading} tabIndex={-1}>听歌续火花</h1></header>
  <section className="spark-hero"><span className="relationship-eyebrow"><Music2 size={14}/>两段旋律，慢慢同频</span><h2>在小屋相伴第 <b>{profile.days}</b> 天</h2>
   <div className="streak-couple"><CoupleCharacters profile={profile} interactive/></div>
   <div className="spark-names"><span>KUGUY</span><i>×</i><span>KUGIRL</span></div><p>从第一首歌，到彼此熟悉的每一天</p>
  </section>
  <section className="relationship-card spark-score" aria-label="双人火花值"><div className="relationship-card-heading"><span><Flame size={19}/>双人火花值</span><small>共同经历，一点点发光</small></div>
   {error?<div className="relationship-error" role="alert"><p>{error}</p><button onClick={retry}>重新加载</button></div>:!data?<p role="status" className="relationship-loading">正在打开两人的音乐时光…</p>:<>
    <div className="spark-number"><strong>{data.value}</strong><span>点火花</span><Flame size={52} fill="currentColor"/></div>
    <div className="relationship-progress" role="progressbar" aria-label="双人火花进度" aria-valuemin={0} aria-valuemax={data.next} aria-valuenow={data.value}><span style={{width:`${data.value/data.next*100}%`}}/></div>
    <p className="relationship-progress-caption">{data.value?`再攒 ${data.next-data.value} 点，一起点亮 ${data.next} 火花`:'第一点火花，等一首一起听的歌'}</p>
    <div className="relationship-stats"><div><strong>{data.minutes}<small> 分钟</small></strong><span>一起听的时光</span></div><div><strong>{data.songs}<small> 首</small></strong><span>共同的旋律</span></div><div><strong>{data.diaries}<small> 篇</small></strong><span>共享日记</span></div></div>
   </>}
  </section>
  <div className="streak-share-actions relationship-actions"><button className="relationship-primary" onClick={onOpenSpace}><Headphones size={19}/>进入陪伴空间<ArrowUpRight size={17}/></button><button className="relationship-secondary" onClick={()=>void share()}><Share2 size={17}/>分享火花</button></div>
  <div className="relationship-links"><button onClick={onPlaylist}><Music2/><span><b>一起听歌单</b><small>听过的喜欢，都在这里</small></span><ArrowUpRight size={17}/></button><button onClick={onDiary}><BookHeart/><span><b>共享日记</b><small>写下两人的共同经历</small></span><ArrowUpRight size={17}/></button></div>
  <details className="relationship-rules"><summary>火花怎么生长？</summary><p>{relationshipPreview ? '当前统计为模拟展示数据。两人的一起听和共同回忆，让火花慢慢生长。换装不会重置相伴天数。' : '双人相伴天数从小屋建立当天起算，换装不会重置。一起听每满 1 分钟增加 1 点火花；每个日期有内容的共享日记增加 10 点，编辑同一天的日记不会重复增加。个人点心和个人听歌不计入双人火花。'}</p></details>
 </div></main>;
}
