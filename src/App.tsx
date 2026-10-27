import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowUpRight, BookHeart, ChevronRight, CloudRain, Coffee, Disc3, BatteryCharging, Headphones, Heart, MapPin, MessageCircle, Music2, Pause, Pencil, Play, Send, Sparkles, Sun, Volume2, X, Zap, RefreshCw } from 'lucide-react';
import Diary from './Diary';
import ChatPanel from './ChatPanel';
import LanAccess from './LanAccess';
import Reports from './Reports';
import {usePageRoute, type Page} from './page-route';
import More from './More';
import Wardrobe from './Wardrobe';
import Personality from './Personality';
import SparkPage from './SparkPage';
import ChargeIntro from './ChargeIntro';
import {stars} from './StarWheel';
import CompanionSpace from './CompanionSpace';
import CharacterVisual from './CharacterVisual';
import AppearanceAvatar from './AppearanceAvatar';
import SharedDiary from './SharedDiary';
import TogetherPlaylist from './TogetherPlaylist';
import Recommendations from './Recommendations';
import Weather, { WeatherIcon, type WeatherData } from './Weather';
import { api, ApiError, createId, post } from './api';
import { useHourlyRecommendation } from './useHourlyRecommendation';
import { useVisualViewport } from './useVisualViewport';
import { usePullToDismiss } from './usePullToDismiss';
import { companionGreeting } from './companion-greeting';
import { randomHomeGreeting } from './home-greetings';
import HomeSpeechBubble from './HomeSpeechBubble';
import './charging.css';
import type { Bootstrap, Integration, Message, Profile, Song } from './types';

const scenes = [{ name: '放松一下', icon: '☕', query: '有点累，想放松一下' }, { name: '开心加倍', icon: '☀', query: '今天很开心，推荐轻快的音乐' }, { name: '专注时刻', icon: '✎', query: '我要专注工作，推荐适合学习的音乐' }, { name: '陪我入睡', icon: '☾', query: '准备睡觉了，想听助眠音乐' }, { name: '有点难过', icon: '♡', query: '今天有点难过，陪陪我吧' }];
type Drawer = 'chat' | 'favorites' | 'settings' | 'lan' | null;

function Cover({ song, small = false }: { song: Song; small?: boolean }) {
 return <span className={`album-cover ${small ? 'small' : ''}`} style={{ background: `linear-gradient(145deg, ${song.color || '#e4af63'}, #fff5d5)` }}><Disc3 size={small ? 23 : 30}/><span className="cover-grain"/></span>;
}

export default function App({ userId = 'legacy', onLogout, onConnectionError }: { userId?: string; onLogout?: () => Promise<void>; onConnectionError?: () => void }) {
 const playStorageKey = userId === 'legacy' ? 'music-pending-plays' : `music-pending-plays:${userId}`;
 const [loggingOut, setLoggingOut] = useState(false);
 const [openingCharge, setOpeningCharge] = useState(false);
 const [chargeWelcome, setChargeWelcome] = useState(false);
 const welcomeRequest=useRef(false);
 const [starMode,setStarMode]=useState(false);
 const [chargeArtist,setChargeArtist]=useState('jay');
 const [starEnergy,setStarEnergy]=useState<{artistId:string;energy:number|undefined}>();
 const [diaryArtist,setDiaryArtist]=useState<string|undefined>();
 const chargeSongs=useRef<Song[]|undefined>(undefined);
 const chargeSinger=useRef<string|undefined>(undefined);
 useVisualViewport();
 const [data, setData] = useState<Bootstrap | null>(null);
 const homeEnergy=starMode?(starEnergy?.artistId===chargeArtist?starEnergy.energy:undefined):data?.profile.energy;
 const homeEnergyLabel=`我们的陪伴电量${starMode?`（${stars.find(star=>star.id===chargeArtist)?.name??''}）`:''}`;
 const [error, setError] = useState('');
 const [page, setPage] = usePageRoute();
 const [drawer, setDrawer] = useState<Drawer>(null);
 const canPullToDismiss = drawer === 'chat';
 const pullToDismiss = usePullToDismiss(canPullToDismiss, () => setDrawer(null));
 const weatherReturn = useRef<Page>('home');
 const sharedReturn = useRef<Page>('companion-space');
 const musicReturn = useRef<Page>('more');
 const recommendationContext = useRef<'solo' | 'together'>('solo');
 const openActivities = useRef(false);
 const [weather, setWeather] = useState<WeatherData | null>(null);
 const [bubble, setBubble] = useState('');
 const [reaction, setReaction] = useState(0);
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
 const [tapSong, setTapSong] = useState<Song | null>(null);
 const recentGreetings = useRef<string[]>([]);
 const lastTapSong = useRef('');
 const [toast, setToast] = useState('');
 const [current, setCurrent] = useState<Song | null>(null);
 const [playing, setPlaying] = useState(false);
 const [progress, setProgress] = useState(0);
 const [rename, setRename] = useState('');
 const [saving, setSaving] = useState(false);
 const [favorites, setFavorites] = useState<string[]>([]);
 const audio = useRef<HTMLAudioElement>(null);
 const livePlayback = useRef({ id: '', sessionId: '', seconds: 0, lastTime: 0, context: 'solo' as 'solo' | 'together' });
 const tapCount = useRef(0);
 const companionRef = useRef<HTMLButtonElement>(null);
 const pendingPlays = useRef<{ songId: string; seconds: number; sessionId: string; eventId: string; context?: 'solo' | 'together' }[]>((() => { try { return JSON.parse(localStorage.getItem(playStorageKey) || '[]'); } catch { return []; } })());
 const syncing = useRef(false);

 const notify = useCallback((text: string) => setToast(text), []);
 async function openCharge() {
  if (openingCharge) return;
  setOpeningCharge(true);
  try {
   if (data?.profile.chargeIntroPending) {
    const result = await post<{profile: Profile}>('/api/charge/intro-seen', {});
    setData(old => old ? {...old, profile: result.profile} : old);
   }
   setPage('spark');
  } catch (cause) { notify(cause instanceof Error ? cause.message : '暂时没有连接上，再点一次试试'); }
  finally { setOpeningCharge(false); }
 }
 useEffect(()=>{
  if(!data?.profile.chargeWelcomePending||welcomeRequest.current)return;
  welcomeRequest.current=true;
  void post<{profile:Profile;awarded:boolean}>('/api/charge/welcome',{}).then(result=>{
   setData(old=>old?{...old,profile:result.profile}:old);
   if(result.awarded){setChargeWelcome(true);window.setTimeout(()=>setChargeWelcome(false),1900)}
  }).catch(()=>{welcomeRequest.current=false});
 },[data?.profile.chargeWelcomePending]);
 const load = useCallback(async () => {
  setError('');
  try {
   const [bootstrap, history] = await Promise.all([api<Bootstrap & { weather?: WeatherData }>('/api/bootstrap'), api<{ messages: Message[]; conversationId: string }>('/api/messages')]);
   setData(bootstrap); const greeting = randomHomeGreeting(recentGreetings.current); recentGreetings.current = [greeting]; setBubble(greeting); setMessages(history.messages); setConversationId(history.conversationId); setRename(bootstrap.profile.name);
   setFavorites(bootstrap.songs.filter(s => s.favorite).map(s => s.id));
   if (bootstrap.weather) setWeather(bootstrap.weather);
  } catch (e) { if (onConnectionError) onConnectionError(); else setError(e instanceof Error ? e.message : '连接失败'); }
 }, [onConnectionError]);
 useEffect(() => { void load(); }, [load]);
 useHourlyRecommendation({
  enabled: Boolean(data?.integration?.configured && data.integration.state !== 'disabled' && !error),
  active: page === 'home' && !drawer && !sending,
  onRecommendation: result => {
   const song = result.songs[0];
   setHourlySong(song);
   setRecommendations(old => [...new Map([...old, song].map(item => [item.id, item])).values()]);

  },
 });
 useEffect(() => {
  if (weather?.latitude === undefined || weather.longitude === undefined) return;
  const refresh = async () => {
   if (document.hidden) return;
   try {
    const result = await post<WeatherData & { songs?: Song[] }>('/api/weather', { latitude: weather.latitude, longitude: weather.longitude, city: weather.city });
    setWeather(result);
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
  const persist = () => { try { localStorage.setItem(playStorageKey, JSON.stringify(pendingPlays.current)); } catch { /* SQLite remains the source of truth. */ } };
  if (entry.id && seconds >= 1) {
   entry.seconds -= seconds;
   pendingPlays.current.push({ songId: entry.id, seconds, sessionId: entry.sessionId, eventId: createId(), context: entry.context });
   persist();
  }
  if (syncing.current || !pendingPlays.current.length) return;
  syncing.current = true;
  void (async () => {
   try {
    while (pendingPlays.current.length) {
     const result = await post<{ profile?: Profile }>('/api/play', { ...pendingPlays.current[0], _accountId: userId === 'legacy' ? undefined : userId });
     pendingPlays.current.shift(); persist();
     if (result.profile) setData(old => old ? { ...old, profile: result.profile! } : old);
    }
   } catch { notify('听歌记录暂未同步，网络恢复后会自动重试'); }
   finally { syncing.current = false; }
  })();
 }, [notify, playStorageKey, userId]);
 useEffect(() => {
  const timer = setInterval(flush, 15000);
  const onVisibility = () => { if (document.hidden) flush(); };
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('online', flush); flush();
  const leave = () => {
   flush();
   for (const event of pendingPlays.current) navigator.sendBeacon('/api/play', new Blob([JSON.stringify({ ...event, _accountId: userId === 'legacy' ? undefined : userId })], { type: 'application/json' }));
  };
  window.addEventListener('pagehide', leave);
  return () => { clearInterval(timer); document.removeEventListener('visibilitychange', onVisibility); window.removeEventListener('online', flush); window.removeEventListener('pagehide', leave); };
 }, [flush]);

 const play = useCallback((song: Song, context: 'solo' | 'together' = 'solo') => {
  if (!song.audioUrl) { notify('这首歌暂未提供试听音源，可收藏后去酷狗搜索收听'); return; }
  const element = audio.current;
  if (!element) return;
  if (livePlayback.current.id === song.id && livePlayback.current.context === context && element.src) {
   if (element.ended) {
    flush();
    livePlayback.current = { id: song.id, sessionId: createId(), seconds: 0, lastTime: 0, context };
   }
   if (element.paused) void element.play().catch(() => notify('暂时无法播放，请再试一次')); else element.pause();
   return;
  }
  element.pause(); flush();
  livePlayback.current = { id: song.id, sessionId: createId(), seconds: 0, lastTime: 0, context };
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
   setBubble(result.reply.replace(/\*\*/g, '')); setHourlySong(null); if (result.songs.length) setRecommendations(result.songs);
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
  setReaction(value => value + 1); tapCount.current += 1;
  const greeting = randomHomeGreeting(recentGreetings.current);
  recentGreetings.current = [...recentGreetings.current.slice(-5), greeting];
  setBubble(greeting);
  if (tapCount.current % 3 === 0) {
   const songs = [...new Map([...(hourlySong ? [hourlySong] : []), ...recommendations, ...(data?.songs || [])].map(song => [song.id, song])).values()];
   const choices = songs.filter(song => song.id !== lastTapSong.current);
   const pool = choices.length ? choices : songs;
   const song = hourlySong && hourlySong.id !== lastTapSong.current ? hourlySong : pool[Math.floor(Math.random() * pool.length)] || null;
   lastTapSong.current = song?.id || '';
   setTapSong(song);
  } else setTapSong(null);
 };
 const openWeather = () => { weatherReturn.current = page; setPage('weather'); };
 const onWeather = (value: WeatherData) => { setWeather(value); };
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
  {error ? <main className="connection-state"><Music2 size={42}/><h1>音乐小屋稍等一下</h1><p>{error}</p><button className="primary-button" onClick={() => void load()}><RefreshCw size={16}/>重新连接</button></main> : !data ? <main className="connection-state"><Disc3 className="spin" size={44}/><p>正在打开你的音乐小屋…</p></main> : (page === 'spark' || page === 'companion-energy') ? <SparkPage profile={data.profile} starMode={starMode} artistId={chargeArtist} onMode={()=>setStarMode(old=>!old)} onArtist={setChargeArtist} onStarEnergy={setStarEnergy} onProfile={profile=>setData(old=>old?{...old,profile}:old)} onChat={()=>setDrawer('chat')} onBack={() => setPage('home')} onAppearance={() => setPage('appearance')} onListen={(songs,artist) => { chargeSongs.current=songs;chargeSinger.current=artist; musicReturn.current = 'spark'; recommendationContext.current = 'solo'; setPage('recommendations'); }} onDiary={artist => { setDiaryArtist(artist); sharedReturn.current = 'spark'; setPage('shared-diary'); }} onNotice={notify}/> : page === 'companion-space' ? <CompanionSpace profile={data.profile} onBack={() => setPage('home')} onNotice={notify} onDiary={() => { setDiaryArtist(undefined); sharedReturn.current = 'companion-space'; setPage('shared-diary'); }} onPlaylist={() => setPage('together-playlist')}/> : page === 'shared-diary' ? <SharedDiary key={diaryArtist||'shared'} artist={stars.find(s=>s.id===diaryArtist)} userId={userId} onBack={() => setPage(sharedReturn.current)}/> : page === 'together-playlist' ? <TogetherPlaylist onBack={() => setPage('companion-space')} onPlay={song => play(song, 'together')} playingId={playing ? current?.id : undefined}/> : page === 'diary' ? <Diary onBack={() => setPage('home')} onPlay={play}/> : page === 'reports' ? <Reports onBack={() => setPage('more')} onPlay={play} appearance={data.profile.appearance}/> : page === 'more' ? <More loggingOut={loggingOut} onLogout={onLogout ? () => { if (loggingOut) return; setLoggingOut(true); audio.current?.pause(); flush(); void onLogout().catch(cause => { notify(cause.message); setLoggingOut(false); }); } : undefined} personality={data.profile.personality} outfit={data.profile.outfit} appearance={data.profile.appearance} onBack={() => setPage('home')} onAction={action => { chargeSongs.current=undefined;chargeSinger.current=undefined; musicReturn.current = 'more'; recommendationContext.current = 'solo'; if (action === 'reports' || action === 'scenes' || action === 'recommendations' || action === 'appearance' || action === 'personality' || action === 'companion-space') setPage(action); else setDrawer(action); }}/> : page === 'personality' ? <Personality onBack={() => setPage('more')} onProfile={profile => setData(old => old ? { ...old, profile } : old)} onSaved={() => notify('音乐形象已更新，回小屋看看新搭子吧')}/> : page === 'appearance' ? <Wardrobe onBack={() => setPage('spark')} onProfile={profile => setData(old => old ? { ...old, profile } : old)} onSaved={() => { setPage('home'); notify('新装扮已穿好'); }}/> : page === 'scenes' || page === 'recommendations' ? <Recommendations fixedSongs={chargeSongs.current} artistName={chargeSinger.current} fallbackSongs={musicReturn.current === 'spark' ? data.songs.slice(0, 6) : undefined} backLabel={musicReturn.current === 'spark' ? '返回听歌充电' : undefined} mode={page === 'scenes' ? 'mood' : 'personal'} weather={weather} onBack={() => setPage(musicReturn.current)} onLocation={openWeather} onSongs={setRecommendations} onWeatherUpdate={setWeather} onIntegration={integration => setData(old => old ? { ...old, integration, mode: integration.state === 'connected' ? 'kugou' : integration.state === 'error' ? 'kugou-error' : old.mode } : old)} onPlay={song => play(song, recommendationContext.current)} onFavorite={song => void favorite(song)} favorites={favorites} playingId={playing ? current?.id : undefined}/> : <div className={`home-weather-frame${page === 'weather' ? ' weather-is-open' : ''}`}><main className="home-page" aria-hidden={page === 'weather' || undefined} inert={page === 'weather'}>
   <section className="room-scene">
    <header className="home-nav">
     <div className="home-status">
      <button className="streak-pill" disabled={openingCharge} onClick={() => void openCharge()} aria-label={`听歌充电，已陪伴 ${data.profile.days} 天`}>
       <span className="streak-avatar-wrap" aria-hidden="true"><AppearanceAvatar appearance={data.profile.appearance} className="streak-avatar streak-avatar-character"/><span className="streak-headphone-badge"><Headphones size={12}/></span></span>
       <span className="streak-copy"><strong>听歌充电</strong><small>和{data.profile.name}一起听歌</small></span>
       <span className="streak-count"><span aria-hidden="true"><Zap size={27} fill="currentColor"/></span><b>{data.profile.days}</b></span>
      </button>
      <button className="weather-pill" onClick={openWeather}>{weather ? <WeatherIcon code={weather.code} size={14}/> : <MapPin size={14}/>}<span>{weather ? `${weather.city} ${weather.condition} ${Math.round(weather.temperature)}°` : '所在城市 · 开启天气陪伴'}</span><ChevronRight size={12}/></button>
     </div>
     <div className="home-tools">
      <button className="home-more-glass" aria-label="更多玩法" onClick={() => setPage('more')}><span aria-hidden="true">more</span></button>
      <div className="room-shortcuts"><button onClick={() => setPage('diary')} className="room-shortcut"><BookHeart size={23}/><span>日记</span><i/></button><button onClick={() => setDrawer('favorites')} className="room-shortcut"><Heart size={23}/><span>收藏</span></button></div>
     </div>
     {data.profile.chargeIntroPending && !chargeWelcome && <ChargeIntro disabled={openingCharge} onClick={()=>void openCharge()}/>}
    </header>

    <div className="companion-stage">
    <HomeSpeechBubble profile={data.profile} figureRef={companionRef} hasSong={Boolean(tapSong)}>
     <button className="bubble-chat" onClick={() => setDrawer('chat')} aria-label="和音乐搭子聊天"><span className="bubble-copy" aria-live="polite">{bubble}</span></button>
     {tapSong && <div className="hourly-song" aria-label="搭子推荐歌曲"><button className="hourly-song-main" onClick={() => play(tapSong)} aria-label={`播放${tapSong.title}`}><Disc3 size={24}/><span><strong>{tapSong.title}</strong><small>{tapSong.artist}</small></span>{playing && current?.id === tapSong.id ? <Pause size={15}/> : <Play size={15}/>}</button><button className="hourly-song-heart" onClick={() => void favorite(tapSong)} aria-label={`${favorites.includes(tapSong.id) ? '取消收藏' : '收藏'}${tapSong.title}`}><Heart size={17} fill={favorites.includes(tapSong.id) ? 'currentColor' : 'none'}/></button></div>}
    </HomeSpeechBubble>
    <button ref={companionRef} className="companion companion-outfit" onClick={tapCompanion} aria-label="摸摸小人，听听他的问候"><CharacterVisual key={data.profile.appearance.id} id={data.profile.appearance.id} src={data.profile.appearance.imageUrl} alt={`${data.profile.appearance.name}音乐搭子`} animated reaction={reaction}/></button>
    <div className="companion-caption"><button onClick={() => setDrawer('settings')}>{data.profile.name}<Pencil size={12}/></button><span>已经陪你走过 <b>{data.profile.days}</b> 天 <Heart size={11}/></span></div>
    </div>
   </section>
   <section className="home-content">
    <div className="energy-card"><span className="energy-symbol"><Zap size={24} fill="currentColor"/></span><div className="energy-body"><div><strong>{homeEnergyLabel}</strong><span>{homeEnergy??'—'}<i> / {data.profile.energyMax}</i></span></div><span className="energy-track" role="progressbar" aria-label={homeEnergyLabel} aria-valuemin={0} aria-valuemax={data.profile.energyMax} aria-valuenow={homeEnergy}><span style={{ width: `${Math.min(100, (homeEnergy??0) / data.profile.energyMax * 100)}%` }}/></span></div></div>

    <button className="hot-activities" onClick={() => { openActivities.current = true; setPage('more'); }}><Zap size={20}/><span>热门活动</span><ChevronRight size={16}/></button>
   </section>
  </main>{page === 'weather' && <Weather weather={weather} onClose={() => setPage(weatherReturn.current)} onWeather={onWeather}/>}</div>}
  {chargeWelcome && <div className="charge-welcome" role="status" aria-label="首次充电，电量加一"><div><BatteryCharging size={74}/><span className="charge-welcome-fill"/></div><strong>+1</strong><p>初次见面，为陪伴充一格电</p></div>}
  {current && <aside className="mini-player" aria-label="音乐播放器"><div className="player-progress" style={{ width: `${progress}%` }}/><Cover song={current} small/><div className="player-meta"><strong>{current.title}</strong><small>{playing ? '正在播放' : '已暂停'} · {current.audioLabel || current.artist}</small></div><button className="icon-button" onClick={() => void favorite(current)} aria-label="收藏当前歌曲"><Heart size={19} fill={favorites.includes(current.id) ? 'currentColor' : 'none'}/></button><button className="player-toggle" aria-label={playing ? '暂停播放' : '继续播放'} onClick={() => play(current, livePlayback.current.context)}>{playing ? <Pause size={19} fill="currentColor"/> : <Play size={19} fill="currentColor"/>}</button><button className="icon-button player-close" aria-label="关闭播放器" onClick={() => { audio.current?.pause(); flush(); setCurrent(null); livePlayback.current.id = ''; }}><X size={16}/></button></aside>}
  {drawer && <div className={`sheet-backdrop${drawer === 'chat' ? ' chat-backdrop' : ''}`} onClick={e => { if (e.target === e.currentTarget) setDrawer(null); }}>
   <section ref={pullToDismiss.ref} style={pullToDismiss.style} className={`bottom-sheet ${drawer === 'chat' ? 'chat-sheet' : ''}`} aria-description={canPullToDismiss ? '下拉标题区域，或在内容顶部下拉，可关闭面板' : undefined} role="dialog" aria-modal="true" aria-label={drawer === 'chat' ? '和音乐搭子聊天' : '小屋面板'}>{drawer === 'chat' ? <ChatPanel appearance={data?.profile.appearance} messages={messages} input={input} sending={sending} error={integrationError} greeting={companionGreeting(weather?.greeting || data?.greeting)} weather={weather ? `${weather.city} · ${weather.condition}，我陪着你` : '一直在线，随时听你说'} provider={integrationLabel} commands={quickCommands} conversationId={conversationId} onInput={setInput} onSend={(value, scene) => void send(value, scene)} onClose={() => setDrawer(null)} onPlay={play} onSelect={selection => { chatDrafts.current[conversationId] = input; setConversationId(selection.conversationId); setMessages(selection.messages); setInput(chatDrafts.current[selection.conversationId] || ''); setQuickCommands([]); setChatError(''); setActiveScene(''); }}/> : <>
<div className="sheet-handle"/><header className="sheet-heading"><div><h2>{drawer === 'favorites' ? '收藏的每一份心动' : drawer === 'lan' ? '局域网访问' : '我的音乐小屋'}</h2></div><button className="icon-button" onClick={() => setDrawer(null)} aria-label="关闭面板"><X size={21}/></button></header>
    {drawer === 'lan' ? <div className="sheet-content lan-sheet"><LanAccess/></div> : drawer === 'favorites' ? <div className="sheet-content">{[...new Map([...(data?.songs || []), ...recommendations, ...messages.flatMap(m => m.songs || [])].map(s => [s.id, s])).values()].filter(s => favorites.includes(s.id)).map(s => songRow(s))}{favorites.length === 0 && <div className="empty-state"><Heart size={38}/><h3>喜欢的旋律，留在这里</h3><p>点击歌曲旁的爱心，下一次就能轻松找到。</p></div>}</div> : <form className="sheet-content settings-form" onSubmit={async e => { e.preventDefault(); if (!rename.trim()) return; setSaving(true); try { const result = await post<{profile:Profile}>('/api/profile', { name: rename.trim() }); setData(old => old ? { ...old, profile: result.profile } : old); notify('新名字已经记住啦'); setDrawer(null); } catch (err) { notify(err instanceof Error ? err.message : '保存失败'); } finally { setSaving(false); } }}><label htmlFor="companion-name">给音乐搭子起个名字</label><input id="companion-name" value={rename} onChange={e => setRename(e.target.value)} maxLength={16} required/><button className="primary-button" disabled={saving}>{saving ? '保存中…' : '保存名字'}</button><div className="settings-note"><BookHeart size={20}/><p>你的聊天、日记、收藏和听歌记录，都会保存在这间小屋里。</p></div><p className="demo-note">昵称免密进入，同一昵称在不同设备打开的是同一间小屋。更改昵称后，请使用新昵称进入。</p><details className="data-credits"><summary>数据来源</summary><p>天气：<a href="https://open-meteo.com/" target="_blank" rel="noreferrer">Open-Meteo</a>（<a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer">CC BY 4.0</a>）</p><p>城市定位：<a href="https://photon.komoot.io/" target="_blank" rel="noreferrer">Photon</a> · © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap contributors</a></p></details></form>}
   </>} </section>
  </div>}
  {toast && <div className="toast" role="status">{toast}</div>}
 </div>;
}



