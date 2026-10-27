import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { ArrowLeft, ChevronDown, Crown, Zap, Info, LoaderCircle, Search, Sparkles, Trophy, X } from 'lucide-react';
import { api } from './api';
import './rankings.css';

type Star = { id: string; name: string; initials: string; color: string; imageUrl: string | null; imageTransform?: string };
type Fan = { userId: string; name: string; color: string; intimacy: number; rank: number; isMe: boolean };
type Personal = { star: Star; intimacy: number; rank: number; inTop100: boolean };
type Board = { star: Star; entries: Fan[]; total: number; nextOffset: number | null; viewer: Fan & { inTop1000: boolean; gapToEnter: number } };
type Row = { id: string; name: string; color: string; imageUrl?: string | null; imageTransform?: string; intimacy: number; rank: number; isMe?: boolean };
const format = (value: number) => value.toLocaleString('zh-CN');

function Avatar({ name, color, imageUrl, imageTransform }: Pick<Row, 'name' | 'color' | 'imageUrl' | 'imageTransform'>) {
 const [failedUrl, setFailedUrl] = useState<string | null>(null);
 return <span className="ranking-avatar" style={{ '--avatar-color': color } as CSSProperties}>{imageUrl && imageUrl !== failedUrl ? <img src={imageUrl} alt="" draggable={false} style={{ transform: imageTransform }} loading="lazy" decoding="async" onError={() => setFailedUrl(imageUrl)}/> : <span aria-hidden="true">{name.slice(0, 1)}</span>}</span>;
}

export default function Rankings({ onBack }: { onBack: () => void }) {
 const [mode, setMode] = useState<'star' | 'personal'>('star');
 const [starId, setStarId] = useState('lyn');
 const [board, setBoard] = useState<Board | null>(null);
 const [personal, setPersonal] = useState<Personal[]>([]);
 const [loading, setLoading] = useState(true), [error, setError] = useState(''), [attempt, setAttempt] = useState(0);
 const [moreLoading, setMoreLoading] = useState(false), [moreError, setMoreError] = useState('');
 const [query, setQuery] = useState(''), [picker, setPicker] = useState(false);
 const [starMatches, setStarMatches] = useState<Star[]>([]), [personalMatches, setPersonalMatches] = useState<Personal[]>([]);
 const [searching, setSearching] = useState(false), [searchError, setSearchError] = useState('');
 const [target, setTarget] = useState<Personal | null>(null), [rulesOpen, setRulesOpen] = useState(false);
 const search = useRef<HTMLInputElement>(null), scroller = useRef<HTMLDivElement>(null), dialog = useRef<HTMLDialogElement>(null);
 const moreRequest = useRef<AbortController | null>(null);
 const searchBox = useRef<HTMLDivElement>(null);
 const isSearchOpen = picker || Boolean(query.trim());

 useEffect(() => {
  const controller = new AbortController(); moreRequest.current?.abort(); setMoreLoading(false); setMoreError('');
  setLoading(true); setError(''); scroller.current?.scrollTo({ top: 0 });
  void (mode === 'star' ? api<Board>(`/api/rankings/star?starId=${encodeURIComponent(starId)}`, { signal: controller.signal }).then(setBoard)
   : api<{ entries: Personal[] }>('/api/rankings/personal', { signal: controller.signal }).then(result => setPersonal(result.entries)))
   .catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : '榜单暂时连接不上'); })
   .finally(() => { if (!controller.signal.aborted) setLoading(false); });
  return () => { controller.abort(); moreRequest.current?.abort(); };
 }, [mode, starId, attempt]);

 useEffect(() => {
  if (!isSearchOpen) { setSearching(false); return; }
  const controller = new AbortController(); setSearching(true); setSearchError('');
  const timer = setTimeout(() => {
   const q = encodeURIComponent(query.trim());
   void (mode === 'star' ? api<{ stars: Star[] }>(`/api/rankings/stars?q=${q}`, { signal: controller.signal }).then(result => setStarMatches(result.stars))
    : api<{ matches: Personal[] }>(`/api/rankings/personal/search?q=${q}`, { signal: controller.signal }).then(result => setPersonalMatches(result.matches)))
    .catch(cause => { if (!controller.signal.aborted) setSearchError(cause instanceof Error ? cause.message : '搜索暂时连接不上'); })
    .finally(() => { if (!controller.signal.aborted) setSearching(false); });
  }, 180);
  return () => { clearTimeout(timer); controller.abort(); };
 }, [query, mode, isSearchOpen]);

 useEffect(() => {
  if (!isSearchOpen) return;
  const outside = (event: PointerEvent) => { if (!searchBox.current?.contains(event.target as Node)) { setPicker(false); setQuery(''); } };
  document.addEventListener('pointerdown', outside);
  return () => document.removeEventListener('pointerdown', outside);
 }, [isSearchOpen]);
 useEffect(() => { if (rulesOpen) dialog.current?.showModal(); else dialog.current?.close(); }, [rulesOpen]);

 function switchMode(next: 'star' | 'personal') {
  if (mode === next) return;
  setMode(next); setQuery(''); setPicker(false); setTarget(null); setLoading(true);
 }
 function chooseStar(star: Star) {
  if (starId !== star.id) { setLoading(true); setStarId(star.id); }
  setPicker(false); setQuery(''); search.current?.blur();
 }
 function locate(row: Personal) {
  setTarget(row); setPicker(false); setQuery(''); search.current?.blur();
  requestAnimationFrame(() => {
   if (row.inTop100) document.getElementById(`ranking-${row.star.id}`)?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'center' });
   else scroller.current?.scrollTo({ top: 0, behavior: 'smooth' });
  });
 }
 async function loadMore() {
  if (!board || board.nextOffset === null || moreLoading) return;
  const controller = new AbortController(); moreRequest.current = controller;
  setMoreLoading(true); setMoreError('');
  try {
   const result = await api<Board>(`/api/rankings/star?starId=${encodeURIComponent(board.star.id)}&offset=${board.nextOffset}`, { signal: controller.signal });
   if (!controller.signal.aborted) setBoard(old => old?.star.id === result.star.id ? { ...result, entries: [...old.entries, ...result.entries] } : old);
  } catch (cause) { if (!controller.signal.aborted) setMoreError(cause instanceof Error ? cause.message : '加载失败，请再试一次'); }
  finally { if (!controller.signal.aborted) setMoreLoading(false); }
 }
 const rows: Row[] = mode === 'star' ? (board?.entries || []).map(row => ({ ...row, id: row.userId }))
  : personal.map(row => ({ ...row, ...row.star, rank: row.rank }));
 const matches = mode === 'star' ? starMatches : personalMatches;
 const selected = board?.star;
 const podium = [rows[1], rows[0], rows[2]].filter(Boolean);

 return <main className="rankings-page">
  <div className="ranking-layout">
   <header className="ranking-nav"><button aria-label="返回更多玩法" onClick={onBack}><ArrowLeft size={21}/></button><div><span>每一份陪伴，都值得被看见</span><h1>充电榜 <Sparkles size={17}/></h1></div><button aria-label="榜单规则" onClick={() => setRulesOpen(true)}><Info size={20}/></button></header>
   <div className="ranking-tabs" role="tablist" aria-label="充电榜类型">
    <button role="tab" id="rank-tab-star" aria-selected={mode === 'star'} aria-controls="ranking-panel-star" onClick={() => switchMode('star')}><Trophy size={16}/>明星榜</button>
    <button role="tab" id="rank-tab-personal" aria-selected={mode === 'personal'} aria-controls="ranking-panel-personal" onClick={() => switchMode('personal')}><Zap size={16}/>个人榜</button>
   </div>
   <div className="ranking-context">
    {mode === 'star' ? <button className="ranking-star-selector" aria-label="切换明星" onClick={() => { setPicker(true); search.current?.focus(); }}>
     <Avatar name={selected?.name || '刘宇宁'} color={selected?.color || '#eadffa'} imageUrl={selected?.imageUrl} imageTransform={selected?.imageTransform}/><span><small>TA 的专属应援榜</small><strong>{selected?.name || '刘宇宁'}<ChevronDown size={16}/></strong></span><b>TOP 1000</b>
    </button> : <div className="ranking-personal-intro"><span className="ranking-heart"><Zap size={25} fill="currentColor"/></span><span><small>属于你的陪伴收藏</small><strong>我的明星充电榜</strong></span><b>TOP 100</b></div>}
   </div>
   <div ref={searchBox} className="ranking-search-wrap" onKeyDown={event => { if (event.key === 'Escape') { setPicker(false); setQuery(''); } }}>
    <div className="ranking-search"><Search size={17}/><input ref={search} aria-label={mode === 'star' ? '搜索明星' : '搜索明星，定位个人排名'} placeholder={mode === 'star' ? '搜索明星，切换 TA 的充电榜' : '搜索明星，看看 TA 在你心里的位置'} value={query} maxLength={40} onChange={event => { setQuery(event.target.value); setPicker(Boolean(event.target.value)); }}/>{query && <button aria-label="清空搜索" onClick={() => { setQuery(''); setPicker(false); search.current?.focus(); }}><X size={15}/></button>}</div>
    {isSearchOpen && <section className="ranking-search-results" aria-label={mode === 'star' ? '明星搜索结果' : '个人榜搜索结果'}>
     <small>{query ? '搜索结果' : '选择一位明星'}</small>
     {searching ? <p role="status"><LoaderCircle className="spin" size={16}/>正在搜索…</p> : searchError ? <p role="alert">{searchError}</p> : !matches.length ? <p role="status">没有找到这位明星，换个关键词试试</p> : mode === 'star' ? starMatches.map(star => <button key={star.id} onClick={() => chooseStar(star)}><Avatar {...star}/><span>{star.name}</span><small>{starId === star.id ? '当前明星' : '查看明星榜'}</small></button>)
      : personalMatches.map(row => <button key={row.star.id} onClick={() => locate(row)}><Avatar {...row.star}/><span>{row.star.name}<small>{format(row.intimacy)} 充电值</small></span><b>第 {row.rank} 名<small>{row.inTop100 ? '定位到榜单' : '未进入前 100'}</small></b></button>)}
    </section>}
   </div>
   <div className="ranking-demo-note"><span>示例榜单</span><p>{mode === 'star' ? '明星与上榜用户的累计充电值' : '你与每一位明星的累计充电值'}</p></div>
   <div ref={scroller} className="rankings-scroll" role="tabpanel" id={`ranking-panel-${mode}`} aria-labelledby={`rank-tab-${mode}`} tabIndex={0}>
    {loading ? <div className="ranking-loading" role="status"><p><LoaderCircle size={18} className="spin"/>正在整理充电榜…</p>{[0,1,2,3,4].map(i => <i key={i}/>)}</div> : error ? <div className="ranking-empty" role="alert"><Trophy size={35}/><h2>榜单暂时连接不上</h2><p>{error}</p><button onClick={() => setAttempt(value => value + 1)}>重新加载</button></div> : <>
     {target && mode === 'personal' && <div className="ranking-locate-note" role="status"><Search size={15}/><span>{target.inTop100 ? `已定位 ${target.star.name} · 第 ${target.rank} 名` : `${target.star.name} · 第 ${target.rank} 名，未进入前 100`}{!target.inTop100 && <small>当前充电值 {format(target.intimacy)}，继续收藏彼此的陪伴吧</small>}</span><button aria-label="关闭定位提示" onClick={() => setTarget(null)}><X size={14}/></button></div>}
     <section className="ranking-podium" aria-label={mode === 'star' ? '明星榜前三名' : '个人榜前三名'}>
      {podium.map(row => <div key={row.id} id={`ranking-${row.id}`} data-ranking-row={row.rank} className={`ranking-winner place-${row.rank}${target?.star.id === row.id ? ' is-located' : ''}`}>
       <div className="ranking-winner-avatar">{row.rank === 1 && <Crown size={24} fill="currentColor"/>}<Avatar {...row}/><i>{row.rank === 1 ? '1' : row.rank === 2 ? '2' : '3'}</i></div><strong>{row.isMe ? `${row.name}（我）` : row.name}</strong><span><Zap size={11} fill="currentColor"/>{format(row.intimacy)}</span><div className="ranking-podium-step"><span>{row.rank === 1 ? '心动领航' : row.rank === 2 ? '温暖同行' : '默契相伴'}</span></div>
      </div>)}
     </section>
     <div className="ranking-list-title"><h2>{mode === 'star' ? 'TA 的陪伴者' : '我的陪伴清单'}</h2><span>累计充电值 <Zap size={11}/></span></div>
     <ol className="ranking-list" start={4}>
      {rows.slice(3).map(row => <li key={row.id} id={`ranking-${row.id}`} data-ranking-row={row.rank} className={`ranking-row${row.isMe ? ' is-me' : ''}${target?.star.id === row.id ? ' is-located' : ''}`}><span className="ranking-number">{row.rank.toString().padStart(2, '0')}</span><Avatar {...row}/><div className="ranking-name"><strong>{row.name}{row.isMe && <i>我</i>}</strong><small>{mode === 'star' ? '把陪伴，写成独家的旋律' : '每一份心动，都有回响'}</small></div><b>{format(row.intimacy)}<Zap size={11}/></b></li>)}
     </ol>
     {moreError && <p className="ranking-more-error" role="alert">{moreError}</p>}
     {mode === 'star' && board?.nextOffset !== null ? <button className="ranking-load-more" onClick={() => void loadMore()} disabled={moreLoading}>{moreLoading ? <><LoaderCircle size={15} className="spin"/>加载中…</> : moreError ? '重试加载' : `加载更多 · 已展示 ${rows.length} / 1000`}</button> : <p className="ranking-list-end">已展示前 {mode === 'star' ? '1000' : '100'} 名 · 陪伴不止于名次</p>}
    </>}
   </div>
   {mode === 'star' && board && !loading && !error && <footer className="ranking-viewer" aria-label="我的明星榜排名"><span className="ranking-viewer-place"><b>{board.viewer.inTop1000 ? board.viewer.rank : '—'}</b><small>{board.viewer.inTop1000 ? '我的名次' : '暂未上榜'}</small></span><Avatar name={board.viewer.name} color={board.viewer.color}/><span className="ranking-viewer-copy"><strong>我与{board.star.name}</strong><small>{board.viewer.inTop1000 ? '一点一滴，都是靠近' : `距前 1000 名还差 ${format(board.viewer.gapToEnter)} 充电值`}</small></span><b>{format(board.viewer.intimacy)}<Zap size={12} fill="currentColor"/></b></footer>}
  </div>
  <dialog ref={dialog} className="ranking-rules" onCancel={() => setRulesOpen(false)} onClick={event => { if (event.target === event.currentTarget) setRulesOpen(false); }}><section><button aria-label="关闭榜单规则" onClick={() => setRulesOpen(false)}><X size={20}/></button><Trophy size={30}/><h2>每一份陪伴，都有位置</h2><p><strong>明星榜 · 前 1000 名</strong>选一位明星，查看 TA 与每位上榜用户的累计充电值。</p><p><strong>个人榜 · 前 100 名</strong>查看你与所有明星的累计充电值，搜索可定位排名；榜外明星会单独提示。</p><small>当前昵称、充电值及排名均为虚构示例，不影响小屋能量和真实关系数据。</small></section></dialog>
 </main>;
}
