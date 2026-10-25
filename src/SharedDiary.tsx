import { useEffect, useState } from 'react';
import { BookHeart, ChevronLeft, ChevronRight, Heart, LoaderCircle, Save, Sparkles } from 'lucide-react';
import { api } from './api';
import './diary.css';
import './shared-space.css';

type Entry = { date: string; note: string; body: string; revision: number; source: string; updatedAt: string | null };
const blank = (date: string): Entry => ({ date, note: '', body: '', revision: 0, source: 'manual', updatedAt: null });
function readDrafts(draftKey: string): Record<string, Entry> {
 try { const value = JSON.parse(localStorage.getItem(draftKey) || '{}'); return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry && typeof entry === 'object' && typeof (entry as Entry).note === 'string' && typeof (entry as Entry).body === 'string' && Number.isInteger((entry as Entry).revision))) as Record<string, Entry>; } catch { return {}; }
}

export default function SharedDiary({ onBack, userId = 'legacy' }: { onBack: () => void; userId?: string }) {
 const draftKey = userId === 'legacy' ? 'shared-diary-drafts-v1' : `shared-diary-drafts-v1:${userId}`;
 const [entries, setEntries] = useState<Entry[]>([]), [day, setDay] = useState(''), [today, setToday] = useState('');
 const [drafts, setDrafts] = useState(() => readDrafts(draftKey)), [loading, setLoading] = useState(true), [loadError, setLoadError] = useState('');
 const [busy, setBusy] = useState<'save' | 'ai' | null>(null), [status, setStatus] = useState(''), [error, setError] = useState(''), [retry, setRetry] = useState(0);
 const saved = entries.find(item => item.date === day) || blank(day), current = drafts[day] || saved;
 const dirty = current.note !== saved.note || current.body !== saved.body;
 const days = [...new Set([...entries.map(item => item.date), ...Object.keys(drafts), day])].filter(Boolean).sort().reverse();
 const index = days.indexOf(day);
 useEffect(() => { const controller = new AbortController(); setLoading(true); setLoadError(''); api<{ entries: Entry[]; today: string }>('/api/shared-diary', { signal: controller.signal }).then(result => { setEntries(result.entries); setToday(result.today); setDay(value => value || result.today); }).catch(cause => { if (!controller.signal.aborted) setLoadError(cause.message); }).finally(() => { if (!controller.signal.aborted) setLoading(false); }); return () => controller.abort(); }, [retry]);
 useEffect(() => { try { localStorage.setItem(draftKey, JSON.stringify(drafts)); } catch { setError('设备无法暂存草稿，请点击保存日记，避免离开后丢失输入。'); } }, [drafts]);
 useEffect(() => { if (!dirty) return; const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); }; window.addEventListener('beforeunload', warn); return () => window.removeEventListener('beforeunload', warn); }, [dirty]);
 function change(update: Partial<Pick<Entry, 'note' | 'body'>>) { setDrafts(old => ({ ...old, [day]: { ...current, ...update } })); setStatus(''); setError(''); }
 function accept(entry: Entry) { setEntries(old => [...old.filter(item => item.date !== entry.date), entry]); setDrafts(old => { const next = { ...old }; delete next[entry.date]; return next; }); }
 async function save(generate: boolean) {
  if (busy || !day) return;
  setBusy(generate ? 'ai' : 'save'); setError(''); setStatus('');
  try {
   let entry = current;
   if (dirty || !saved.revision) { const result = await api<{ entry: Entry }>(`/api/shared-diary/${day}`, { method: 'PUT', body: JSON.stringify({ note: current.note, body: current.body, revision: current.revision }) }); entry = result.entry; accept(entry); }
   if (generate) { const result = await api<{ entry: Entry }>(`/api/shared-diary/${day}/story`, { method: 'POST', body: JSON.stringify({ revision: entry.revision }), signal: AbortSignal.timeout(100000) }); accept(result.entry); }
   setStatus(generate ? 'AI 已整理好，可以继续编辑正文，写成我们喜欢的样子。' : '共同回忆已保存。');
  } catch (cause) { setError(cause instanceof Error ? cause.message : '暂时保存失败，请重试'); }
  finally { setBusy(null); }
 }
 function selectDay(value: string) { if (value && value >= '2000-01-01' && value <= today) { setDay(value); setStatus(''); setError(''); } }
 return <main className="diary-screen shared-diary">
  <header className="diary-topbar"><button className="diary-icon-button" onClick={onBack} disabled={!!busy} aria-label="返回陪伴空间"><ChevronLeft size={24}/></button><h1>共享日记</h1><BookHeart size={24}/></header>
  {loading ? <div className="diary-state" role="status"><LoaderCircle className="spin"/><p>正在翻开我们的回忆…</p></div> : loadError ? <div className="diary-state" role="alert"><p>{loadError}</p><button className="diary-retry" onClick={() => setRetry(value => value + 1)}>重新打开</button></div> : <>
   <div className="shared-date"><button aria-label="上一篇共享日记" disabled={!!busy || index >= days.length - 1} onClick={() => selectDay(days[index + 1])}><ChevronLeft size={20}/></button><label>我们的这一天<input type="date" aria-label="共享日记日期" min="2000-01-01" max={today} value={day} disabled={!!busy} onChange={event => selectDay(event.target.value)}/></label><button aria-label="下一篇共享日记" disabled={!!busy || index <= 0} onClick={() => selectDay(days[index - 1])}><ChevronRight size={20}/></button></div>
   <div className="diary-book" aria-label="共享日记本"><div className="diary-book-cover"/><div className="diary-page-edges"/><article className="diary-paper">
    <div className="diary-paper-heading"><div className="diary-date-block"><strong className="diary-day">{day.slice(5).replace('-', '.')}</strong><Heart size={18} fill="#e8b6c1" stroke="#c98e9d"/></div><span className="diary-day-label">Our Story</span></div>
    <label className="shared-experience">两人的共同经历<textarea aria-label="两人的共同经历" placeholder="今天我们一起做了什么？写下散步、聊天、惊喜，或一件值得记住的小事…" maxLength={3000} rows={4} disabled={!!busy} value={current.note} onChange={event => change({ note: event.target.value })}/><small>{current.note.length}/3000</small></label>
    <div className="shared-body-label"><BookHeart size={16}/>我们的日记<span>可直接编辑</span></div>
    <div className="diary-writing-area"><textarea aria-label="共享日记正文" placeholder="亲手写下回忆，或让 AI 根据上面的共同经历整理成日记…" maxLength={5000} disabled={!!busy} value={current.body} onChange={event => change({ body: event.target.value })}/></div>
    <div className="diary-paper-bottom"><span className="diary-note-count">{current.body.length}/5000</span><span className="shared-signature">你和我 · 一起记得 ♡</span></div><span className="diary-page-corner"/>
   </article></div>
   <div className="shared-actions"><button disabled={!!busy || (!dirty && !!saved.revision)} onClick={() => void save(false)}><Save size={17}/>{busy === 'save' ? '保存中…' : '保存日记'}</button><button disabled={!!busy || !current.note.trim()} onClick={() => void save(true)}>{busy === 'ai' ? <LoaderCircle size={17} className="spin"/> : <Sparkles size={17}/>} {busy === 'ai' ? '正在整理回忆…' : 'AI 总结共同经历'}</button></div>
   <p className="diary-feedback">{dirty ? '草稿暂存在此设备，点击保存可留在共享日记中。' : '共同经历与日记正文都可以继续修改。'}</p>
   {status && <p className="diary-feedback" role="status">{status}</p>}{error && <div className="shared-error" role="alert"><p>{error}</p><button disabled={!!busy} onClick={() => setRetry(value => value + 1)}>重新读取已保存版本</button>{drafts[day] && <button disabled={!!busy} onClick={() => { if (window.confirm('用已保存的版本替换本地草稿？')) { setDrafts(old => { const next = { ...old }; delete next[day]; return next; }); setRetry(value => value + 1); } }}>放弃本地草稿</button>}</div>}
  </>}
 </main>;
}
