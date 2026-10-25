import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowUpRight, BookHeart, Headphones, Heart, ListMusic, LoaderCircle, Music2 } from 'lucide-react';
import CoupleCharacters from './CoupleCharacters';
import { api } from './api';
import {usePairSpark} from './usePairSpark';
import type { Profile } from './types';
import './companion-space.css';

type Props = { profile: Profile; onBack: () => void; onNotice: (message: string) => void; onDiary: () => void; onPlaylist: () => void };
type ListenTogetherEntry = { available: boolean; url: string | null };

export default function CompanionSpace({ profile, onBack, onNotice, onDiary, onPlaylist }: Props) {
 const [opening, setOpening] = useState(false);
 const busy = useRef(false);
 const request = useRef<AbortController | null>(null);
 const heading = useRef<HTMLHeadingElement>(null);
 useEffect(() => { heading.current?.focus(); return () => request.current?.abort(); }, []);

 async function listenTogether() {
  if (busy.current) return;
  busy.current = true; setOpening(true);
  const controller = new AbortController(); request.current = controller;
  const timer = window.setTimeout(() => controller.abort(), 10000);
  try {
   const entry = await api<ListenTogetherEntry>('/api/listen-together/entry', { signal: controller.signal });
   if (controller.signal.aborted) return;
   if (entry.available && entry.url) window.location.assign(entry.url);
   else onNotice('一起听即将上线，先在这里陪伴彼此吧');
  } catch (cause) {
   if (heading.current?.isConnected) onNotice(controller.signal.aborted ? '连接有点慢，请再试一次' : cause instanceof Error ? cause.message : '暂时连接不上，请稍后再试');
  } finally { window.clearTimeout(timer); busy.current = false; setOpening(false); }
 }

 const {data: spark, error: sparkError, retry: retrySpark} = usePairSpark(profile);
 return <main className="companion-space">
  <div className="companion-space-content">
   <header className="space-header">
    <button className="space-back" onClick={onBack} aria-label="返回音乐小屋"><ArrowLeft size={21}/></button>
    <div><span>OUR LITTLE ROOM</span><h1 ref={heading} tabIndex={-1}>陪伴空间</h1><p className="space-days">相伴第 <b>{profile.days}</b> 天</p></div>
    <span className="space-label"><Heart size={13} fill="currentColor"/>双人小屋</span>
   </header>
   <nav className="room-shortcuts space-shortcuts" aria-label="共同回忆">
    <button className="room-shortcut" onClick={onDiary}><BookHeart size={23}/><span>共享日记</span><i/></button>
    <button className="room-shortcut" onClick={onPlaylist} aria-label="一起听歌单"><ListMusic size={23}/><span>一起听歌单</span></button>
   </nav>
   <section className="space-scene" aria-label="双人音乐小屋">
    <span className="space-speech">今天的心动，想和你一起听 <Heart size={13} fill="currentColor"/></span>
    <span className="space-floor" aria-hidden="true"/>
    <div className="space-couple-button" aria-label="我们的双人形象">
     <CoupleCharacters profile={profile} interactive/>
    </div>
    <div className="space-names"><span>KUGUY</span><Heart size={12} fill="currentColor"/><span>KUGIRL</span></div>
    <span className="space-touch-hint">轻点我们，收下一份小小的回应</span>
   </section>
   <section className="space-bottom">
    <div className="space-energy"><span><Music2 size={14}/>双人火花</span><strong>{spark && !sparkError ? spark.value : '—'}{spark && !sparkError && <small> / {spark.next}</small>}</strong></div>
    {spark && !sparkError ? <div className="space-energy-track" role="progressbar" aria-label="双人火花" aria-valuenow={spark.value} aria-valuemin={0} aria-valuemax={spark.next}><span style={{ width: `${spark.value / spark.next * 100}%` }}/></div> : sparkError ? <p className="space-footnote" role="alert">{sparkError} <button onClick={retrySpark}>重试</button></p> : <p className="space-footnote" role="status">正在打开两人的音乐时光…</p>}
    <button className="space-listen" onClick={() => void listenTogether()} disabled={opening}>
     <span className="space-listen-icon">{opening ? <LoaderCircle className="spin" size={24}/> : <Headphones size={25}/>}</span>
     <span><strong>{opening ? '正在打开…' : '一起听'}<Music2 size={15}/></strong><small>让同一首歌，靠近两颗心</small></span><ArrowUpRight size={21}/>
    </button>
    <p className="space-footnote">小小的空间，装下两个人的喜欢</p>
   </section>
  </div>
 </main>;
}
