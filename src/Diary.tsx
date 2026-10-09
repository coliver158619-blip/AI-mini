import { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft, BookOpen, CalendarDays, Check, ChevronRight,
  Headphones, LoaderCircle, MapPin, Music2, PenLine, Play, Sparkles, Volume2, VolumeX, X,
} from 'lucide-react';
import type { Song } from './types';
import { WeatherIcon, type WeatherData } from './Weather';
import './diary.css';

type DiaryEntry = {
  date: string;
  title: string;
  body: string;
  mood: string;
  minutes: number;
  songCount: number;
  topSong: Song | null;
  note: string;
  isDemo?: boolean;
  weather?: WeatherData | null;
  locked?: boolean;
  story?: { text: string; updatedAt: string | null; stale: boolean; canGenerate: boolean; version: string };
};

type Props = { onBack: () => void; onPlay: (song: Song) => void };
type Turn = { entry: DiaryEntry; note: string; direction: 'older' | 'newer'; page: number };
const interactiveElements = 'button, textarea, input, a, select, label, [contenteditable]:not([contenteditable="false"])';

function hasTextSelection() {
  return window.getSelection()?.isCollapsed === false;
}

function dateParts(value: string) {
  const date = new Date(`${value}T12:00:00`);
  return {
    day: date.getDate(),
    month: date.toLocaleDateString('zh-CN', { month: 'long' }),
    weekday: date.toLocaleDateString('zh-CN', { weekday: 'long' }),
    full: date.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' }),
    english: date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }).toUpperCase(),
  };
}

async function errorMessage(response: Response) {
  try {
    const body = await response.json();
    return typeof body.error === 'string' ? body.error : '服务暂时没有回应，请稍后再试。';
  } catch {
    return '服务暂时没有回应，请稍后再试。';
  }
}

function EntryContent({ entry, onPlay }: { entry: DiaryEntry; onPlay?: (song: Song) => void }) {
  const date = dateParts(entry.date);
  return <>
    <div className="diary-page-eyebrow"><span>MY MUSIC DIARY</span><span>{date.english}</span></div>
    <div className="diary-date-block">
      <span className="diary-day">{String(date.day).padStart(2, '0')}</span>
      <div className="diary-date-detail"><span>{date.month} · {date.weekday}</span><span>今天的心情，被音乐记住了</span></div>
      <span className="diary-mood">{entry.weather ? <><WeatherIcon code={entry.weather.code} size={23} /><span className="diary-weather-text">{entry.weather.condition} {Math.round(entry.weather.temperature)}°</span></> : <><Music2 size={22} />{entry.mood || '随心听听'}</>}</span>
    </div>
    {entry.weather && <div className="diary-weather-caption"><MapPin size={11} /><span>{entry.weather.city} · 天气记录</span><span>{entry.mood || '随心听听'}</span></div>}
    <h2 className="diary-entry-title">{entry.title || '把今天，轻轻唱给你听'}</h2>
    <div className="diary-listening-stats">
      <span><Headphones size={15} /><strong>{entry.minutes}</strong> 分钟陪伴</span>
      <span className="diary-stat-divider" />
      <span><Music2 size={15} /><strong>{entry.songCount}</strong> 首心动旋律</span>
    </div>
    <div className="diary-body">{entry.body.split(/\n+/).filter(Boolean).map((paragraph, index) => <p key={index}>{paragraph}</p>)}</div>
    {entry.topSong && <div className="diary-song-section">
      <div className="diary-small-label"><span className="diary-small-dash" /> 今天，最想留住的旋律</div>
      <button className="diary-song-card" type="button" onClick={() => onPlay?.(entry.topSong!)} tabIndex={onPlay ? 0 : -1} aria-label={`播放 ${entry.topSong.title}，${entry.topSong.artist}`}>
        <span className="diary-song-cover" style={{ backgroundColor: entry.topSong.color || '#e6b590' }}><Music2 size={23} /><span className="diary-cover-dot" /></span>
        <span className="diary-song-text"><strong>{entry.topSong.title}</strong><span>{entry.topSong.artist}</span></span>
        <span className="diary-song-play"><Play size={16} fill="currentColor" /></span>
      </button>
    </div>}
    {entry.story?.text && <div className="diary-companion-note"><Sparkles size={17} /><p>写给这一天的我们</p><span>— 你的小小音乐搭子</span></div>}
  </>;
}

export default function Diary({ onBack, onPlay }: Props) {
  const [entries, setEntries] = useState<DiaryEntry[]>([]);
  const [index, setIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [savingDate, setSavingDate] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Record<string, { text: string; error: boolean }>>({});
  const [turn, setTurn] = useState<Turn | null>(null);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [reading, setReading] = useState(false);
  const [speechAvailable, setSpeechAvailable] = useState(false);
  const [speechError, setSpeechError] = useState('');
  const [navigationMessage, setNavigationMessage] = useState('');
  const turnTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pointer = useRef<{ id: number; x: number; y: number; moved: boolean; selecting: boolean } | null>(null);
  const suppressClick = useRef(false);
  const calendarRef = useRef<HTMLDialogElement>(null);
  const dateTrigger = useRef<HTMLButtonElement>(null);
  const entry = entries[index];
  const note = entry ? drafts[entry.date] ?? entry.note : '';
  const dirty = Boolean(entry && note !== entry.note);
  const canReadOlder = index < entries.length - 1;
  const canReadNewer = index > 0;
  const boundaryHint = entries.length === 1 ? '目前只有这一篇，新的音乐故事会慢慢写下。'
    : !canReadNewer ? '已是最新一篇，轻点右侧翻看往日。'
      : !canReadOlder ? '已到最早一篇，轻点左侧返回。' : '也可以左右滑动，慢慢重温。';

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    fetch('/api/diary', { signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw new Error(await errorMessage(response));
        return response.json();
      })
      .then(data => {
        setEntries([...data.entries].sort((a: DiaryEntry, b: DiaryEntry) => b.date.localeCompare(a.date)));
        setIndex(0);
      })
      .catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : '日记暂时没有打开，请重试。'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [retry]);

  useEffect(() => {
    setSpeechAvailable('speechSynthesis' in window && 'SpeechSynthesisUtterance' in window);
    return () => {
      if ('speechSynthesis' in window) window.speechSynthesis.cancel();
      if (turnTimer.current) clearTimeout(turnTimer.current);
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const timer = setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      void fetch('/api/diary', { signal: controller.signal }).then(async response => {
        if (!response.ok) return;
        const data: { entries: DiaryEntry[] } = await response.json();
        if (!controller.signal.aborted) setEntries(current => current.map(item => data.entries.find(updated => updated.date === item.date) || item));
      }).catch(() => { /* Keep the saved pages when the connection is unavailable. */ });
    }, 30_000);
    return () => { clearInterval(timer); controller.abort(); };
  }, []);

  useEffect(() => {
    if (calendarOpen) calendarRef.current?.showModal();
    else calendarRef.current?.close();
  }, [calendarOpen]);

  function stopReading() {
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    setReading(false);
  }

  function goTo(nextIndex: number) {
    if (!entry || turn || nextIndex === index) return;
    if (nextIndex < 0 || nextIndex >= entries.length) {
      setNavigationMessage(entries.length === 1 ? '这本日记暂时只有这一篇，今天的心情可以继续写在这里。'
        : nextIndex < 0 ? '已经是最新一篇了，轻点右侧翻看往日。' : '已经翻到最早一篇了，轻点左侧返回。');
      return;
    }
    setNavigationMessage('');
    stopReading();
    setSpeechError('');
    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setTurn({ entry, note, direction: nextIndex > index ? 'older' : 'newer', page: entries.length - index });
      turnTimer.current = setTimeout(() => setTurn(null), 740);
    }
    setIndex(nextIndex);
  }

  async function saveNote() {
    if (!entry || savingDate || !dirty) return;
    const date = entry.date;
    const text = note;
    setSavingDate(date);
    setFeedback(current => ({ ...current, [date]: { text: '', error: false } }));
    try {
      const response = await fetch(`/api/diary/${encodeURIComponent(date)}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ note: text }),
      });
      if (!response.ok) throw new Error(await errorMessage(response));
      const data = await response.json();
      setEntries(current => current.map(item => item.date === date ? data.entry : item));
      setDrafts(current => current[date] === text ? { ...current, [date]: data.entry.note } : current);
      setFeedback(current => ({ ...current, [date]: { text: '心情已收好，下次打开也在。', error: false } }));
    } catch (cause) {
      setFeedback(current => ({ ...current, [date]: { text: cause instanceof Error ? cause.message : '没有保存成功，文字还在，请重试。', error: true } }));
    } finally {
      setSavingDate(null);
    }
  }

  function readDiary() {
    if (!entry || !speechAvailable) return;
    if (reading) { stopReading(); return; }
    window.speechSynthesis.cancel();
    setSpeechError('');
    const utterance = new SpeechSynthesisUtterance(`${dateParts(entry.date).full}。${entry.title}。${entry.body}${note ? `。我的心情。${note}` : ''}`);
    utterance.lang = 'zh-CN';
    utterance.rate = 0.9;
    const chineseVoice = window.speechSynthesis.getVoices().find(voice => voice.lang.toLowerCase().startsWith('zh'));
    if (chineseVoice) utterance.voice = chineseVoice;
    utterance.onend = () => setReading(false);
    utterance.onerror = event => {
      setReading(false);
      if (event.error !== 'canceled' && event.error !== 'interrupted') setSpeechError('暂时无法播报，可以继续阅读这篇日记。');
    };
    setReading(true);
    window.speechSynthesis.speak(utterance);
  }

  function closeCalendar() {
    setCalendarOpen(false);
    dateTrigger.current?.focus();
  }

  return <main className="diary-screen">
    <header className="diary-topbar">
      <button type="button" className="diary-icon-button" onClick={onBack} aria-label="返回首页"><ArrowLeft size={21} /></button>
      <span>我的音乐日记</span>
      <button ref={dateTrigger} type="button" className="diary-icon-button" onClick={() => setCalendarOpen(true)} disabled={!entries.length} aria-label="选择日记日期"><CalendarDays size={20} /></button>
    </header>
    {loading ? <div className="diary-state" role="status"><LoaderCircle size={25} className="diary-spinner" /><p>正在翻开你的音乐日记…</p></div> : error ? <div className="diary-state" role="alert"><BookOpen size={30} /><p>{error}</p><button className="diary-retry" type="button" onClick={() => setRetry(value => value + 1)}>再打开一次</button></div> : !entry ? <div className="diary-state"><BookOpen size={34} /><h2>第一篇日记，正在等你</h2><p>去听一首歌，让今天有一点旋律。</p><button className="diary-retry" type="button" onClick={onBack}>去听音乐</button></div> : <>
      <div className="diary-book-toolbar"><span><BookOpen size={15} /> 第 {entries.length - index} 篇 / 共 {entries.length} 篇</span><button type="button" onClick={readDiary} disabled={!speechAvailable} className={reading ? 'is-reading' : ''} title={!speechAvailable ? '当前浏览器暂不支持语音播报' : undefined}>{reading ? <VolumeX size={15} /> : <Volume2 size={15} />}{reading ? '停止播报' : '听小伴读日记'}</button></div>
      {speechError && <p className="diary-speech-feedback" role="status">{speechError}</p>}
      <div className={`diary-book${turn ? ' diary-is-turning' : ''}${entries.length > 1 ? ' diary-book-can-turn' : ''}`} tabIndex={0} role="region" aria-label="音乐日记本" aria-describedby="diary-turn-hint diary-keyboard-hint diary-navigation-status" aria-keyshortcuts="ArrowLeft ArrowRight" aria-busy={Boolean(turn)}
        onKeyDown={event => {
          if ((event.target as Element).closest(interactiveElements) || hasTextSelection()) return;
          if (event.key === 'ArrowLeft') { event.preventDefault(); goTo(index - 1); }
          if (event.key === 'ArrowRight') { event.preventDefault(); goTo(index + 1); }
        }}
        onPointerDown={event => {
          pointer.current = null;
          suppressClick.current = false;
          if (!event.isPrimary || event.button !== 0 || (event.target as Element).closest(interactiveElements)) return;
          const selecting = hasTextSelection();
          suppressClick.current = selecting;
          pointer.current = { id: event.pointerId, x: event.clientX, y: event.clientY, moved: false, selecting };
        }}
        onPointerMove={event => {
          const start = pointer.current;
          if (!start || start.id !== event.pointerId) return;
          if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > 8) {
            start.moved = true;
            suppressClick.current = true;
          }
        }}
        onPointerUp={event => {
          const start = pointer.current;
          if (!start || start.id !== event.pointerId) return;
          pointer.current = null;
          const dx = event.clientX - start.x;
          const dy = event.clientY - start.y;
          suppressClick.current = start.moved || Math.hypot(dx, dy) > 8 || start.selecting || hasTextSelection();
          if (start.selecting || hasTextSelection() || (event.target as Element).closest(interactiveElements)) return;
          if (Math.abs(dx) > 55 && Math.abs(dy) < 85 && Math.abs(dx) > Math.abs(dy) * 1.3) goTo(index + (dx < 0 ? 1 : -1));
        }}
        onPointerCancel={() => { pointer.current = null; suppressClick.current = true; }}
        onClick={event => {
          if ((event.target as Element).closest(interactiveElements)) return;
          if (suppressClick.current) { suppressClick.current = false; return; }
          if (hasTextSelection() || event.button !== 0) return;
          const bounds = event.currentTarget.getBoundingClientRect();
          goTo(index + (event.clientX >= bounds.left + bounds.width / 2 ? 1 : -1));
        }}>
        <div className="diary-book-cover" aria-hidden="true" />
        <div className="diary-page-edges" aria-hidden="true" />
        <article className="diary-paper" aria-label={dateParts(entry.date).full}>
          <span className="diary-bookmark" aria-hidden="true"><Music2 size={15} /></span>
          <EntryContent entry={entry} onPlay={onPlay} />
          <div className="diary-personal-note">
            <label htmlFor="diary-note"><PenLine size={15} /> 留一句话给今天</label>
            <textarea readOnly={entry.locked} id="diary-note" value={note} maxLength={4000} rows={3} placeholder="此刻的心情，或一件值得记住的小事…" onChange={event => {
              setDrafts(current => ({ ...current, [entry.date]: event.target.value }));
              setFeedback(current => ({ ...current, [entry.date]: { text: '', error: false } }));
            }} />
            <div className="diary-note-actions"><span>{entry.locked ? '这一天已定稿，回忆好好收藏' : dirty ? '尚未保存' : '正文每天 22:00 更新，心情可以随时记录'}</span><button type="button" onClick={saveNote} disabled={entry.locked || !dirty || savingDate !== null}>{savingDate === entry.date ? <LoaderCircle size={14} className="diary-spinner" /> : !dirty && note ? <Check size={14} /> : <PenLine size={13} />}{savingDate === entry.date ? '保存中' : !dirty && note ? '已保存' : '保存心情'}</button></div>
            {feedback[entry.date]?.text && <p role="status" className={`diary-save-feedback${feedback[entry.date].error ? ' diary-feedback-error' : ''}`}>{feedback[entry.date].text}</p>}
          </div>
          <footer className="diary-page-footer"><span>{entry.isDemo ? '体验日记 · 示例听歌记录' : '与音乐一起，把平凡写成珍藏'}</span><span>{String(entries.length - index).padStart(2, '0')}</span></footer>
          {canReadOlder && <span className="diary-page-corner diary-corner-right" aria-hidden="true" />}
          {canReadNewer && <span className="diary-page-corner diary-corner-left" aria-hidden="true" />}
        </article>
        {turn && <div className={`diary-turning-page diary-turn-${turn.direction}`} aria-hidden="true"><div className="diary-turn-front"><EntryContent entry={turn.entry} /><div className="diary-personal-note"><label><PenLine size={15} /> 留一句话给今天</label><div className="diary-note-snapshot">{turn.note || '此刻的心情，或一件值得记住的小事…'}</div></div><footer className="diary-page-footer"><span>与音乐一起，把平凡写成珍藏</span><span>{String(turn.page).padStart(2, '0')}</span></footer></div><div className="diary-turn-back" /></div>}
      </div>
      <p className="diary-current-date" aria-live="polite" aria-atomic="true">{dateParts(entry.date).full}</p>
      <p id="diary-turn-hint" className="diary-swipe-hint">{entries.length > 1 ? '轻点右侧翻页，左侧返回' : '一页日记，收好今天的旋律'}</p>
      <p id="diary-navigation-status" className="diary-navigation-status" role="status" aria-atomic="true">{navigationMessage || boundaryHint}</p>
      <span id="diary-keyboard-hint" className="diary-sr-only">{entries.length > 1 ? '方向键向右翻看更早日记，向左返回较新日记；左划翻页，右划返回。' : '目前只有一篇日记，暂无其他页面。'}</span>
    </>}
    <dialog ref={calendarRef} className="diary-date-dialog" onCancel={event => { event.preventDefault(); closeCalendar(); }} onClick={event => { if (event.target === event.currentTarget) closeCalendar(); }} aria-labelledby="diary-calendar-title">
      <div className="diary-calendar-heading"><div><span>YOUR MUSIC DAYS</span><h2 id="diary-calendar-title">想翻开哪一天？</h2></div><button type="button" className="diary-icon-button" onClick={closeCalendar} aria-label="关闭日期选择"><X size={20} /></button></div>
      <div className="diary-calendar-list">{entries.map((item, itemIndex) => <button type="button" key={item.date} className={index === itemIndex ? 'is-selected' : ''} onClick={() => { goTo(itemIndex); closeCalendar(); }}><span><strong>{dateParts(item.date).full}</strong><span>{item.title}</span></span>{index === itemIndex ? <Check size={18} /> : <ChevronRight size={18} />}</button>)}</div>
    </dialog>
  </main>;
}
