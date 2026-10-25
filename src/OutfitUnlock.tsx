import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Check, Heart, LoaderCircle, LockKeyhole, Music2, Sparkles, X } from 'lucide-react';
import { api } from './api';
import type { Outfit } from './types';

type Props = { outfit: Outfit; onUnlocked: (outfit: Outfit) => void; onClose: () => void };
type UnlockResult = { outfit: Outfit; message: string; alreadyUnlocked: boolean };

export default function OutfitUnlock({ outfit, onUnlocked, onClose }: Props) {
 const dialog = useRef<HTMLDialogElement>(null);
 const request = useRef<AbortController | null>(null);
 const busy = useRef(false);
 const onUnlockedRef = useRef(onUnlocked); onUnlockedRef.current = onUnlocked;
 const [phase, setPhase] = useState<'confirm' | 'checking' | 'granting' | 'success'>('confirm');
 const [result, setResult] = useState<UnlockResult | null>(null);
 const [error, setError] = useState('');
 const album = outfit.unlockMethod === 'album';
 const working = phase === 'checking' || phase === 'granting';

 useEffect(() => {
  const previousOverflow = document.body.style.overflow;
  document.body.style.overflow = 'hidden';
  dialog.current?.showModal();
  return () => { document.body.style.overflow = previousOverflow; request.current?.abort(); };
 }, []);
 useEffect(() => {
  if (phase !== 'granting' || !result) return;
  const timer = window.setTimeout(() => {
   onUnlockedRef.current(result.outfit); setPhase('success'); busy.current = false;
  }, window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 250 : 1800);
  return () => window.clearTimeout(timer);
 }, [phase, result]);

 async function unlock() {
  if (busy.current) return;
  busy.current = true; setError(''); setPhase('checking');
  const controller = new AbortController(); request.current = controller;
  const timeout = window.setTimeout(() => controller.abort(), 15000);
  try {
   const response = await api<UnlockResult>('/api/outfit/unlock', {
    method: 'POST', body: JSON.stringify({ outfitId: outfit.id }), signal: controller.signal,
   });
   if (!controller.signal.aborted) { setResult(response); setPhase('granting'); }
  } catch (cause) {
   if (!dialog.current?.isConnected) return;
   setError(controller.signal.aborted ? '连接有点慢，请再试一次。' : cause instanceof Error ? cause.message : '解锁没有成功，请重试。');
   setPhase('confirm'); busy.current = false;
  } finally { window.clearTimeout(timeout); }
 }

 return <dialog ref={dialog} className={`outfit-unlock-dialog phase-${phase}${album ? ' is-album' : ''}`}
  aria-labelledby="outfit-unlock-title" aria-describedby="outfit-unlock-message"
  onCancel={event => { event.preventDefault(); if (!busy.current) onClose(); }}
  onClick={event => { if (event.target === event.currentTarget && !busy.current) onClose(); }}>
  {(phase === 'granting' || phase === 'success') && <div className="unlock-celebration" aria-hidden="true">
   <span className="unlock-halo"/><span className="unlock-halo second"/>
   {Array.from({ length: 24 }, (_, i) => <i key={i} style={{ '--x': `${(i * 37 + 7) % 100}%`, '--delay': `${(i % 6) * .12}s`, '--turn': `${i * 47}deg`, '--color': ['#f4adca', '#e4c36c', '#a9dcca', '#c1b0f0'][i % 4] } as CSSProperties}>{i % 3 === 0 ? '✦' : '♪'}</i>)}
  </div>}
  <section className="outfit-unlock-card" style={{ '--outfit-color': outfit.color } as CSSProperties}>
   <button className="unlock-close" aria-label="关闭解锁弹窗" disabled={working} onClick={onClose}><X size={18}/></button>
   <span className="unlock-kicker">{album ? <Music2 size={15}/> : <Heart size={15}/>} {album ? '珍藏唱片 · 专属装扮' : '陪伴时光 · 闪耀新装'}</span>
   <div className="unlock-portrait"><img src={outfit.thumbnailUrl} alt={outfit.name} width={320} height={320}/><span>{phase === 'success' ? <Check size={23}/> : phase === 'granting' ? <Sparkles size={23}/> : <LockKeyhole size={23}/>}</span></div>
   <p className="unlock-outfit-name">{outfit.tag} · {outfit.name}</p>
   <h2 id="outfit-unlock-title">{phase === 'success' ? '好耶，新装扮解锁啦！' : working ? '让心动闪闪发光' : '解锁一份小惊喜？'}</h2>
   <p id="outfit-unlock-message" aria-live="polite">{phase === 'success' ? '锁已经消失啦，现在可以自由装扮。' : phase === 'granting' ? result?.message : phase === 'checking' ? '正在检查解锁条件…' : '当前装扮尚未解锁，是否解锁？'}</p>
   {error && <p className="unlock-error" role="alert">{error}</p>}
   <div className="unlock-actions">
    {phase === 'confirm' ? <><button className="unlock-later" onClick={onClose}>下次再说</button><button className="unlock-yes" onClick={() => void unlock()}><Heart size={16}/>是，解锁吧</button></>
     : phase === 'success' ? <button className="unlock-yes" onClick={onClose}><Sparkles size={17}/>好耶，去试穿</button>
     : <button className="unlock-yes" disabled><LoaderCircle size={17} className="spin"/>{phase === 'granting' ? '正在解锁…' : '正在检查…'}</button>}
   </div>
  </section>
 </dialog>;
}
