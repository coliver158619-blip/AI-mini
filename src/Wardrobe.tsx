import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { ArrowLeft, Check, CheckCheck, LoaderCircle, RefreshCw, Shirt, Sparkles } from 'lucide-react';
import { api, post } from './api';
import type { Character, Outfit, Profile } from './types';
import './wardrobe.css';

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
   setOutfits(result.outfits); setWornId(result.profile.outfitId); setSelectedId(result.profile.outfitId);
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
  if (!selected || isWorn || savingRef.current || !imageReady) return;
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
       className="wardrobe-character"
       onLoad={() => { setLoadedImage(selected.imageUrl); setFailedImage(''); }} onError={() => setFailedImage(selected.imageUrl)}/>
      {failedImage === selected.imageUrl && <p className="wardrobe-image-error" role="alert">图片暂时无法显示，请重新打开衣橱。</p>}
     </div>
     <div className="wardrobe-preview-copy" aria-live="polite"><span>{selected.tag}</span><h2>{selected.name}</h2><p>{selected.description}</p></div>
    </section>
    <section className="wardrobe-collection" aria-labelledby="wardrobe-collection-title">
     <div className="wardrobe-collection-heading"><h2 id="wardrobe-collection-title">形象选择 <span>{characters.length}</span></h2><p>先选人物，再挑装扮</p></div>
     <div className="wardrobe-characters" role="group" aria-label="选择形象">
      {characters.map(character => <button key={character.id} aria-pressed={characterId === character.id} disabled={saving}
       onClick={() => { setCharacterId(character.id); setSelectedId(remembered[character.id] || character.defaultOutfitId); setSaveError(''); }}>
       <img src={character.imageUrl} alt="" draggable={false}/><span><strong>{character.name}</strong><small>{outfits.filter(item => item.characterId === character.id).length} 套装扮</small></span>{characterId === character.id && <Check size={16}/>}
      </button>)}
     </div>
     <div className="wardrobe-collection-heading wardrobe-outfit-heading"><h2>{characters.find(item => item.id === characterId)?.name}的衣橱 <span>{visible.length}</span></h2><p>轻点装扮，即刻试穿</p></div>
     <div className="wardrobe-grid" role="group" aria-label="选择装扮">
      {visible.map(outfit => <button key={outfit.id} className={`wardrobe-card${outfit.id === selectedId ? ' is-selected' : ''}`} aria-label={`试穿${outfit.name}`} aria-pressed={outfit.id === selectedId} disabled={saving}
       onClick={() => { setSelectedId(outfit.id); setSaveError(''); }} style={{ '--outfit-color': outfit.color } as CSSProperties}>
       <span className="wardrobe-card-art"><img src={outfit.thumbnailUrl} alt="" draggable={false}/>{outfit.id === wornId && active && <span className="wardrobe-worn"><Check size={10}/>已穿戴</span>}{outfit.id === selectedId && <span className="wardrobe-selected" aria-hidden="true"><Check size={11}/></span>}</span>
       <strong>{outfit.name}</strong><small>{outfit.tag}</small>
      </button>)}
     </div>
    </section>
    <footer className="wardrobe-footer">
     {saveError && <p className="wardrobe-save-error" role="alert">{saveError}</p>}
     <button className="wardrobe-wear" disabled={saving || isWorn || !imageReady} onClick={() => void wear()}>
      {saving ? <LoaderCircle className="spin" size={18}/> : isWorn ? <CheckCheck size={18}/> : <Shirt size={18}/>}
      {saving ? '正在保存…' : isWorn ? '已穿戴' : '穿上这套'}
     </button>
     <p>{isWorn ? '这套装扮正在小屋里陪伴你' : '确认后回到首页，音乐人格仍会保留'}</p>
    </footer>
   </>}
 </main>;
}
