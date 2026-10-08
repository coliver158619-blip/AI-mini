import { useEffect, useId, useRef, useState } from 'react';
import { ArrowLeft, ArrowUpRight, Check, ChevronLeft, ChevronRight, Clock3, Disc3, Heart, Info, Music2, Play, RefreshCw, Share2, Sparkles, Star, X } from 'lucide-react';
import type { Song } from './types';
import './reports.css';

type Period = 'week' | 'month' | 'year';
type RankedSong = Song & { plays: number; minutes: number };
type Report = {
  period: Period;
  offset: number;
  label: string;
  startDate: string;
  endDate: string;
  isDemo: boolean;
  summary: { minutes: number; songCount: number; playCount: number; activeDays: number; favoriteCount: number; topMood: string; companionDays: number };
  comparison: { minutesPercent: number | null };
  daily: { date: string; label: string; minutes: number }[];
  topSongs: RankedSong[];
  topArtists: { name: string; plays: number; minutes: number }[];
  moods: { name: string; percent: number; minutes: number; color: string }[];
  tags: string[];
  insight: { title: string; body: string };
  highlights: { title: string; value: string | number; description: string }[];
  letter: string;
  trend?: { label: string; minutes: number; songCount: number }[];
  monthlyFavorites?: { month: number; label: string; song: Song; plays: number }[];
  listeningIndex?: number;
  listeningIndexLabel?: string;
};

const periodNames: Record<Period, string> = { week: '周', month: '月', year: '年' };
const format = (value: number) => Math.round(value).toLocaleString('zh-CN');

function Trend({ values, kind }: { values: NonNullable<Report['trend']>; kind: Period }) {
  const gradientId = useId().replace(/:/g, '');
  const [selected, setSelected] = useState<number | null>(null);
  if (!values.length) return null;
  const max = Math.max(...values.map(item => item.minutes), 1);
  const coords = values.map((item, i) => ({
    x: values.length === 1 ? 160 : 22 + i * (276 / (values.length - 1)),
    y: 100 - item.minutes / max * 72,
    level: Math.max(0, Math.min(1, item.minutes / max)),
  }));
  const points = coords.map(p => `${p.x},${p.y}`).join(' ');
  const labels = ['平静', '浅浅微笑', '开心', '笑眼弯弯', '开怀大笑'];
  const selectedValue = selected === null ? null : values[selected];
  return <div className="report-trend">
    <div className="report-chart-heading"><span>{kind === 'year' ? '近 5 年的音乐足迹' : '近 6 个月的陪伴'}</span><small>听歌时长 / 分钟</small></div>
    <svg viewBox="0 0 320 140" role="group" aria-label="听歌时长趋势，点击表情查看数值">
      <defs><linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#f3b84e" stopOpacity=".25"/><stop offset="100%" stopColor="#f3b84e" stopOpacity="0"/></linearGradient></defs>
      {[28, 64, 100].map(y => <line key={y} x1="22" y1={y} x2="298" y2={y} stroke="#eee5d9" strokeDasharray="3 5"/>)}
      <polygon points={`${coords[0].x},108 ${points} ${coords[coords.length - 1].x},108`} fill={`url(#${gradientId})`}/>
      <polyline points={points} stroke="#d89a2f" fill="none" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round"/>
      {coords.map((point, i) => {
        const mood = Math.min(4, Math.floor(point.level * 5));
        const saturation = Math.round(14 + point.level * 84);
        const faceColor = `hsl(${44 - point.level * 7} ${saturation}% ${84 - point.level * 27}%)`;
        const outlineColor = `hsl(${38 - point.level * 10} ${20 + point.level * 68}% ${62 - point.level * 14}%)`;
        const title = `${values[i].label} · ${format(values[i].minutes)} 分钟 · ${labels[mood]}`;
        return <g key={`${values[i].label}-${i}`}>
          <g className="report-trend-point" transform={`translate(${point.x} ${point.y})`} role="button" tabIndex={0} aria-label={title} aria-pressed={selected === i}
            onClick={() => setSelected(i)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelected(i); } }}>
            <title>{title}</title>
            <circle r="22" fill="transparent"/>
            <circle className="report-face-ring" r="16" fill="none" stroke={outlineColor} strokeWidth="1.4"/>
            <g className="report-face-art" aria-hidden="true">
              <circle className="report-face" r="12.5" fill={faceColor} stroke={outlineColor} strokeWidth="1.15"/>
              <path d="M -8 -5 Q -6 -10 0 -10" fill="none" stroke="#fff" strokeOpacity=".6" strokeWidth="1.4" strokeLinecap="round"/>
              {mood >= 3 ? <path d="M -7 -2 Q -4.5 -5.5 -2 -2 M 2 -2 Q 4.5 -5.5 7 -2" fill="none" stroke="#664222" strokeWidth="1.6" strokeLinecap="round"/>
                : <><circle cx="-4.3" cy="-2.5" r="1.2" fill="#6a5640"/><circle cx="4.3" cy="-2.5" r="1.2" fill="#6a5640"/></>}
              {mood >= 4 ? <><path d="M -5.5 2.3 Q 0 4 5.5 2.3 Q 4.5 8.7 0 8.7 Q -4.5 8.7 -5.5 2.3 Z" fill="#78441e"/><path d="M -3 7 Q 0 4.8 3 7 Q 0 9 -3 7" fill="#f17b5f"/></>
                : <path d={`M -4.5 3.5 Q 0 ${3.5 + point.level * 10} 4.5 3.5`} fill="none" stroke="#765132" strokeWidth="1.6" strokeLinecap="round"/>}
              {mood >= 2 && <><ellipse cx="-8" cy="2.5" rx="2.1" ry="1.25" fill="#ed8061" opacity={.3 + point.level * .35}/><ellipse cx="8" cy="2.5" rx="2.1" ry="1.25" fill="#ed8061" opacity={.3 + point.level * .35}/></>}
            </g>
          </g>
          <text x={point.x} y="133" textAnchor="middle" fill="#988875" fontSize="10">{values[i].label}</text>
        </g>;
      })}
    </svg>
    <div className="report-trend-caption"><span><i aria-hidden="true"/>时长越高，笑容越灿烂</span><span role="status">{selectedValue ? `${selectedValue.label} · ${format(selectedValue.minutes)} 分钟` : '点表情看时长'}</span></div>
  </div>;
}

function SongCover({ song, large = false }: { song: Song; large?: boolean }) {
  return <span className={`report-cover ${large ? 'report-cover-large' : ''}`} style={{ backgroundColor: song.color || '#b8c4a9' }} aria-hidden="true"><span className="report-cover-sun"/><Music2 size={large ? 29 : 19}/></span>;
}

export default function Reports({ onBack, onPlay }: { onBack: () => void; onPlay: (song: Song) => void }) {
  const [period, setPeriod] = useState<Period>('week');
  const [offset, setOffset] = useState(0);
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [toast, setToast] = useState('');
  const [showInfo, setShowInfo] = useState(false);
  const [showLetter, setShowLetter] = useState(false);
  const [shareText, setShareText] = useState('');
  const shareRef = useRef<HTMLTextAreaElement>(null);
  const modalRef = useRef<HTMLDialogElement>(null);
  const [selectedDay, setSelectedDay] = useState<number | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError(''); setReport(null); setSelectedDay(null); setShowLetter(false);
    fetch(`/api/reports?period=${period}&offset=${offset}`, { signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw new Error('音乐报告暂时没有送达');
        return response.json() as Promise<Report>;
      })
      .then(data => { setReport(data); setLoading(false); })
      .catch(err => { if (err.name !== 'AbortError') { setError('音乐报告暂时没有送达，请检查网络后重试。'); setLoading(false); } });
    return () => controller.abort();
  }, [period, offset, refresh]);

  useEffect(() => { if (!toast) return; const timer = window.setTimeout(() => setToast(''), 2800); return () => window.clearTimeout(timer); }, [toast]);

  async function shareReport() {
    if (!report) return;
    const text = `我的音乐${periodNames[period]}报 · ${report.label}\n和音乐相伴 ${format(report.summary.minutes)} 分钟，听过 ${report.summary.songCount} 首歌。\n${report.insight.body}${report.isDemo ? '\n（包含演示听歌记录）' : ''}\n来自酷狗 AI 陪伴`;
    try {
      if (navigator.share) { await navigator.share({ title: `我的音乐${periodNames[period]}报`, text }); setToast('已完成分享'); }
      else if (navigator.clipboard && window.isSecureContext) { await navigator.clipboard.writeText(text); setToast('报告文案已复制，可以分享给朋友了'); }
      else setShareText(text);
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return;
      setShareText(text);
    }
  }

  const maxDay = report ? Math.max(...report.daily.map(day => day.minutes), 1) : 1;
  const maxArtist = report ? Math.max(...report.topArtists.map(artist => artist.minutes), 1) : 1;
  const currentLabel = `${offset === 0 ? '本' : ''}${periodNames[period]}`;
  const shownSongs = report?.topSongs.slice(0, period === 'week' ? 3 : 10) || [];
  const maxPlays = Math.max(...shownSongs.map(song => song.plays), 1);
  const index = Math.max(0, Math.min(100, report?.listeningIndex || 0));
  const modalOpen = showInfo || showLetter || !!shareText;

  useEffect(() => {
    const dialog = modalRef.current;
    if (!modalOpen || !dialog) return;
    const previousFocus = document.activeElement;
    if (!dialog.open) dialog.showModal();
    if (shareText) { shareRef.current?.focus(); shareRef.current?.select(); }
    return () => {
      dialog.close();
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
    };
  }, [modalOpen, shareText]);

  function switchTab(value: Period) {
    setPeriod(value);
    setOffset(0);
  }

  return <section className="report-page" aria-busy={loading}>
    <header className="report-nav">
      <button className="report-icon-button" onClick={onBack} aria-label="返回更多玩法"><ArrowLeft size={21}/></button>
      <h1>音乐报告</h1>
      <button className="report-icon-button" onClick={() => setShowInfo(true)} aria-label="报告说明"><Info size={19}/></button>
    </header>
    <div className="report-tabs" role="tablist" aria-label="音乐报告周期">
      {(['week', 'month', 'year'] as Period[]).map(value => <button key={value} id={`report-tab-${value}`} role="tab" aria-controls="report-panel" aria-selected={period === value} tabIndex={period === value ? 0 : -1} className={period === value ? 'report-tab-active' : ''} onClick={() => switchTab(value)} onKeyDown={event => {
        const periods: Period[] = ['week', 'month', 'year'];
        if (!['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? 2 : (periods.indexOf(value) + (event.key === 'ArrowRight' ? 1 : 2)) % 3;
        switchTab(periods[next]);
        document.getElementById(`report-tab-${periods[next]}`)?.focus();
      }}>{periodNames[value]}报</button>)}
    </div>
    <div className="report-date-nav">
      <button onClick={() => setOffset(value => Math.max(-60, value - 1))} disabled={offset <= -60} className="report-icon-button" aria-label={`上一${periodNames[period]}`}><ChevronLeft size={17}/></button>
      <span>{loading ? '正在翻阅音乐足迹…' : report?.label || '音乐报告'}</span>
      <button onClick={() => setOffset(value => Math.min(0, value + 1))} disabled={offset >= 0} className="report-icon-button" aria-label={`下一${periodNames[period]}`}><ChevronRight size={17}/></button>
    </div>

    {loading && <div className="report-loading" role="status"><Disc3 size={44}/><p>把你的音乐时光，慢慢收集起来</p><span>正在生成音乐{periodNames[period]}报</span></div>}
    {error && <div className="report-state" role="alert"><Music2 size={38}/><h2>稍等一下，音乐还在路上</h2><p>{error}</p><button className="report-primary" onClick={() => setRefresh(value => value + 1)}><RefreshCw size={16}/>重新加载</button></div>}
    {!loading && report && <div className="report-content" id="report-panel" role="tabpanel" aria-labelledby={`report-tab-${period}`} key={`${period}-${offset}`}>
      <div className="report-intro">
        <div><span className="report-eyebrow">MY MUSIC, MY MOMENTS</span><h2>{period === 'week' ? <>这一周，<br/>音乐一直在身边。</> : period === 'month' ? <>把平凡的日子，<br/>听成喜欢的样子。</> : <>每一次心动，<br/>都被音乐记得。</>}</h2></div>
        <span className="report-intro-art" aria-hidden="true"><Disc3 size={68} strokeWidth={1.15}/><Sparkles size={22}/><Music2 size={18}/></span>
      </div>
      {report.summary.playCount === 0 ? <div className="report-state report-empty"><Music2 size={38}/><h2>这一页，等待你的第一首歌</h2><p>这段时间还没有听歌记录。去更多玩法挑一首喜欢的歌，让音乐留下足迹。</p><button className="report-primary" onClick={onBack}>去听一首歌<ArrowUpRight size={16}/></button></div> : <>
        {period === 'week' && <article className="report-card report-overview">
          <div className="report-card-top"><h3><span className="report-small-icon"><Clock3 size={14}/></span>音乐陪伴了你</h3><span className="report-tiny-label">WEEKLY</span></div>
          <div className="report-main-number">{format(report.summary.minutes)}<span>分钟</span></div>
          <div className="report-stat-line"><span>听过 <b>{report.summary.songCount}</b> 首歌</span><i/>{report.comparison.minutesPercent !== null ? <span>比上周 {report.comparison.minutesPercent >= 0 ? '多' : '少'} <b>{Math.abs(report.comparison.minutesPercent).toFixed(0)}%</b></span> : <span>每一次聆听都值得记录</span>}</div>
          <div className="report-chart-heading"><span>一周的音乐温度</span><small>{selectedDay === null ? '点击查看每日时长' : `${report.daily[selectedDay].date.slice(5).replace('-', '.')} · ${format(report.daily[selectedDay].minutes)} 分钟`}</small></div>
          <div className="report-heat-grid">{report.daily.map((day, i) => <button key={day.date} className={`report-heat-day ${day.minutes === maxDay ? 'report-heat-peak' : ''} ${selectedDay === i ? 'report-heat-selected' : ''}`} onClick={() => setSelectedDay(i)} aria-label={`${day.date}，听歌${format(day.minutes)}分钟`} aria-pressed={selectedDay === i}><span className="report-heat-fill" style={{ height: `${day.minutes ? Math.max(12, day.minutes / maxDay * 100) : 0}%` }}/><span className="report-heat-count">{day.minutes ? format(day.minutes) : '—'}</span><span className="report-heat-label">{day.label}</span></button>)}</div>
        </article>}

        {period === 'month' && <article className="report-card report-month-card">
          <div className="report-card-top"><h3><span className="report-small-icon"><Heart size={14}/></span>你的听歌活跃指数</h3><span className="report-tiny-label">MONTHLY</span></div>
          <div className="report-gauge"><svg viewBox="0 0 240 134" role="img" aria-label={`听歌活跃指数 ${format(index)}`}><path d="M 24 116 A 96 96 0 0 1 216 116" fill="none" stroke="#f0e9dd" strokeWidth="15" strokeLinecap="round"/><path d="M 24 116 A 96 96 0 0 1 216 116" fill="none" stroke="#ecb448" strokeWidth="15" strokeLinecap="round" pathLength="100" strokeDasharray={`${index} 100`}/></svg><div className="report-gauge-value"><strong>{format(index)}</strong><span>音乐，让生活发光</span></div></div>
          <div className="report-month-stats"><div><b>{report.summary.activeDays}<small>天</small></b><span>有音乐的日子</span></div><i/><div><b>{format(report.summary.minutes)}<small>分钟</small></b><span>相伴的好时光</span></div></div>
          {report.trend && <Trend values={report.trend} kind={period}/>}
        </article>}

        {period === 'year' && <article className="report-card report-year-card">
          <div className="report-card-top"><h3><span className="report-small-icon"><Clock3 size={14}/></span>这一年，与音乐相伴</h3><span className="report-tiny-label">YEARLY</span></div>
          <div className="report-main-number">{format(Math.floor(report.summary.minutes / 60))}<span>小时</span><b>{format(report.summary.minutes % 60)}</b><span>分钟</span></div>
          <p className="report-soft-text">{report.summary.activeDays} 天的陪伴 · {report.summary.songCount} 首歌里的心动</p>
          {report.trend && <Trend values={report.trend} kind={period}/>}
        </article>}

        <article className="report-insight">
          <div className="report-insight-icon"><Sparkles size={20}/></div>
          <div><div className="report-insight-heading"><span>音乐搭子想对你说</span><span className="report-ai-label">音乐小结</span></div><h3>{report.insight.title}</h3><p>{report.insight.body}</p>{report.tags.length > 0 && <div className="report-tags">{report.tags.slice(0, 3).map(tag => <span key={tag}>#{tag}</span>)}</div>}</div>
        </article>

        {period === 'week' && report.topArtists.length > 0 && <article className="report-card report-artists"><div className="report-card-top"><h3>反复相遇的声音</h3><span className="report-tiny-label">FAVORITE ARTISTS</span></div>{report.topArtists.slice(0, 3).map((artist, i) => <div className="report-artist" key={artist.name}><span className={`report-artist-avatar report-artist-${i}`}><Music2 size={17}/></span><div className="report-artist-meta"><div><b>{artist.name}</b><span>{format(artist.minutes)} 分钟</span></div><div className="report-artist-track"><i style={{ width: `${Math.max(3, artist.minutes / maxArtist * 100)}%` }}/></div></div></div>)}</article>}

        {period === 'month' && report.highlights.length > 0 && <section className="report-highlights-section"><div className="report-section-heading"><h3>闪闪发光的时刻</h3><Star size={17}/></div><div className="report-highlights">{report.highlights.slice(0, 4).map((highlight, i) => { const Icon = [Heart, Clock3, Music2, Star][i]; return <article key={highlight.title} className={`report-highlight report-highlight-${i}`}><Icon size={21}/><span>{highlight.title}</span><strong>{highlight.value}</strong><small>{highlight.description}</small></article>; })}</div></section>}

        {period === 'year' && <section className="report-year-memories"><div className="report-section-heading"><h3>这一年，值得珍藏</h3><Star size={17}/></div><button className="report-recap" onClick={() => setShowLetter(true)}><span className="report-recap-copy"><small>A LETTER TO YOU</small><strong>写给你的<br/>年度音乐来信</strong><span>把美好的瞬间，再听一遍 <ArrowUpRight size={16}/></span></span><span className="report-recap-art" aria-hidden="true"><span>♪</span><Heart size={22}/><Sparkles size={20}/></span></button>{!!report.monthlyFavorites?.length && <div className="report-card report-monthly-picks"><div className="report-card-top"><h3>每个月，都有一首最爱</h3></div><div className="report-picks-strip">{report.monthlyFavorites.map(pick => <button key={pick.month} onClick={() => onPlay(pick.song)} className="report-month-pick" aria-label={`播放${pick.label}最爱：${pick.song.title}`}><SongCover song={pick.song} large/><span>{pick.label}</span><b>{pick.song.title}</b><small>{pick.plays} 次心动</small></button>)}</div></div>}</section>}

        {shownSongs.length > 0 && <section className="report-ranking"><div className="report-section-heading"><div><h3>听不腻的心头好</h3><p>{currentLabel}听歌排行 · 每一次循环，都是喜欢</p></div><span className="report-ranking-note"><Music2 size={19}/></span></div><div className="report-ranking-list">{shownSongs.map((song, i) => <button key={song.id} className="report-song-row" onClick={() => onPlay(song)} aria-label={`播放${song.title}，${song.artist}`}><span className={`report-rank-number ${i < 3 ? 'report-rank-top' : ''}`}>{String(i + 1).padStart(2, '0')}</span><SongCover song={song}/><span className="report-song-meta"><strong>{song.title}</strong><span>{song.artist}</span><span className="report-song-track"><i style={{ width: `${song.plays / maxPlays * 100}%` }}/></span></span><span className="report-song-plays">{song.plays}<small>次</small></span><span className="report-song-play"><Play size={13} fill="currentColor"/></span></button>)}</div></section>}

        <button className="report-share" onClick={shareReport}><Share2 size={17}/>分享这份音乐心情</button>
      </>}
      <footer className="report-footer"><span>♪</span><p>每一首歌，都藏着生活的小小回响</p><small>{report.isDemo ? '当前报告包含演示听歌记录 · 新的聆听会实时记录' : '来自你的真实听歌记录 · 用音乐记录生活'}</small></footer>
    </div>}

    {toast && <div className="report-toast" role="status"><Check size={16}/>{toast}</div>}
    {modalOpen && <dialog ref={modalRef} className="report-modal-backdrop" aria-labelledby="report-modal-title" onCancel={event => { event.preventDefault(); setShowInfo(false); setShowLetter(false); setShareText('' ); }} onClick={() => { setShowInfo(false); setShowLetter(false); setShareText(''); }}><section className="report-modal" onClick={event => event.stopPropagation()}><button className="report-modal-close report-icon-button" autoFocus onClick={() => { setShowInfo(false); setShowLetter(false); setShareText(''); }} aria-label="关闭"><X size={21}/></button>{showInfo ? <><span className="report-modal-symbol"><Info size={27}/></span><h2 id="report-modal-title">关于这份音乐报告</h2><p>报告根据数据库中记录的聆听时长与歌曲播放次数生成。周报按周一至周日统计，月报与年报按自然月、自然年统计。</p><p>听歌活跃指数 = 周期内有听歌记录的天数 ÷ 周期已过天数 × 100。历史周期按完整天数计算。</p><p>音乐小结依据听歌记录整理。首次使用含演示记录，方便体验完整报告；你的新聆听会持续保存。</p></> : showLetter ? <><span className="report-modal-symbol"><Heart size={27}/></span><span className="report-eyebrow">A LETTER TO YOU</span><h2 id="report-modal-title">写给你的年度音乐来信</h2><div className="report-letter">{report?.letter}</div></> : <><span className="report-modal-symbol"><Share2 size={27}/></span><h2 id="report-modal-title">分享你的音乐心情</h2><p>当前浏览器无法直接分享。长按选中下方文案，即可复制给朋友。</p><textarea ref={shareRef} readOnly value={shareText} aria-label="音乐报告分享文案" onFocus={event => event.target.select()}/></>}</section></dialog>}
  </section>;
}
