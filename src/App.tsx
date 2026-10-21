import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowUpRight, BookHeart, ChevronRight, CloudRain, Coffee, Disc3, Flame, Headphones, Heart, MapPin, MessageCircle, MoreHorizontal, Music2, Pause, Pencil, Play, Send, Sparkles, Sun, Volume2, X, Zap, RefreshCw } from 'lucide-react';
import Diary from './Diary';
import ChatPanel from './ChatPanel';
import LanAccess from './LanAccess';
import Reports from './Reports';
import More from './More';
import Wardrobe from './Wardrobe';
import Personality from './Personality';
import StreakShare from './StreakShare';
import Recommendations from './Recommendations';
import Weather, { WeatherIcon, type WeatherData } from './Weather';
import { api, ApiError, createId, post } from './api';
import { useHourlyRecommendation } from './useHourlyRecommendation';
import { useVisualViewport } from './useVisualViewport';
import { usePullToDismiss } from './usePullToDismiss';
import type { Bootstrap, Integration, Message, Profile, Song } from './types';

const scenes = [{ name: '放松一下', icon: '☕', query: '有点累，想放松一下' }, { name: '开心加倍', icon: '☀', query: '今天很开心，推荐轻快的音乐' }, { name: '专注时刻', icon: '✎', query: '我要专注工作，推荐适合学习的音乐' }, { name: '陪我入睡', icon: '☾', query: '准备睡觉了，想听助眠音乐' }, { name: '有点难过', icon: '♡', query: '今天有点难过，陪陪我吧' }];
type Drawer = 'chat' | 'favorites' | 'energy' | 'settings' | 'lan' | null;
type Page = 'home' | 'diary' | 'reports' | 'more' | 'scenes' | 'recommendations' | 'weather' | 'appearance' | 'personality';

function Cover({ song, small = false }: { song: Song; small?: boolean }) {
 return <span className={`album-cover ${small ? 'small' : ''}`} style={{ background: `linear-gradient(145deg, ${song.color || '#e4af63'}, #fff5d5)` }}><Disc3 size={small ? 23 : 30}/><span className="cover-grain"/></span>;
}

export default function App() {
 useVisualViewport();
 const [data, setData] = useState<Bootstrap | null>(null);
 const [error, setError] = useState('');
 const [page, setPage] = useState<Page>('home');
 const [drawer, setDrawer] = useState<Drawer>(null);
 const canPullToDismiss = drawer === 'energy' || drawer === 'chat';
 const pullToDismiss = usePullToDismiss(canPullToDismiss, () => setDrawer(null));
 const weatherReturn = useRef<Page>('home');
 const openActivities = useRef(false);
 const [weather, setWeather] = useState<WeatherData | null>(null);
 const [bubble, setBubble] = useState('');
 const [wiggle, setWiggle] = useState(0);
 const [messages, setMessages] = useState<Message[]>([]);
 const [conversationId, setConversationId] = useState('');
 const chatDrafts = useRef<Record<string, string>>({});
 const [input, setInput] = useState('');
 const [sending, setSending] = useState(false);
 const [chatError, setChatError] = useState('');
 const [quickCommands, setQuickCommands] = useState<string[]>([]);
 const [activeScene, setActiveScene] = useState('');
 const [recommendations, setRecommendations] = useState<Song[]>([]);
 const [hourlySong, setHourlySong] = useState<Song | null>(null);
 const [toast, setToast] = useState('');
 const [current, setCurrent] = useState<Song | null>(null);
 const [playing, setPlaying] = useState(false);
 const [progress, setProgress] = useState(0);
 const [rename, setRename] = useState('');
 const [saving, setSaving] = useState(false);
 const [favorites, setFavorites] = useState<string[]>([]);
 const audio = useRef<HTMLAudioElement>(null);
 const livePlayback = useRef({ id: '', sessionId: '', seconds: 0, lastTime: 0 });
 const tapCount = useRef(0);
 const pendingPlays = useRef<{ songId: string; seconds: number; sessionId: string; eventId: string }[]>((() => { try { return JSON.parse(localStorage.getItem('music-pending-plays') || '[]'); } catch { return []; } })());
 const syncing = useRef(false);

 const notify = useCallback((text: string) => setToast(text), []);
 const load = useCallback(async () => {
  setError('');
  try {
   const [bootstrap, history] = await Promise.all([api<Bootstrap & { weather?: WeatherData }>('/api/bootstrap'), api<{ messages: Message[]; conversationId: string }>('/api/messages')]);
   setData(bootstrap); setBubble(bootstrap.greeting); setMessages(history.messages); setConversationId(history.conversationId); setRename(bootstrap.profile.name);
   setFavorites(bootstrap.songs.filter(s => s.favorite).map(s => s.id));
   if (bootstrap.weather) setWeather(bootstrap.weather);
  } catch (e) { setError(e instanceof Error ? e.message : '连接失败'); }
 }, []);
 useEffect(() => { void load(); }, [load]);
 useHourlyRecommendation({
  enabled: Boolean(data?.integration?.configured && data.integration.state !== 'disabled' && !error),
  active: page === 'home' && !drawer && !sending,
  onRecommendation: result => {
   const song = result.songs[0];
   setHourlySong(song);
   setRecommendations(old => [...new Map([...old, song].map(item => [item.id, item])).values()]);
   setBubble('给你挑了一首歌，一起听听吧。');
   setWiggle(value => value + 1);
  },
 });
 useEffect(() => {
  if (weather?.latitude === undefined || weather.longitude === undefined) return;
  const refresh = async () => {
   if (document.hidden) return;
   try {
    const result = await post<WeatherData & { songs?: Song[] }>('/api/weather', { latitude: weather.latitude, longitude: weather.longitude, city: weather.city });
    setWeather(result); if (!result.cached) setBubble(result.greeting);
   } catch { /* The saved observation stays visible with its original time. */ }
  };
  if (Date.now() - new Date(weather.updatedAt).getTime() > 30 * 60 * 1000) void refresh();
  const timer = setInterval(() => void refresh(), 30 * 60 * 1000);
  return () => clearInterval(timer);
 }, [weather?.latitude, weather?.longitude, weather?.city]);
 useEffect(() => { if (toast) { const t = setTimeout(() => setToast(''), 3500); return () => clearTimeout(t); } }, [toast]);
 useEffect(() => { document.querySelector('.chat-bottom-anchor')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }, [messages, sending, drawer]);
 useEffect(() => {
  if (page === 'more' && openActivities.current) {
   openActivities.current = false;
   document.getElementById('more-events-title')?.scrollIntoView({ block: 'start' });
  } else window.scrollTo({ top: 0 });
 }, [page]);
 useEffect(() => {
  if (!drawer) return;
  const previous = document.activeElement as HTMLElement | null;
  const key = (e: KeyboardEvent) => {
   if (e.key === 'Escape') setDrawer(null);
   if (e.key === 'Tab') {
    const nodes = [...document.querySelectorAll<HTMLElement>('.bottom-sheet button:not(:disabled), .bottom-sheet input:not(:disabled), .bottom-sheet a[href]')];
    if (nodes.length && e.shiftKey && document.activeElement === nodes[0]) { e.preventDefault(); nodes.at(-1)?.focus(); }
    else if (nodes.length && !e.shiftKey && document.activeElement === nodes.at(-1)) { e.preventDefault(); nodes[0].focus(); }
   }
  };
  const focusTimer = setTimeout(() => document.querySelector<HTMLElement>('.bottom-sheet .sheet-heading button')?.focus(), 0);
  document.addEventListener('keydown', key);
  const old = document.body.style.overflow; document.body.style.overflow = 'hidden';
  return () => { clearTimeout(focusTimer); document.removeEventListener('keydown', key); document.body.style.overflow = old; previous?.focus(); };
 }, [drawer]);

 const flush = useCallback(() => {
  const entry = livePlayback.current;
  const seconds = Math.floor(entry.seconds);
  const persist = () => { try { localStorage.setItem('music-pending-plays', JSON.stringify(pendingPlays.current)); } catch { /* SQLite remains the source of truth. */ } };
  if (entry.id && seconds >= 1) {
   entry.seconds -= seconds;
   pendingPlays.current.push({ songId: entry.id, seconds, sessionId: entry.sessionId, eventId: createId() });
   persist();
  }
  if (syncing.current || !pendingPlays.current.length) return;
  syncing.current = true;
  void (async () => {
   try {
    while (pendingPlays.current.length) {
     const result = await post<{ profile?: Profile }>('/api/play', pendingPlays.current[0]);
     pendingPlays.current.shift(); persist();
     if (result.profile) setData(old => old ? { ...old, profile: result.profile! } : old);
    }
   } catch { notify('听歌记录暂未同步，网络恢复后会自动重试'); }
   finally { syncing.current = false; }
  })();
 }, [notify]);
 useEffect(() => {
  const timer = setInterval(flush, 15000);
  const onVisibility = () => { if (document.hidden) flush(); };
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('online', flush); flush();
  const leave = () => {
   flush();
   for (const event of pendingPlays.current) navigator.sendBeacon('/api/play', new Blob([JSON.stringify(event)], { type: 'application/json' }));
  };
  window.addEventListener('pagehide', leave);
  return () => { clearInterval(timer); document.removeEventListener('visibilitychange', onVisibility); window.removeEventListener('online', flush); window.removeEventListener('pagehide', leave); };
 }, [flush]);

 const play = useCallback((song: Song) => {
  if (!song.audioUrl) { notify('这首歌暂未提供试听音源，可收藏后去酷狗搜索收听'); return; }
  const element = audio.current;
  if (!element) return;
  if (livePlayback.current.id === song.id && element.src) {
   if (element.ended) {
    flush();
    livePlayback.current = { id: song.id, sessionId: createId(), seconds: 0, lastTime: 0 };
   }
   if (element.paused) void element.play().catch(() => notify('暂时无法播放，请再试一次')); else element.pause();
   return;
  }
  element.pause(); flush();
  livePlayback.current = { id: song.id, sessionId: createId(), seconds: 0, lastTime: 0 };
  setCurrent(song); setProgress(0); element.src = song.audioUrl;
  void element.play().catch(() => { setPlaying(false); notify('音频加载失败，请重新点击播放'); });
 }, [flush, notify]);

 const send = async (message: string, scene = '') => {
  if (!message.trim() || sending) return;
  setDrawer('chat'); setSending(true); setInput(''); setChatError(''); setActiveScene(scene);
  const userMessage: Message = { role: 'user', content: message.trim(), id: `pending-${Date.now()}` };
  setMessages(old => [...old, userMessage]);
  try {
   const result = await post<{ reply: string; songs: Song[]; source: string; quickCommands?: string[]; integration?: Integration }>('/api/chat', { message: message.trim(), scene, conversationId });
   setMessages(old => [...old, { role: 'assistant', content: result.reply, songs: result.songs, source: result.source }]);
   setQuickCommands(result.quickCommands || []);
   setData(old => old ? { ...old, mode: result.source === 'kugou' ? 'kugou' : old.mode, integration: result.integration || (result.source === 'kugou' && old.integration ? { ...old.integration, state: 'connected' } : old.integration) } : old);
   setBubble(result.reply.replace(/\*\*/g, '')); setHourlySong(null); if (result.songs.length) setRecommendations(result.songs); setWiggle(n => n + 1);
  } catch (e) {
   setChatError(e instanceof Error ? e.message : '发送失败'); setInput(message); setMessages(old => old.filter(m => m !== userMessage));
   if (e instanceof ApiError && e.details.integration) setData(old => old ? { ...old, integration: e.details.integration, mode: 'kugou-error' } : old);
  }
  finally { setSending(false); }
 };

 const favorite = async (song: Song) => {
  try { const result = await post<{ favorite: boolean }>('/api/favorites', { songId: song.id, favorite: !favorites.includes(song.id) });
   setFavorites(old => result.favorite ? [...old.filter(id => id !== song.id), song.id] : old.filter(id => id !== song.id));
   notify(result.favorite ? '已收藏，把喜欢留在这里 ♡' : '已取消收藏');
  } catch (e) { notify(e instanceof Error ? e.message : '收藏失败'); }
 };
 const tapCompanion = () => {
  setWiggle(n => n + 1); tapCount.current += 1;
  const greetings = [weather?.greeting || '被你发现啦！今天的心情，想用哪首歌来形容？', '轻轻晃一晃，把烦恼都晃掉。想听什么？我陪你。', '不管今天过得怎样，回到这里，总有一首歌和我在等你。'];
  setBubble(greetings[(tapCount.current - 1) % greetings.length]);
 };
 const openWeather = () => { weatherReturn.current = page; setPage('weather'); };
 const onWeather = (value: WeatherData) => { setWeather(value); setBubble(value.greeting); setWiggle(n => n + 1); };
 const integrationLabel = data?.integration?.state === 'error' ? '融入AI · 连接异常'
  : data?.mode === 'kugou' ? '融入AI · 已连接'
   : data?.mode === 'kugou-pending' ? '融入AI · 待连接'
    : data?.mode === 'unconfigured' ? '融入AI · 未配置' : '本地演示模式';
 const integrationError = chatError || (data?.integration?.state === 'error' ? data.integration.detail : '');
 const songRow = (song: Song, index?: number) => <div className="song-row" key={song.id}>
  {index !== undefined && <span className="song-index">0{index + 1}</span>}<Cover song={song}/><button className="song-meta" onClick={() => play(song)}><strong>{song.title}</strong><span>{song.artist} · {song.audioLabel || '推荐歌曲'}</span></button>
  <button className={`icon-button song-heart ${favorites.includes(song.id) ? 'is-favorite' : ''}`} aria-label={`${favorites.includes(song.id) ? '取消收藏' : '收藏'}${song.title}`} onClick={() => void favorite(song)}><Heart size={18} fill={favorites.includes(song.id) ? 'currentColor' : 'none'}/></button>
  <button className="song-play" aria-label={`播放${song.title}`} onClick={() => play(song)}>{current?.id === song.id && playing ? <Pause size={15} fill="currentColor"/> : <Play size={15} fill="currentColor"/>}</button>
 </div>;

 return <div className={`app-shell ${current ? 'with-player' : ''}`}>
  <audio ref={audio} onPlay={() => setPlaying(true)} onPause={() => { setPlaying(false); flush(); }} onEnded={() => { setPlaying(false); flush(); setProgress(0); livePlayback.current.lastTime = 0; }} onError={() => { setPlaying(false); notify('音源暂时不可用，请选择另一首'); }} onTimeUpdate={() => {
   const element = audio.current!; const delta = element.currentTime - livePlayback.current.lastTime;
   if (delta > 0 && delta < 5) livePlayback.current.seconds += delta;
   livePlayback.current.lastTime = element.currentTime;
   setProgress(element.duration ? element.currentTime / element.duration * 100 : 0);
  }}/>
  {error ? <main className="connection-state"><Music2 size={42}/><h1>音乐小屋稍等一下</h1><p>{error}</p><button className="primary-button" onClick={() => void load()}><RefreshCw size={16}/>重新连接</button></main> : !data ? <main className="connection-state"><Disc3 className="spin" size={44}/><p>正在打开你的音乐小屋…</p></main> : page === 'diary' ? <Diary onBack={() => setPage('home')} onPlay={play}/> : page === 'reports' ? <Reports onBack={() => setPage('more')} onPlay={play}/> : page === 'more' ? <More personality={data.profile.personality} outfit={data.profile.outfit} appearance={data.profile.appearance} onBack={() => setPage('home')} onAction={action => { if (action === 'reports' || action === 'scenes' || action === 'recommendations' || action === 'appearance' || action === 'personality') setPage(action); else setDrawer(action); }}/> : page === 'personality' ? <Personality onBack={() => setPage('more')} onProfile={profile => setData(old => old ? { ...old, profile } : old)} onSaved={() => notify('音乐人格已更新，回小屋看看新搭子吧')}/> : page === 'appearance' ? <Wardrobe onBack={() => setPage('more')} onProfile={profile => setData(old => old ? { ...old, profile } : old)} onSaved={() => { setPage('home'); notify('新装扮已穿好'); }}/> : page === 'scenes' || page === 'recommendations' ? <Recommendations mode={page === 'scenes' ? 'mood' : 'personal'} weather={weather} onBack={() => setPage('more')} onLocation={openWeather} onSongs={setRecommendations} onWeatherUpdate={setWeather} onIntegration={integration => setData(old => old ? { ...old, integration, mode: integration.state === 'connected' ? 'kugou' : integration.state === 'error' ? 'kugou-error' : old.mode } : old)} onPlay={play} onFavorite={song => void favorite(song)} favorites={favorites} playingId={playing ? current?.id : undefined}/> : <div className={`home-weather-frame${page === 'weather' ? ' weather-is-open' : ''}`}><main className="home-page" aria-hidden={page === 'weather' || undefined} inert={page === 'weather'}>
   <section className="room-scene">
    <header className="home-nav">
     <div className="home-status">
      <button className="streak-pill" onClick={() => setDrawer('energy')} aria-label={`听歌续火花，已连续听歌 ${data.profile.streak} 天`}>
       <span className="streak-avatar-wrap" aria-hidden="true"><span className="streak-avatar streak-avatar-character" style={{ backgroundImage: `url(${data.profile.appearance?.imageUrl || "/assets/personalities/INFP.png"})` }}/><span className="streak-headphone-badge"><Headphones size={12}/></span></span>
       <span className="streak-copy"><strong>听歌续火花</strong><small>和{data.profile.name}一起听歌</small></span>
       <span className="streak-count"><span aria-hidden="true">🔥</span><b>{data.profile.streak}</b></span>
      </button>
      <button className="weather-pill" onClick={openWeather}>{weather ? <WeatherIcon code={weather.code} size={14}/> : <MapPin size={14}/>}<span>{weather ? `${weather.city} ${weather.condition} ${Math.round(weather.temperature)}°` : '所在城市 · 开启天气陪伴'}</span><ChevronRight size={12}/></button>
     </div>
     <button className="icon-button frosted" aria-label="更多玩法" onClick={() => setPage('more')}><MoreHorizontal size={22}/></button>
    </header>
    <div className="room-shortcuts"><button onClick={() => setPage('diary')} className="room-shortcut"><BookHeart size={23}/><span>日记</span><i/></button><button onClick={() => setDrawer('favorites')} className="room-shortcut"><Heart size={23}/><span>收藏</span></button></div>
    <div className="companion-stage">
    <div className={`speech-bubble${hourlySong ? ' has-hourly-song' : ''}`}>
     <button className="bubble-chat" onClick={() => setDrawer('chat')} aria-label="和音乐搭子聊天"><span className="bubble-caption"><span className="online-dot"/>你的音乐搭子 <Sparkles size={12}/></span><span className="bubble-copy">{bubble}</span></button>
     {hourlySong && <div className="hourly-song" aria-label="搭子每小时推荐" aria-live="polite"><button className="hourly-song-main" onClick={() => play(hourlySong)} aria-label={`播放${hourlySong.title}`}><Disc3 size={24}/><span><strong>{hourlySong.title}</strong><small>{hourlySong.artist}</small></span>{playing && current?.id === hourlySong.id ? <Pause size={15}/> : <Play size={15}/>}</button><button className="hourly-song-heart" onClick={() => void favorite(hourlySong)} aria-label={`${favorites.includes(hourlySong.id) ? '取消收藏' : '收藏'}${hourlySong.title}`}><Heart size={17} fill={favorites.includes(hourlySong.id) ? 'currentColor' : 'none'}/></button></div>}
    </div>
    <button key={wiggle} className={`companion ${wiggle ? 'wiggle' : ''} companion-outfit`} onClick={tapCompanion} aria-label="摸摸小人，听听他的问候"><img src={data.profile.appearance?.imageUrl || '/assets/personalities/INFP.png'} alt={data.profile.appearance ? `${data.profile.appearance.name}音乐搭子` : 'INFP 微光造梦家音乐搭子'} draggable={false}/></button>
    <div className="companion-caption"><button onClick={() => setDrawer('settings')}>{data.profile.name}<Pencil size={12}/></button><span>已经陪你走过 <b>{data.profile.days}</b> 天 <Heart size={11}/></span></div>
    </div>
   </section>
   <section className="home-content">
    <button className="energy-card" onClick={() => setDrawer('energy')}><span className="energy-symbol"><Zap size={24} fill="currentColor"/></span><div className="energy-body"><div><strong>我们的陪伴能量</strong><span>{data.profile.energy}<i> / {data.profile.energyMax}</i></span></div><span className="energy-track"><span style={{ width: `${Math.min(100, data.profile.energy / data.profile.energyMax * 100)}%` }}/></span></div><ChevronRight size={16}/></button>

    <button className="hot-activities" onClick={() => { openActivities.current = true; setPage('more'); }}><Flame size={20}/><span>热门活动</span><ChevronRight size={16}/></button>
   </section>
  </main>{page === 'weather' && <Weather weather={weather} onClose={() => setPage(weatherReturn.current)} onWeather={onWeather}/>}</div>}
  {current && <aside className="mini-player" aria-label="音乐播放器"><div className="player-progress" style={{ width: `${progress}%` }}/><Cover song={current} small/><div className="player-meta"><strong>{current.title}</strong><small>{playing ? '正在播放' : '已暂停'} · {current.audioLabel || current.artist}</small></div><button className="icon-button" onClick={() => void favorite(current)} aria-label="收藏当前歌曲"><Heart size={19} fill={favorites.includes(current.id) ? 'currentColor' : 'none'}/></button><button className="player-toggle" aria-label={playing ? '暂停播放' : '继续播放'} onClick={() => play(current)}>{playing ? <Pause size={19} fill="currentColor"/> : <Play size={19} fill="currentColor"/>}</button><button className="icon-button player-close" aria-label="关闭播放器" onClick={() => { audio.current?.pause(); flush(); setCurrent(null); livePlayback.current.id = ''; }}><X size={16}/></button></aside>}
  {drawer && <div className={`sheet-backdrop${drawer === 'chat' ? ' chat-backdrop' : ''}`} onClick={e => { if (e.target === e.currentTarget) setDrawer(null); }}>
   <section ref={pullToDismiss.ref} style={pullToDismiss.style} className={`bottom-sheet ${drawer === 'chat' ? 'chat-sheet' : ''}`} aria-description={canPullToDismiss ? '下拉标题区域，或在内容顶部下拉，可关闭面板' : undefined} role="dialog" aria-modal="true" aria-label={drawer === 'chat' ? '和音乐搭子聊天' : '小屋面板'}>{drawer === 'chat' ? <ChatPanel messages={messages} input={input} sending={sending} error={integrationError} greeting={weather?.greeting || data?.greeting || ''} weather={weather ? `${weather.city} · ${weather.condition}，我陪着你` : '一直在线，随时听你说'} provider={integrationLabel} commands={quickCommands} conversationId={conversationId} onInput={setInput} onSend={(value, scene) => void send(value, scene)} onClose={() => setDrawer(null)} onPlay={play} onSelect={selection => { chatDrafts.current[conversationId] = input; setConversationId(selection.conversationId); setMessages(selection.messages); setInput(chatDrafts.current[selection.conversationId] || ''); setQuickCommands([]); setChatError(''); setActiveScene(''); }}/> : <>
<div className="sheet-handle"/><header className="sheet-heading"><div><h2>{drawer === 'favorites' ? '收藏的每一份心动' : drawer === 'energy' ? '陪伴，让能量满格' : drawer === 'lan' ? '局域网访问' : '我的音乐小屋'}</h2></div><button className="icon-button" onClick={() => setDrawer(null)} aria-label="关闭面板"><X size={21}/></button></header>
    {drawer === 'lan' ? <div className="sheet-content lan-sheet"><LanAccess/></div> : drawer === 'favorites' ? <div className="sheet-content">{[...new Map([...(data?.songs || []), ...recommendations, ...messages.flatMap(m => m.songs || [])].map(s => [s.id, s])).values()].filter(s => favorites.includes(s.id)).map(s => songRow(s))}{favorites.length === 0 && <div className="empty-state"><Heart size={38}/><h3>喜欢的旋律，留在这里</h3><p>点击歌曲旁的爱心，下一次就能轻松找到。</p></div>}</div> : drawer === 'energy' ? <div className="sheet-content energy-detail"><span className="energy-large"><Zap size={46} fill="currentColor"/></span><h3>{data?.profile.energy}<small> / {data?.profile.energyMax}</small></h3><p>每一次听歌，都为我们的陪伴攒一点能量。</p><div className="energy-tip"><Headphones size={21}/><div><strong>听喜欢的歌</strong><span>真实播放时长会自动记录到音乐日记</span></div></div>{data && <StreakShare profile={data.profile} isDemo={data.isDemo}/>}<button className="primary-button" disabled={saving} onClick={async () => { setSaving(true); try { const result = await post<{profile: Profile;message:string}>('/api/feed', {}); setData(old => old ? { ...old, profile: result.profile } : old); notify(result.message); } catch (e) { notify(e instanceof Error ? e.message : '暂时喂食失败'); } finally { setSaving(false); } }}><Heart size={16}/> {saving ? '投喂中…' : '送搭子一份点心 · +40 能量'}</button></div> : <form className="sheet-content settings-form" onSubmit={async e => { e.preventDefault(); if (!rename.trim()) return; setSaving(true); try { const result = await post<{profile:Profile}>('/api/profile', { name: rename.trim() }); setData(old => old ? { ...old, profile: result.profile } : old); notify('新名字已经记住啦'); setDrawer(null); } catch (err) { notify(err instanceof Error ? err.message : '保存失败'); } finally { setSaving(false); } }}><label htmlFor="companion-name">给音乐搭子起个名字</label><input id="companion-name" value={rename} onChange={e => setRename(e.target.value)} maxLength={16} required/><button className="primary-button" disabled={saving}>{saving ? '保存中…' : '保存名字'}</button><div className="settings-note"><BookHeart size={20}/><p>你的聊天、日记、收藏和听歌记录，都会保存在这间小屋里。</p></div><p className="demo-note">当前为单用户体验版。初始报告含示例记录；本地曲库为原创演示音乐，真实收听记录会持续累积。</p><details className="data-credits"><summary>数据来源</summary><p>天气：<a href="https://open-meteo.com/" target="_blank" rel="noreferrer">Open-Meteo</a>（<a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer">CC BY 4.0</a>）</p><p>城市定位：<a href="https://photon.komoot.io/" target="_blank" rel="noreferrer">Photon</a> · © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap contributors</a></p></details></form>}
   </>} </section>
  </div>}
  {toast && <div className="toast" role="status">{toast}</div>}
 </div>;
}



