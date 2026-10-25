import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { ArrowLeft, Check, Heart, Headphones, LoaderCircle, RefreshCw, Sparkles } from 'lucide-react';
import { api, post } from './api';
import type { Personality as Character, PersonalityGroup, Profile } from './types';
import CharacterVisual from './CharacterVisual';
import './personality.css';

type Props = { onBack: () => void; onProfile: (profile: Profile) => void; onSaved: () => void };

export default function Personality({ onBack, onProfile, onSaved }: Props) {
 const [characters, setCharacters] = useState<Character[]>([]);
 const [groups, setGroups] = useState<PersonalityGroup[]>([]);
 const [active, setActive] = useState(false);
 const [selectedId, setSelectedId] = useState('');
 const [currentId, setCurrentId] = useState('');
 const [filter, setFilter] = useState('all');
 const [loading, setLoading] = useState(true);
 const [error, setError] = useState('');
 const [saveError, setSaveError] = useState('');
 const [saving, setSaving] = useState(false);
 const [attempt, setAttempt] = useState(0);
 const [loadedImage, setLoadedImage] = useState('');
 const [imageError, setImageError] = useState('');
 const [reaction, setReaction] = useState(0);
 const busy = useRef(false);
 const callbacks = useRef({ onProfile, onSaved }); callbacks.current = { onProfile, onSaved };
 const heading = useRef<HTMLHeadingElement>(null);

 useEffect(() => { heading.current?.focus(); }, []);
 useEffect(() => {
  const controller = new AbortController();
  setLoading(true); setError('');
  void api<{ personalities: Character[]; groups: PersonalityGroup[]; profile: Profile }>('/api/personalities', { signal: controller.signal }).then(result => {
   if (controller.signal.aborted) return;
   if (!result.personalities.length) throw new Error('形象图鉴暂时没有内容，请稍后再试。');
   setCharacters(result.personalities); setGroups(result.groups);
   setSelectedId(result.profile.personalityId); setCurrentId(result.profile.personalityId); setActive(result.profile.appearanceMode === 'personality');
   callbacks.current.onProfile(result.profile);
  }).catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : '形象图鉴暂时连接不上'); })
   .finally(() => { if (!controller.signal.aborted) setLoading(false); });
  return () => controller.abort();
 }, [attempt]);

 const selected = characters.find(item => item.id === selectedId);
 const isCurrent = selectedId === currentId && active;
 const visible = characters.filter(item => filter === 'all' || item.groupId === filter);

 async function select() {
  if (!selected || isCurrent || busy.current || loadedImage !== selected.imageUrl || imageError === selected.imageUrl) return;
  busy.current = true; setSaving(true); setSaveError('');
  try {
   const result = await post<{ profile: Profile }>('/api/personality', { personalityId: selected.id });
   setCurrentId(result.profile.personalityId); setActive(true); callbacks.current.onProfile(result.profile); callbacks.current.onSaved();
  } catch (cause) { setSaveError(cause instanceof Error ? cause.message : '选择没有保存成功，请重试。'); }
  finally { busy.current = false; setSaving(false); }
 }

 return <main className="personality-page" style={selected ? { '--personality-color': selected.color, '--personality-accent': selected.accent } as CSSProperties : undefined}>
  <header className="personality-header"><button aria-label="返回更多玩法" onClick={onBack} disabled={saving}><ArrowLeft size={21}/></button><h1 ref={heading} tabIndex={-1}>音乐形象</h1><span>找到你的同频搭子</span></header>
  {loading ? <div className="personality-state" role="status"><LoaderCircle className="spin" size={30}/><p>正在打开音乐形象图鉴…</p></div>
   : error ? <div className="personality-state" role="alert"><Sparkles size={32}/><p>{error}</p><button onClick={() => setAttempt(value => value + 1)}><RefreshCw size={16}/>重新加载</button></div>
   : selected && <>
    <section className="personality-hero" aria-label="音乐形象预览">
     <div className="personality-hero-top"><span><Sparkles size={13}/>{selected.groupName}</span><span aria-live="polite">{isCurrent ? <><Check size={12}/>当前音乐形象</> : '正在浏览'}</span></div>
     <div className="personality-stage"><span aria-hidden="true"/><button className="personality-greet" aria-label={`和${selected.name}打招呼`} onClick={() => setReaction(value => value + 1)}><CharacterVisual key={selected.id} id={selected.id} src={selected.imageUrl} alt={selected.name} animated reaction={reaction} onLoad={() => { setLoadedImage(selected.imageUrl); setImageError(''); }} onError={() => setImageError(selected.imageUrl)}/></button></div>
     {imageError === selected.imageUrl && <p role="alert" className="personality-error">图片加载失败，请重新打开页面。</p>}
     <div className="personality-intro" aria-live="polite"><strong>{selected.musicStyles[1]}</strong><h2>{selected.name}</h2><p>{selected.description}</p><div className="personality-tags">{selected.traits.map(trait => <span key={trait}>{trait}</span>)}</div></div>
    </section>
    <section className="personality-details" aria-label="形象与音乐风格">
     <div><h3><Headphones size={16}/>音乐偏好</h3><p>{selected.musicStyles.join(' · ')}</p></div>
     <div><h3><Heart size={16}/>陪伴风格</h3><p>{selected.companionship}</p></div>
    </section>
    <section className="personality-catalog" aria-labelledby="personality-catalog-title">
     <div className="personality-catalog-heading"><h2 id="personality-catalog-title">16 种音乐形象</h2><span>选一个此刻喜欢的角色</span></div>
     <div className="personality-filters" role="group" aria-label="曲风分组">
      {[{ id: 'all', name: '全部' }, ...groups].map(group => <button key={group.id} aria-pressed={filter === group.id} disabled={saving} onClick={() => setFilter(group.id)}>{group.name}</button>)}
     </div>
     <div className="personality-grid" role="group" aria-label="选择音乐形象">
      {visible.map(item => <button key={item.id} aria-label={`查看 ${item.name}`} aria-pressed={selectedId === item.id} className={selectedId === item.id ? 'is-selected' : ''} disabled={saving}
       style={{ '--tile-color': item.color } as CSSProperties} onClick={() => { setSelectedId(item.id); setSaveError(''); }}>
       <span className="personality-tile-art"><img src={item.imageUrl} alt="" draggable={false}/>{currentId === item.id && <i>已选</i>}{selectedId === item.id && <Check size={13}/>}</span><strong>{item.name}</strong><small>{item.musicStyles[1]}</small>
      </button>)}
     </div>
     <p className="personality-note">角色设定 · 自由选择，随时可以更换</p>
    </section>
    <footer className="personality-footer">
     {saveError && <p role="alert" className="personality-error">{saveError}</p>}
     <button disabled={saving || isCurrent || loadedImage !== selected.imageUrl || imageError === selected.imageUrl} onClick={() => void select()}>
      {saving ? <LoaderCircle className="spin" size={17}/> : isCurrent ? <Check size={17}/> : <Sparkles size={17}/>}{saving ? '正在保存…' : isCurrent ? '当前音乐形象' : '选择这个音乐形象'}
     </button><p>选择后在首页使用，人物装扮会为你保留</p>
    </footer>
   </>}
 </main>;
}
