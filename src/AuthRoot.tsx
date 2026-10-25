import { useEffect, useState } from 'react';
import { ArrowRight, Check, LoaderCircle, Music2, Sparkles } from 'lucide-react';
import App from './App';
import { api, post, setApiUser } from './api';
import type { Profile } from './types';
import './entry.css';

type User = { id: string; nickname: string; gender: 'male' | 'female'; onboardingComplete: boolean };
type Session = { enabled?: boolean; user: User | null; profile?: Profile };

function GenderSymbol({ gender }: { gender: 'male' | 'female' }) {
 const male = gender === 'male';
 return <svg className="entry-gender-symbol" viewBox="0 0 96 96" aria-hidden="true"><defs>
  <linearGradient id={`gender-${gender}`} x1="0" y1="0" x2="1" y2="1"><stop stopColor={male ? '#83e2ff' : '#ffbfdf'}/><stop offset="1" stopColor={male ? '#7778ef' : '#ef68b3'}/></linearGradient>
 </defs><g fill="none" stroke={`url(#gender-${gender})`} strokeWidth="10" strokeLinecap="round" strokeLinejoin="round">
  <circle cx={male ? 39 : 48} cy={male ? 56 : 34} r="23"/>
  {male ? <path d="M56 39 79 16M60 16h19v19"/> : <path d="M48 57v26M33 72h30"/>}
 </g><path d={male ? 'M23 48q4-9 13-9' : 'M32 26q4-9 13-9'} fill="none" stroke="white" strokeOpacity=".85" strokeWidth="4" strokeLinecap="round"/>
 </svg>;
}

function GenerateRoom({ user, profile, onEnter, onExit }: { user: User; profile: Profile; onEnter: () => Promise<void>; onExit: () => Promise<void> }) {
 const [step, setStep] = useState(0), [ready, setReady] = useState(false), [imageError, setImageError] = useState(false);
 const [busy, setBusy] = useState(false), [error, setError] = useState(''), [retry, setRetry] = useState(0);
 useEffect(() => { const timers = [1800, 3600, 6200].map((delay, index) => setTimeout(() => setStep(index + 1), delay)); return () => timers.forEach(clearTimeout); }, []);
 const labels = ['正在检测您的音乐歌单', '正在分析您的音乐喜好', '生成音乐形象中'];
 const imageUrl = profile.appearance.imageUrl;
 return <main className="entry-page"><section className="entry-card entry-generation">
  <span className="entry-eyebrow"><Sparkles size={16}/> OUR MUSIC, OUR ROOM</span>
  <h1>{step === 3 ? `${user.nickname}，很高兴遇见你` : '让音乐，把我们连在一起'}</h1>
  <p className="entry-subtitle">为你遇见的第一位音乐搭子，留一点惊喜</p>
  <div className={`entry-reveal ${ready ? 'is-loaded' : ''} ${step === 3 ? 'is-complete' : ''}`}>
   <div className="entry-reveal-orbit"/>
   <img className="entry-silhouette" src={imageUrl} alt="" aria-hidden="true"/>
   <img key={retry} className="entry-reveal-character" src={imageUrl} alt={`${profile.appearance.name}，你的初始音乐形象`} onLoad={() => { setReady(true); setImageError(false); }} onError={() => setImageError(true)}/>
   <span className="entry-floating-note">♪</span><span className="entry-floating-note second">♫</span>
  </div>
  <div className="entry-progress" aria-live="polite">{labels.map((label, i) => <div key={label} className={step > i ? 'done' : step === i ? 'current' : ''}>{step > i ? <Check size={16}/> : step === i ? <LoaderCircle className="spin" size={16}/> : <span className="entry-step-dot"/>}<span>{label}</span></div>)}</div>
  <p className="entry-match-note">首次体验将随机匹配同一性别的初始形象，之后可自由挑选。</p>
  {imageError && <button className="entry-text-button" onClick={() => { setRetry(value => value + 1); setImageError(false); }}>形象还在路上，点击重新加载</button>}
  {error && <p role="alert" className="entry-error">{error}</p>}
  <button className="entry-primary" disabled={step < 3 || !ready || imageError || busy} onClick={async () => { setBusy(true); try { await onEnter(); } catch (cause) { setError(cause instanceof Error ? cause.message : '暂时没有连接上，再试一次吧'); setBusy(false); } }}>{busy ? '正在打开小屋…' : '进入我的小屋'}<ArrowRight size={20}/></button>
  <button className="entry-text-button" disabled={busy} onClick={() => { void onExit().catch(cause => setError(cause.message)); }}>换一个昵称</button>
 </section></main>;
}

export default function AuthRoot() {
 const [session, setSession] = useState<Session | null>(null), [error, setError] = useState(''), [retry, setRetry] = useState(0);
 const [name, setName] = useState(''), [gender, setGender] = useState<'male' | 'female' | ''>(''), [busy, setBusy] = useState(false);
 const accept = (value: Session) => { setApiUser(value.user?.id || ''); setSession(value); setError(''); };
 useEffect(() => { let cancelled = false; api<Session>('/api/auth/session').then(value => { if (!cancelled) accept(value); }).catch(cause => { if (!cancelled) setError(cause.message); }); return () => { cancelled = true; }; }, [retry]);
 useEffect(() => { const expired = () => { accept({ enabled: true, user: null }); setError('重新输入昵称，回到你的小屋吧'); }; window.addEventListener('music-session-ended', expired); return () => window.removeEventListener('music-session-ended', expired); }, []);
 const logout = async () => { await post('/api/auth/logout', {}); accept({ enabled: true, user: null }); setName(''); setGender(''); history.replaceState(null, '', location.pathname + location.search); };
 if (session?.enabled === false) return <App/>;
 if (session?.user?.onboardingComplete) return <App key={session.user.id} userId={session.user.id} onLogout={logout}/>;
 if (session?.user && session.profile) return <GenerateRoom key={session.user.id} user={session.user} profile={session.profile} onExit={logout} onEnter={async () => { const result = await post<{user:User}>('/api/auth/complete', {}); history.replaceState(null, '', location.pathname + location.search); accept({ enabled: true, user: result.user }); }}/>;
 if (!session) return <main className="entry-page"><section className="entry-card entry-loading"><Music2 size={40}/><h1>你的小屋，马上就好</h1>{error ? <><p role="alert" className="entry-error">{error}</p><button className="entry-primary" onClick={() => { setError(''); setRetry(value => value + 1); }}>重新连接</button></> : <LoaderCircle className="spin"/>}</section></main>;
 return <main className="entry-page"><section className="entry-card">
  <div className="entry-brand"><Music2 size={30}/></div>
  <span className="entry-eyebrow">NICE TO MEET YOU</span>
  <h1>给陪伴，起个名字</h1><p className="entry-subtitle">一段旋律，一位懂你的音乐搭子</p>
  <form onSubmit={async event => { event.preventDefault(); if (busy) return; setBusy(true); setError(''); try { const result = await post<Session>('/api/auth/login', { nickname: name, gender }); accept({ ...result, enabled: true }); } catch (cause) { setError(cause instanceof Error ? cause.message : '暂时没有连接上，再试一次吧'); } finally { setBusy(false); } }}>
   <label className="entry-label" htmlFor="entry-name">AI 形象昵称</label>
   <input id="entry-name" className="entry-name" value={name} onChange={event => setName(event.target.value)} placeholder="想怎么称呼你的搭子？" autoComplete="username" maxLength={16} required disabled={busy}/>
   <div className="entry-label entry-gender-label">选择搭子的性别<span>新朋友第一次见面时选择</span></div>
   <div className="entry-genders" role="group" aria-label="选择搭子的性别">{(['male', 'female'] as const).map(value => <button type="button" key={value} className={`entry-gender ${value} ${gender === value ? 'selected' : ''}`} aria-pressed={gender === value} onClick={() => setGender(value)} disabled={busy}><GenderSymbol gender={value}/><strong>{value === 'male' ? '男生' : '女生'}</strong><span>{value === 'male' ? '温柔的蓝色频率' : '心动的粉色旋律'}</span>{gender === value && <Check className="entry-gender-check" size={18}/>}</button>)}</div>
   {error && <p role="alert" className="entry-error">{error}</p>}
   <button className="entry-primary" disabled={busy || !name.trim()}>{busy ? <><LoaderCircle className="spin" size={20}/>正在找到你的小屋…</> : <>遇见我的音乐搭子<ArrowRight size={20}/></>}</button>
  </form>
  <p className="entry-footnote">已有昵称？输入后就能回到原来的小屋，无需再选性别。<br/>昵称免密进入，同一昵称在不同设备打开的是同一间小屋。</p>
 </section></main>;
}
