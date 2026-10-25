import { roomFetch } from './api';
import { useEffect, useRef, useState } from 'react';
import { BookOpen, CalendarDays, Camera, Check, ChevronLeft, ChevronRight, Image, ImagePlus, LoaderCircle, LocateFixed, MapPin, Mic, Music2, Play, Square, Volume2, VolumeX, X } from 'lucide-react';
import type { Song } from './types';
import { WeatherIcon, type WeatherData } from './Weather';
import './diary.css';

type Attachment = { id: string; kind: 'photo' | 'camera' | 'voice'; url: string; mimeType: string; name: string; caption?: string };
type DiaryInputs = { note: string; songId?: string | null; song?: Song | null; location?: { text: string; latitude?: number; longitude?: number } | null; attachments: Attachment[]; voiceTranscript: string };
type DiaryEntry = { date: string; title: string; body: string; mood: string; minutes: number; songCount: number; topSong: Song | null; note: string; weather?: WeatherData | null; canEdit?: boolean; isLocked?: boolean; inputs?: DiaryInputs; story?: { text: string; updatedAt: string | null; stale: boolean; canGenerate: boolean; version: string; source?: string } };
type Props = { onBack: () => void; onPlay: (song: Song) => void };
type InputMode = 'photo' | 'camera' | 'voice' | 'location' | 'song' | 'note';
type Recognition = { lang: string; continuous: boolean; interimResults: boolean; onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>>; resultIndex: number }) => void) | null; onerror: (() => void) | null; start: () => void; stop: () => void };
const interactive = 'button, textarea, input, a, select, label';
const inputTitles: Record<InputMode, string> = { photo: '留下一张照片', camera: '拍下今天', voice: '说说今天', location: '记录此刻的位置', song: '选择一首歌', note: '写下今天的故事' };
function inputsOf(entry: DiaryEntry): DiaryInputs { return { note: entry.inputs?.note ?? entry.note ?? '', songId: entry.inputs?.songId ?? null, song: entry.inputs?.song ?? null, location: entry.inputs?.location ?? null, attachments: entry.inputs?.attachments ?? [], voiceTranscript: entry.inputs?.voiceTranscript ?? '' }; }
function dateParts(value: string) { const date = new Date(`${value}T12:00:00`); return { short: `${value.slice(5, 7)}.${value.slice(8, 10)}`, weekday: ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][date.getDay()], full: date.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' }) }; }
function beijingDate() { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()); }
export function diaryDayLabel(weather: WeatherData | null | undefined, mood: string, input = '') {
  const emotionalLabel = (text: string) => {
    if (/难过|伤心|低落|累|疲惫|孤独|失落|焦虑|压力|不开心/.test(text)) return 'Be Gentle';
    if (/怀念|想念|回忆|思念/.test(text)) return 'Dear Memory';
    if (/开心|快乐|庆祝|幸福|兴奋|惊喜/.test(text)) return 'Happy Day';
    if (/睡眠|睡觉|入睡|晚安/.test(text)) return 'Sweet Dreams';
    if (/专注|平静|放松/.test(text)) return 'Slow Moments';
    return '';
  };
  // Explicit memories take precedence over listening-derived mood.
  const feeling = emotionalLabel(input) || emotionalLabel(mood);
  if (feeling) return feeling;
  if (weather && ([95, 96, 99].includes(weather.code) || weather.severe)) return 'Stay Cozy';
  if (weather && [51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82].includes(weather.code)) return 'Rainy Melody';
  if (weather && [71, 73, 75, 77, 85, 86].includes(weather.code)) return 'Snowy Day';
  if (weather && [3, 45, 48].includes(weather.code)) return 'Soft Day';
  return weather && [0, 1, 2].includes(weather.code) ? 'Sunny Day' : 'Good Day';
}
async function responseData(response: Response) { let data; try { data = await response.json(); } catch { throw new Error('暂时连接不上日记服务，请稍后重试。'); } return data; }
function PaperDate({ entry, note }: { entry: DiaryEntry; note: string }) { const date = dateParts(entry.date); return <div className="diary-paper-heading"><div className="diary-date-block"><strong className="diary-day">{date.short}</strong><span>{date.weekday}</span>{entry.weather && <><span>{entry.weather.condition.replace(/天$/, '')}</span><span className="diary-weather-icon"><WeatherIcon code={entry.weather.code} size={25} /></span></>}</div><span className="diary-day-label">{diaryDayLabel(entry.weather, entry.mood, note)}</span></div>; }

export default function Diary({ onBack, onPlay }: Props) {
  const [entries, setEntries] = useState<DiaryEntry[]>([]), [index, setIndex] = useState(0), [loading, setLoading] = useState(true), [error, setError] = useState(''), [retry, setRetry] = useState(0);
  const [drafts, setDrafts] = useState<Record<string, DiaryInputs>>({}), [saving, setSaving] = useState(false), [uploading, setUploading] = useState(false), [inputError, setInputError] = useState(''), [status, setStatus] = useState('');
  const [turn, setTurn] = useState<{ entry: DiaryEntry; note: string; direction: 'older' | 'newer' } | null>(null), [calendarOpen, setCalendarOpen] = useState(false), [inputMode, setInputMode] = useState<InputMode | null>(null);
  const [reading, setReading] = useState(false), [speechAvailable, setSpeechAvailable] = useState(false), [recording, setRecording] = useState(false), [locating, setLocating] = useState(false), [songs, setSongs] = useState<Song[]>([]), [songsLoading, setSongsLoading] = useState(false);
  const calendarRef = useRef<HTMLDialogElement>(null), inputRef = useRef<HTMLDialogElement>(null), photoRef = useRef<HTMLInputElement>(null), cameraRef = useRef<HTMLInputElement>(null);
  const recorder = useRef<MediaRecorder | null>(null), stream = useRef<MediaStream | null>(null), recognition = useRef<Recognition | null>(null), mounted = useRef(true), recordingBusy = useRef(false);
  const turnTimer = useRef<ReturnType<typeof setTimeout> | null>(null), pointer = useRef<{ id: number; x: number; y: number; moved: boolean } | null>(null), suppressClick = useRef(false);
  const entry = entries[index], draft = entry ? drafts[entry.date] ?? inputsOf(entry) : { note: '', attachments: [], voiceTranscript: '' };
  const canEdit = Boolean(entry && (entry.canEdit ?? entry.date === beijingDate()) && !entry.isLocked);
  const dirty = Boolean(entry && JSON.stringify(draft) !== JSON.stringify(inputsOf(entry)));
  const busy = saving || uploading || recording || locating;
  const currentSong = draft.song ?? entry?.topSong;
  const feelings = [draft.note, draft.voiceTranscript, ...draft.attachments.map(item => item.caption || '')].join('。');
  const storyText = entry?.story?.text || (entry?.isLocked ? entry.body : '');
  const updateDraft = (update: Partial<DiaryInputs>) => { if (!entry) return; setDrafts(current => ({ ...current, [entry.date]: { ...(current[entry.date] ?? inputsOf(entry)), ...update } })); setStatus(''); };

  useEffect(() => { const controller = new AbortController(); setLoading(true); setError(''); roomFetch('/api/diary', { signal: controller.signal }).then(async response => { const data = await responseData(response); if (!response.ok) throw new Error(data.error || '日记暂时没有打开，请重试。'); return data; }).then(data => { setEntries([...data.entries].sort((a: DiaryEntry, b: DiaryEntry) => b.date.localeCompare(a.date))); setIndex(0); }).catch(cause => { if (!controller.signal.aborted) setError(cause.message); }).finally(() => { if (!controller.signal.aborted) setLoading(false); }); return () => controller.abort(); }, [retry]);
  useEffect(() => { mounted.current = true; setSpeechAvailable('speechSynthesis' in window && 'SpeechSynthesisUtterance' in window); return () => { mounted.current = false; if ('speechSynthesis' in window) speechSynthesis.cancel(); if (turnTimer.current) clearTimeout(turnTimer.current); recognition.current?.stop(); if (recorder.current?.state === 'recording') recorder.current.stop(); stream.current?.getTracks().forEach(track => track.stop()); }; }, []);
  useEffect(() => { if (calendarOpen) calendarRef.current?.showModal(); else calendarRef.current?.close(); }, [calendarOpen]);
  useEffect(() => { if (inputMode) inputRef.current?.showModal(); else inputRef.current?.close(); }, [inputMode]);
  useEffect(() => { if (inputMode !== 'song' || songs.length) return; const controller = new AbortController(); setSongsLoading(true); roomFetch('/api/bootstrap', { signal: controller.signal }).then(async response => { const data = await responseData(response); if (!response.ok) throw new Error(data.error || '歌曲暂时无法加载'); setSongs(data.songs || []); }).catch(cause => { if (!controller.signal.aborted) setInputError(cause.message); }).finally(() => { if (!controller.signal.aborted) setSongsLoading(false); }); return () => controller.abort(); }, [inputMode, songs.length]);

  function stopReading() { if ('speechSynthesis' in window) speechSynthesis.cancel(); setReading(false); }
  function goTo(nextIndex: number) {
    if (!entry || turn || busy || nextIndex === index) return;
    if (nextIndex < 0 || nextIndex >= entries.length) { setStatus(nextIndex < 0 ? '已经是最新一篇了。' : '已经翻到最早一篇了。'); return; }
    stopReading(); setStatus('');
    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) { setTurn({ entry, note: feelings, direction: nextIndex > index ? 'older' : 'newer' }); turnTimer.current = setTimeout(() => setTurn(null), 700); }
    setIndex(nextIndex);
  }
  function openInput(mode: InputMode) { if (!canEdit || busy) return; setInputError(''); setInputMode(mode); if (mode === 'photo') photoRef.current?.click(); if (mode === 'camera') cameraRef.current?.click(); }
  function closeInput() { if (saving || uploading) return; if (recorder.current?.state === 'recording') recorder.current.stop(); recognition.current?.stop(); setInputMode(null); }
  async function upload(file: File, kind: Attachment['kind']) {
    if (!entry || !canEdit) return;
    const day = entry.date;
    setUploading(true); setInputError('');
    try { const form = new FormData(); form.append('file', file); form.append('kind', kind); const response = await roomFetch(`/api/diary/${encodeURIComponent(day)}/attachments`, { method: 'POST', body: form }); const data = await responseData(response); if (!response.ok) throw new Error(data.error || '素材没有保存成功，请再试一次。'); if (!mounted.current) return; setDrafts(current => { const previous = current[day] ?? inputsOf(entry); return { ...current, [day]: { ...previous, attachments: [...previous.attachments, data.attachment] } }; }); } catch (cause) { if (mounted.current) setInputError(cause instanceof Error ? cause.message : '上传失败，请重试。'); } finally { if (mounted.current) setUploading(false); }
  }
  async function saveInputs() {
    if (!entry || !canEdit || busy) return;
    if (draft.attachments.some(item => item.kind !== 'voice' && !item.caption?.trim())) { setInputError('请为照片写一句说明，让小伴知道这张照片的故事。'); return; }
    if (draft.attachments.some(item => item.kind === 'voice') && !draft.voiceTranscript.trim()) { setInputError('请补充这段语音的文字，小伴会据此写下日记。'); return; }
    if (!draft.note.trim() && !draft.location?.text.trim() && !draft.songId && !draft.attachments.length && !draft.voiceTranscript.trim()) { setInputError('先留下一点今天的故事吧。'); return; }
    const day = entry.date; setSaving(true); setInputError(''); setStatus('');
    try { const response = await roomFetch(`/api/diary/${encodeURIComponent(day)}/inputs`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...draft, attachments: draft.attachments.map(({ id, caption }) => ({ id, caption: caption || '' })) }) }); const data = await responseData(response); if (data.entry) { setEntries(current => current.map(item => item.date === day ? data.entry : item)); setDrafts(current => { const next = { ...current }; delete next[day]; return next; }); } if (!response.ok) throw new Error(data.error || '素材已收好，日记暂时未生成，请重试。'); setStatus('今天的故事已经收好了。'); setInputMode(null); } catch (cause) { const text = cause instanceof Error ? cause.message : '日记暂时没有写好，请稍后重试。'; setInputError(text); setStatus(text); } finally { setSaving(false); }
  }
  function readDiary() { if (!entry || !speechAvailable) return; if (reading) { stopReading(); return; } stopReading(); const text = storyText || draft.note; if (!text) { setStatus('先留下一点故事，小伴就能读给你听。'); return; } const speech = new SpeechSynthesisUtterance(`${dateParts(entry.date).full}。${text}`); speech.lang = 'zh-CN'; speech.rate = .9; const voice = speechSynthesis.getVoices().find(item => item.lang.toLowerCase().startsWith('zh')); if (voice) speech.voice = voice; speech.onend = () => setReading(false); speech.onerror = event => { setReading(false); if (!['canceled', 'interrupted'].includes(event.error)) setStatus('当前设备暂时无法朗读，可以继续阅读日记。'); }; setReading(true); speechSynthesis.speak(speech); }
  async function startRecording() {
    if (recordingBusy.current) return;
    if (recording) { recognition.current?.stop(); recorder.current?.stop(); return; }
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) { setInputError('当前浏览器无法录音，可以在下面输入想说的话。'); return; }
    recordingBusy.current = true; setInputError('');
    try {
      const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!mounted.current) { audioStream.getTracks().forEach(track => track.stop()); return; }
      stream.current = audioStream; const media = new MediaRecorder(audioStream); recorder.current = media; const chunks: BlobPart[] = [];
      media.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
      media.onstop = () => { audioStream.getTracks().forEach(track => track.stop()); recognition.current?.stop(); if (!mounted.current) return; setRecording(false); if (chunks.length) void upload(new File(chunks, `diary-voice.${media.mimeType.includes('mp4') ? 'm4a' : 'webm'}`, { type: media.mimeType || 'audio/webm' }), 'voice'); };
      const SpeechRecognition = (window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition }).SpeechRecognition ?? (window as unknown as { webkitSpeechRecognition?: new () => Recognition }).webkitSpeechRecognition;
      if (SpeechRecognition) { const speech = new SpeechRecognition(); recognition.current = speech; speech.lang = 'zh-CN'; speech.continuous = true; speech.interimResults = false; const day = entry!.date; speech.onresult = event => { let words = ''; for (let i = event.resultIndex; i < event.results.length; i++) words += event.results[i][0].transcript; setDrafts(current => { const previous = current[day] ?? inputsOf(entry!); return { ...current, [day]: { ...previous, voiceTranscript: `${previous.voiceTranscript}${words}`.slice(0, 2000) } }; }); }; speech.onerror = () => setInputError('语音转文字暂不可用，录音结束后可以手动补充文字。'); try { speech.start(); } catch { setInputError('语音转文字暂不可用，录音结束后可以手动补充文字。'); } }
      else setInputError('当前浏览器不支持语音转文字，录音后请在下面补充文字。');
      media.start(); setRecording(true);
    } catch { setInputError('无法使用麦克风，请检查授权，或在下面输入想说的话。'); stream.current?.getTracks().forEach(track => track.stop()); } finally { recordingBusy.current = false; }
  }
  function locate() { if (!navigator.geolocation || !window.isSecureContext) { setInputError('当前地址无法使用设备定位，请在下面填写城市或地点。'); return; } setLocating(true); setInputError(''); navigator.geolocation.getCurrentPosition(position => { updateDraft({ location: { text: draft.location?.text || entry?.weather?.city || '此刻所在的位置', latitude: position.coords.latitude, longitude: position.coords.longitude } }); setLocating(false); }, () => { setInputError('暂时没有获取到位置，可以直接填写城市或地点。'); setLocating(false); }, { timeout: 10000, maximumAge: 300000 }); }

  return <main className="diary-screen">
    <header className="diary-topbar"><button type="button" className="diary-icon-button" onClick={onBack} aria-label="返回首页"><ChevronLeft size={25} /></button><h1>我的音乐日记</h1><button type="button" className="diary-icon-button" onClick={() => setCalendarOpen(true)} disabled={!entries.length || busy} aria-label="选择日记日期"><CalendarDays size={23} /></button></header>
    {loading ? <div className="diary-state" role="status"><LoaderCircle className="diary-spinner" /><p>正在翻开你的音乐日记…</p></div> : error ? <div className="diary-state" role="alert"><BookOpen /><p>{error}</p><button className="diary-retry" onClick={() => setRetry(value => value + 1)}>再打开一次</button></div> : !entry ? <div className="diary-state"><BookOpen /><p>去听一首歌，让今天有一点旋律。</p></div> : <>
      <div className="diary-book-toolbar"><span><BookOpen size={17} />第 {entries.length - index} 篇 / 共 {entries.length} 篇</span><button type="button" onClick={readDiary} disabled={!speechAvailable} className={reading ? 'is-reading' : ''}>{reading ? <VolumeX size={17} /> : <Volume2 size={17} />}{reading ? '停止播报' : '听小伴读日记'}</button></div>
      <div className={`diary-book${turn ? ' diary-is-turning' : ''}`} role="region" aria-label="音乐日记本" aria-describedby="diary-turn-hint" aria-keyshortcuts="ArrowUp ArrowDown" aria-busy={Boolean(turn)} tabIndex={0}
        onKeyDown={event => { if ((event.target as Element).closest(interactive)) return; if (['ArrowUp', 'ArrowRight'].includes(event.key)) { event.preventDefault(); goTo(index + 1); } if (['ArrowDown', 'ArrowLeft'].includes(event.key)) { event.preventDefault(); goTo(index - 1); } }}
        onPointerDown={event => { pointer.current = null; suppressClick.current = false; if (!event.isPrimary || event.button !== 0 || (event.target as Element).closest('button, input, a, select, label') || ((event.target as Element).tagName !== 'TEXTAREA' && window.getSelection()?.isCollapsed === false)) return; pointer.current = { id: event.pointerId, x: event.clientX, y: event.clientY, moved: false }; event.currentTarget.setPointerCapture(event.pointerId); }}
        onPointerMove={event => { const start = pointer.current; if (start && start.id === event.pointerId && Math.hypot(event.clientX - start.x, event.clientY - start.y) > 8) start.moved = true; }}
        onPointerUp={event => { const start = pointer.current; pointer.current = null; if (!start || start.id !== event.pointerId) return; suppressClick.current = start.moved; const dx = event.clientX - start.x, dy = event.clientY - start.y; if (Math.abs(dy) > 42 && Math.abs(dy) > Math.abs(dx) * 1.2) { if (document.activeElement instanceof HTMLTextAreaElement) document.activeElement.blur(); goTo(index + (dy < 0 ? 1 : -1)); } }}
        onPointerCancel={() => { pointer.current = null; suppressClick.current = true; }}
        onClick={event => { if ((event.target as Element).closest(interactive)) return; if (suppressClick.current) { suppressClick.current = false; return; } if (window.getSelection()?.isCollapsed === false) return; const bounds = event.currentTarget.getBoundingClientRect(); if (event.clientX < bounds.left + 30) goTo(index - 1); else if (event.clientX > bounds.right - 30) goTo(index + 1); }}>
        <div className="diary-book-cover" aria-hidden="true" /><div className="diary-page-edges" aria-hidden="true" />
        <article className="diary-paper" aria-label={dateParts(entry.date).full}>
          <PaperDate entry={entry} note={feelings} />
          <div className="diary-writing-area">{storyText && <div className="diary-body">{storyText.split(/\n+/).filter(Boolean).map((paragraph, i) => <p key={i}>{paragraph}</p>)}</div>}{canEdit && (!storyText || dirty && draft.note !== (entry.inputs?.note ?? entry.note)) && <textarea id="diary-note" aria-label="写下今天的故事" value={draft.note} maxLength={300} placeholder="在这里，写下今天的故事..." onChange={event => updateDraft({ note: event.target.value })} />}{!canEdit && !storyText && <p className="diary-quiet-page">这一天的旋律，轻轻留在这里。</p>}{draft.attachments.length > 0 && <div className="diary-attachment-thumbnails">{draft.attachments.filter(item => item.kind !== 'voice').map(item => <img key={item.id} src={item.url} alt={item.caption || '今天的照片'} />)}</div>}</div>
          <div className="diary-paper-bottom"><span className="diary-note-count">{draft.note.length}/300</span><div className="diary-song-decoration" aria-hidden="true"><span>⌁</span><Music2 size={22} /></div><button type="button" className="diary-song-card" onClick={() => canEdit ? openInput('song') : currentSong && onPlay(currentSong)} disabled={!canEdit && !currentSong}><span className="diary-song-cover"><Music2 size={26} fill="currentColor" /></span><span className="diary-song-text"><strong>{currentSong?.title || '选择一首歌'}</strong><span>{currentSong?.artist || '让此刻更特别'}</span></span>{!canEdit && currentSong ? <Play size={16} /> : <ChevronRight size={19} />}</button></div>
          <span className="diary-page-corner" aria-hidden="true" />
        </article>
        {turn && <div className={`diary-turning-page diary-turn-${turn.direction}`} aria-hidden="true"><div className="diary-turn-front"><PaperDate entry={turn.entry} note={turn.note} /><div className="diary-body">{turn.entry.story?.text || turn.note}</div><span className="diary-page-corner" /></div><div className="diary-turn-back" /></div>}
      </div>
      <div className="diary-input-actions">{([{ mode: 'photo', label: '照片', Icon: Image }, { mode: 'camera', label: '拍照', Icon: Camera }, { mode: 'voice', label: '语音', Icon: Mic }, { mode: 'location', label: '位置', Icon: MapPin }] as const).map(({ mode, label, Icon }) => <button key={mode} type="button" onClick={() => openInput(mode)} disabled={!canEdit || busy} aria-label={label}><span><Icon size={27} strokeWidth={1.8} /></span>{label}</button>)}</div>
      {canEdit && dirty && !inputMode && <button type="button" className="diary-generate-button" disabled={busy} onClick={() => { setInputMode('note'); setInputError(''); }}>{saving ? '正在写进日记…' : '把今天写进日记'}</button>}
      <p className={`diary-feedback${status ? '' : ' diary-sr-only'}`} role="status">{status || (entry.isLocked ? '这篇日记已珍藏，不再改写。' : '没有输入时，小伴会在北京时间 22:00 为你记录今天。')}</p>
      <span id="diary-turn-hint" className="diary-sr-only">向上滑动翻看更早的日记，向下滑动返回较新的日记。也可以使用上下方向键或点击纸张左右边缘。</span>
    </>}
    <input ref={photoRef} className="diary-sr-only" type="file" accept="image/jpeg,image/png,image/webp" aria-label="上传日记照片" onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void upload(file, 'photo'); }} />
    <input ref={cameraRef} className="diary-sr-only" type="file" accept="image/*" capture="environment" aria-label="拍摄日记照片" onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void upload(file, 'camera'); }} />
    <dialog ref={calendarRef} className="diary-date-dialog" onCancel={() => setCalendarOpen(false)} onClick={event => { if (event.target === event.currentTarget) setCalendarOpen(false); }} aria-labelledby="diary-calendar-title"><div className="diary-dialog-heading"><h2 id="diary-calendar-title">想翻开哪一天？</h2><button className="diary-icon-button" onClick={() => setCalendarOpen(false)} aria-label="关闭日期选择"><X size={21} /></button></div><div className="diary-calendar-list">{entries.map((item, i) => <button key={item.date} type="button" className={index === i ? 'is-selected' : ''} onClick={() => { goTo(i); setCalendarOpen(false); }}><span><strong>{dateParts(item.date).full}</strong><span>{item.title}</span></span>{index === i ? <Check size={18} /> : <ChevronRight size={18} />}</button>)}</div></dialog>
    <dialog ref={inputRef} className="diary-input-dialog" onCancel={event => { event.preventDefault(); closeInput(); }} aria-labelledby="diary-input-title"><div className="diary-dialog-heading"><h2 id="diary-input-title">{inputMode ? inputTitles[inputMode] : '今天的故事'}</h2><button type="button" className="diary-icon-button" disabled={saving || uploading} onClick={closeInput} aria-label="关闭日记输入"><X size={21} /></button></div>
      <div className="diary-input-dialog-body">
        {(inputMode === 'photo' || inputMode === 'camera') && <><button type="button" className="diary-input-option" disabled={busy} onClick={() => inputMode === 'photo' ? photoRef.current?.click() : cameraRef.current?.click()}>{inputMode === 'photo' ? <ImagePlus size={22} /> : <Camera size={22} />}{inputMode === 'photo' ? '选择照片' : '打开相机'}</button><p className="diary-input-help">给照片写一句说明，小伴会把照片里的故事写进日记。</p></>}
        {draft.attachments.filter(item => inputMode === 'voice' ? item.kind === 'voice' : item.kind !== 'voice').map(item => <div className="diary-input-attachment" key={item.id}>{item.kind === 'voice' ? <audio controls src={item.url} /> : <><img src={item.url} alt={item.caption || '待记录的照片'} /><label>照片里的故事<textarea maxLength={300} value={item.caption || ''} placeholder="例如：今天和朋友看了落日，心里很温暖。" onChange={event => updateDraft({ attachments: draft.attachments.map(attachment => attachment.id === item.id ? { ...attachment, caption: event.target.value } : attachment) })} /></label></>}<button type="button" disabled={busy} onClick={() => updateDraft({ attachments: draft.attachments.filter(attachment => attachment.id !== item.id) })}>移除这份素材</button></div>)}
        {inputMode === 'voice' && <><button type="button" className={`diary-record-button${recording ? ' is-recording' : ''}`} disabled={saving || uploading} onClick={() => void startRecording()}>{recording ? <Square size={21} fill="currentColor" /> : <Mic size={24} />}{recording ? '结束录音' : '开始录音'}</button><label className="diary-input-label">语音文字<textarea aria-label="语音文字" maxLength={2000} value={draft.voiceTranscript} onChange={event => updateDraft({ voiceTranscript: event.target.value })} placeholder="录音后检查文字，也可以直接输入想对小伴说的话。" /></label></>}
        {inputMode === 'location' && <><button type="button" className="diary-input-option" onClick={locate} disabled={busy}>{locating ? <LoaderCircle className="diary-spinner" size={20} /> : <LocateFixed size={21} />}使用当前位置</button><label className="diary-input-label">城市或地点<input aria-label="日记位置" maxLength={120} value={draft.location?.text || ''} onChange={event => updateDraft({ location: { ...draft.location, text: event.target.value } })} placeholder="例如：广州 · 珠江边" /></label>{draft.location?.latitude !== undefined && <p className="diary-input-help">已获取当前位置，可以补充更具体的地点。</p>}</>}
        {inputMode === 'song' && <div className="diary-song-picker">{songsLoading ? <p role="status">正在打开歌单…</p> : songs.map(song => <button key={song.id} type="button" className={draft.songId === song.id ? 'is-selected' : ''} onClick={() => updateDraft({ songId: song.id, song })}><Music2 size={20} /><span><strong>{song.title}</strong><small>{song.artist}</small></span>{draft.songId === song.id && <Check size={17} />}</button>)}</div>}
        <label className="diary-input-label">今天想记住的事<textarea aria-label="今天想记住的事" maxLength={300} value={draft.note} onChange={event => updateDraft({ note: event.target.value })} placeholder="告诉小伴今天的故事和心情…" /></label><span className="diary-input-count">{draft.note.length}/300</span>
        {inputError && <p className="diary-input-error" role="alert">{inputError}</p>}{uploading && <p role="status" className="diary-input-help">正在收好素材…</p>}
      </div><button type="button" className="diary-generate-button" disabled={busy} onClick={() => void saveInputs()}>{saving ? <><LoaderCircle className="diary-spinner" size={17} />正在写进日记…</> : '写进今天的日记'}</button>
    </dialog>
  </main>;
}
