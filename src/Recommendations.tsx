import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ChevronRight, Disc3, Heart, LoaderCircle, MapPin, Pause, Play, RefreshCw } from 'lucide-react';
import { api, ApiError } from './api';
import { WeatherIcon, type WeatherData } from './Weather';
import type { Integration, Song } from './types';
import './recommendations.css';

const moods = [
 { name: '放松一下', icon: '☕' }, { name: '开心加倍', icon: '☀' },
 { name: '专注时刻', icon: '✎' }, { name: '陪我入睡', icon: '☾' }, { name: '有点难过', icon: '♡' },
];
type Props = {
 mode: 'personal' | 'mood'; weather: WeatherData | null;
 onBack: () => void; onLocation: () => void;
 onSongs: (songs: Song[]) => void; onIntegration: (integration: Integration) => void;
 onWeatherUpdate: (weather: WeatherData) => void;
 onPlay: (song: Song) => void; onFavorite: (song: Song) => void;
 favorites: string[]; playingId?: string;
};

export default function Recommendations(props: Props) {
 const { mode, weather } = props;
 const [scene, setScene] = useState('');
 const [songs, setSongs] = useState<Song[]>([]);
 const [loading, setLoading] = useState(true);
 const [error, setError] = useState('');
 const [loadFailed, setLoadFailed] = useState(false);
 const [loadAttempt, setLoadAttempt] = useState(0);
 const request = useRef<AbortController | null>(null);
 const callbacks = useRef(props); callbacks.current = props;
 const title = mode === 'mood' ? '心情选歌' : '为你推荐';
 const canGenerate = Boolean(weather && (mode === 'personal' || scene));
 type Result = { songs: Song[]; source: string; integration?: Integration; context?: { scene?: string; weather?: WeatherData | null } };

 async function generate(selectedScene: string) {
  request.current?.abort();
  const controller = new AbortController(); request.current = controller;
  setError(''); setLoading(true); setScene(selectedScene);
  try {
   const result = await api<Result>('/api/recommendations', {
    method: 'POST', signal: controller.signal,
    body: JSON.stringify({ scene: selectedScene, message: selectedScene ? `推荐适合${selectedScene}的音乐` : '结合我所在的位置和天气，推荐现在适合听的音乐' }),
   });
   if (controller.signal.aborted) return;
   if (result.source !== 'kugou' || !result.songs.length) throw new Error('暂未生成歌曲，请重新试试。');
   setSongs(result.songs); callbacks.current.onSongs(result.songs);
   if (result.context?.weather) callbacks.current.onWeatherUpdate(result.context.weather);
   if (result.integration) callbacks.current.onIntegration(result.integration);
  } catch (cause) {
   if (controller.signal.aborted) return;
   setError(cause instanceof Error ? cause.message : '歌曲推荐暂时不可用，请重试。');
   if (cause instanceof ApiError && cause.details.integration) callbacks.current.onIntegration(cause.details.integration);
  } finally { if (!controller.signal.aborted) setLoading(false); }
 }

 useEffect(() => {
  setLoading(true); setError(''); setLoadFailed(false);
  const controller = new AbortController(); request.current = controller;
  // Delay one tick so StrictMode's mount check does not send a duplicate model call.
  const timer = setTimeout(() => {
   void api<Result>(`/api/recommendations?mode=${mode}`, { signal: controller.signal }).then(result => {
    if (controller.signal.aborted) return;
    if (result.songs.length) {
     setSongs(result.songs); setScene(result.context?.scene || '');
     callbacks.current.onSongs(result.songs);
    } else if (mode === 'personal' && callbacks.current.weather) {
     void generate('');
    }
   }).catch(cause => {
    if (controller.signal.aborted) return;
    setLoadFailed(true);
    setError(cause instanceof Error ? cause.message : '上次推荐暂时读取失败，请重试。');
   }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
  }, 50);
  return () => { clearTimeout(timer); request.current?.abort(); };
 }, [mode, loadAttempt]);

 return <main className="recommendation-page">
  <header className="recommendation-header"><button className="recommendation-back" aria-label="返回更多玩法" onClick={props.onBack}><ArrowLeft size={22}/></button><h1>{title}</h1><button className="recommendation-change" disabled={!canGenerate || loading} onClick={() => void generate(scene)}><RefreshCw size={16}/>换一换</button></header>
  <button className="recommendation-context" onClick={props.onLocation} aria-label="选择天气与位置">{weather ? <WeatherIcon code={weather.code} size={21}/> : <MapPin size={21}/>}<span>{weather ? `${weather.city} · ${weather.condition} ${Math.round(weather.temperature)}°` : '选择天气与位置'}</span>{weather?.cached && <small>上次记录</small>}<ChevronRight size={16}/></button>
  {mode === 'mood' && <div className="recommendation-moods" aria-label="选择心情">{moods.map(mood => <button key={mood.name} aria-pressed={scene === mood.name} disabled={!weather || loading} onClick={() => { if (mood.name !== scene || !songs.length) void generate(mood.name); }}><span aria-hidden="true">{mood.icon}</span>{mood.name}</button>)}</div>}
  {!loading && !songs.length && !error && (!weather ? <div className="recommendation-state"><MapPin size={34}/><p>选好城市，为你生成今天的歌单</p><button onClick={props.onLocation}>选择城市</button></div> : mode === 'mood' && !scene ? <div className="recommendation-state"><Disc3 size={34}/><p>选一种心情，听一份专属歌单</p></div> : null)}
  {loading && <div className="recommendation-loading" role="status"><span><LoaderCircle className="spin" size={18}/>{songs.length ? '正在更新歌曲推荐…' : '正在读取歌曲推荐…'}</span>{!songs.length && [0, 1, 2].map(i => <div className="recommendation-skeleton" key={i}><i/><div><i/><i/></div></div>)}</div>}
  {error && <div className="recommendation-state" role="alert"><p>{error}</p><button disabled={(!loadFailed && !canGenerate) || loading} onClick={() => loadFailed ? setLoadAttempt(value => value + 1) : void generate(scene)}>{loadFailed ? '重新读取' : '重新推荐'}</button></div>}
  {songs.length > 0 && <div className="recommendation-cards">{songs.map(song => <article className="recommendation-song" key={song.id}>
   <div className="recommendation-cover" style={{ background: `linear-gradient(145deg, ${song.color || '#e8bc7a'}, #fff3d9)` }}><Disc3 size={34}/></div>
   <div className="recommendation-song-info"><h2>{song.title}</h2><p>{song.artist}</p></div>
   <div className="recommendation-song-actions"><button onClick={() => props.onFavorite(song)} aria-label={`${props.favorites.includes(song.id) ? '取消收藏' : '收藏'}${song.title}`}><Heart size={21} fill={props.favorites.includes(song.id) ? 'currentColor' : 'none'}/></button><button className="recommendation-play" onClick={() => props.onPlay(song)} aria-label={`播放${song.title}`}>{props.playingId === song.id ? <Pause size={18} fill="currentColor"/> : <Play size={18} fill="currentColor"/>}</button></div>
  </article>)}</div>}
 </main>;
}
