import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { ArrowLeft, Check, CheckCheck, LoaderCircle, RefreshCw, Shirt, Sparkles } from 'lucide-react';
import { api, post } from './api';
import type { Character, Outfit, Profile } from './types';
import './wardrobe.css';
import OutfitUnlock from './OutfitUnlock';

type Props = { onBack: () => void; onProfile: (profile: Profile) => void; onSaved: () => void };

export default function Wardrobe({ onBack, onProfile, onSaved }: Props) {
 const [characters, setCharacters] = useState<Character[]>([]);
 const [characterId, setCharacterId] = useState('');
 const [remembered, setRemembered] = useState<Record<string, string>>({});
 const [active, setActive] = useState(false);
 const [outfits, setOutfits] = useState<Outfit[]>([]);
 const [selectedId, setSelectedId] = useState('');
 const [wornId, setWornId] = useState('');
 const [loading, setLoading] = useState(true);
 const [loadError, setLoadError] = useState('');
 const [saveError, setSaveError] = useState('');
 const [saving, setSaving] = useState(false);
 const [attempt, setAttempt] = useState(0);
 const [loadedImage, setLoadedImage] = useState('');
 const [failedImage, setFailedImage] = useState('');
 const [unlocking, setUnlocking] = useState<Outfit | null>(null);
 const savingRef = useRef(false);
 const onProfileRef = useRef(onProfile); onProfileRef.current = onProfile;
 const heading = useRef<HTMLHeadingElement>(null);

 useEffect(() => { heading.current?.focus(); }, []);
 useEffect(() => {
  const controller = new AbortController();
  setLoading(true); setLoadError('');
  void api<{ characters: Character[]; outfits: Outfit[]; profile: Profile }>('/api/outfits', { signal: controller.signal }).then(result => {
   if (controller.signal.aborted) return;
   if (!result.outfits.length) throw new Error('衣橱暂时没有装扮，请稍后再试。');
   setCharacters(result.characters); setCharacterId(result.profile.outfit.characterId); setRemembered(result.profile.characterOutfitIds); setActive(result.profile.appearanceMode === 'outfit');
   const initial = result.outfits.find(item => item.id === result.profile.outfitId && item.unlocked)
    || result.outfits.find(item => item.characterId === result.profile.outfit.characterId && item.unlocked)!;
   setOutfits(result.outfits); setWornId(result.profile.outfitId); setSelectedId(initial.id);
   onProfileRef.current(result.profile);
  }).catch(cause => {
   if (!controller.signal.aborted) setLoadError(cause instanceof Error ? cause.message : '衣橱暂时连接不上');
  }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
  return () => controller.abort();
 }, [attempt]);

 const selected = outfits.find(outfit => outfit.id === selectedId);
 const visible = outfits.filter(outfit => outfit.characterId === characterId);
 const isWorn = selectedId === wornId && active;
 const imageReady = Boolean(selected && loadedImage === selected.imageUrl && failedImage !== selected.imageUrl);

 async function wear() {
  if (!selected?.unlocked || isWorn || savingRef.current || !imageReady) return;
  savingRef.current = true; setSaving(true); setSaveError('');
  try {
   const result = await post<{ profile: Profile }>('/api/outfit', { outfitId: selected.id });
   setWornId(result.profile.outfitId); setActive(true); setRemembered(result.profile.characterOutfitIds); onProfileRef.current(result.profile); onSaved();
  } catch (cause) { setSaveError(cause instanceof Error ? cause.message : '穿戴没有保存成功，请重试。'); }
  finally { savingRef.current = false; setSaving(false); }
 }

 return <main className="wardrobe-page">
  <header className="wardrobe-header">
   <button className="wardrobe-back" aria-label="返回更多玩法" onClick={onBack} disabled={saving}><ArrowLeft size={21}/></button>
   <h1 ref={heading} tabIndex={-1}>形象衣橱</h1>
   <span><Shirt size={15}/> 我的装扮</span>
  </header>
  {loading ? <div className="wardrobe-state" role="status"><LoaderCircle className="spin" size={30}/><p>正在打开你的衣橱…</p></div>
   : loadError ? <div className="wardrobe-state" role="alert"><Shirt size={36}/><p>{loadError}</p><button onClick={() => setAttempt(value => value + 1)}><RefreshCw size={16}/>重新加载</button></div>
   : selected && <>
    <section className="wardrobe-preview" aria-label="装扮预览" style={{ '--outfit-color': selected.color } as CSSProperties}>
     <div className="wardrobe-preview-top"><span><Sparkles size={14}/> 今天，换个心情</span><span className="wardrobe-preview-status" aria-live="polite">{isWorn ? <><Check size={12}/>当前穿戴</> : '试穿中'}</span></div>
     <div className="wardrobe-stage">
      <span className="wardrobe-orbit" aria-hidden="true"/><span className="wardrobe-pedestal" aria-hidden="true"/>
      <img key={selected.imageUrl} src={selected.imageUrl} alt={`${selected.name}装扮预览`} draggable={false}
       className="wardrobe-character" decoding="async" fetchPriority="high"
       onLoad={() => { setLoadedImage(selected.imageUrl); setFailedImage(''); }} onError={() => setFailedImage(selected.imageUrl)}/>
      {failedImage === selected.imageUrl && <p className="wardrobe-image-error" role="alert">图片暂时无法显示，请重新打开衣橱。</p>}
     </div>
     <div className="wardrobe-preview-copy" aria-live="polite"><span>{selected.tag}</span><h2>{selected.name}</h2><p>{selected.description}</p></div>
    </section>
    <section className="wardrobe-collection" aria-labelledby="wardrobe-collection-title">
     <div className="wardrobe-collection-heading"><h2 id="wardrobe-collection-title">形象选择 <span>{characters.length}</span></h2><p>先选人物，再挑装扮</p></div>
     <div className="wardrobe-characters" role="group" aria-label="选择形象">
      {characters.map(character => <button key={character.id} aria-pressed={characterId === character.id} disabled={saving}
       onClick={() => { setCharacterId(character.id); setSelectedId(outfits.find(item => item.id === remembered[character.id] && item.unlocked)?.id || character.defaultOutfitId); setSaveError(''); }}>
       <img src={character.imageUrl} alt="" draggable={false} decoding="async"/><span><strong>{character.name}</strong><small>{outfits.filter(item => item.characterId === character.id).length} 套装扮</small></span>{characterId === character.id && <Check size={16}/>}
      </button>)}
     </div>
     <div className="wardrobe-collection-heading wardrobe-outfit-heading"><h2>{characters.find(item => item.id === characterId)?.name}的衣橱 <span>{visible.length}</span></h2><p>解锁心动，随心装扮</p></div>
     <div className="wardrobe-grid" role="group" aria-label="选择装扮">
      {visible.map((outfit, index) => <button key={outfit.id} className={`wardrobe-card${outfit.id === selectedId ? ' is-selected' : ''}${outfit.unlocked ? '' : ' is-locked'}`} aria-label={`${outfit.unlocked ? '试穿' : '解锁'}${outfit.name}`} aria-pressed={outfit.id === selectedId} disabled={saving}
       onClick={() => { if (!outfit.unlocked) setUnlocking(outfit); else setSelectedId(outfit.id); setSaveError(''); }} style={{ '--outfit-color': outfit.color } as CSSProperties}>
       <span className="wardrobe-card-art"><img key={outfit.thumbnailUrl} src={outfit.thumbnailUrl} alt="" draggable={false} width={320} height={320} loading={index < 6 ? 'eager' : 'lazy'} decoding="async" onLoad={event => event.currentTarget.classList.add('is-loaded')}/>{outfit.id === wornId && active && outfit.unlocked && <span className="wardrobe-worn"><Check size={10}/>已穿戴</span>}{outfit.id === selectedId && <span className="wardrobe-selected" aria-hidden="true"><Check size={11}/></span>}{!outfit.unlocked && <span className="wardrobe-lock" aria-hidden="true"><svg viewBox="0 0 40 48" focusable="false"><path d="M9 21V13a11 11 0 0 1 22 0v8" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round"/><path fill="currentColor" fillRule="evenodd" d="M8 19h24a6 6 0 0 1 6 6v17a6 6 0 0 1-6 6H8a6 6 0 0 1-6-6V25a6 6 0 0 1 6-6Zm12 9a4 4 0 0 0-2.7 7l-1 6h7.4l-1-6a4 4 0 0 0-2.7-7Z"/></svg><small>{outfit.unlockMethod === 'album' ? '专辑解锁' : '能量解锁'}</small></span>}</span>
       <strong>{outfit.name}</strong><small>{outfit.tag}</small>
      </button>)}
     </div>
    </section>
    <footer className="wardrobe-footer">
     {saveError && <p className="wardrobe-save-error" role="alert">{saveError}</p>}
     <button className="wardrobe-wear" disabled={saving || isWorn || !imageReady || !selected.unlocked} onClick={() => void wear()}>
      {saving ? <LoaderCircle className="spin" size={18}/> : isWorn ? <CheckCheck size={18}/> : <Shirt size={18}/>}
      {saving ? '正在保存…' : isWorn ? '已穿戴' : '穿上这套'}
     </button>
     <p>{isWorn ? '这套装扮正在小屋里陪伴你' : '确认后回到首页，音乐形象仍会保留'}</p>
    </footer>
   </>}
  {unlocking && <OutfitUnlock outfit={unlocking} onClose={() => setUnlocking(null)} onUnlocked={outfit => {
   setOutfits(items => items.map(item => item.id === outfit.id ? outfit : item)); setSelectedId(outfit.id);
  }}/>}
 </main>;
}

