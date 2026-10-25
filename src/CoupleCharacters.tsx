import { useId, useState } from 'react';
import CharacterVisual from './CharacterVisual';
import subjectOffsets from './couple-subject-offsets.json';
import type { Profile } from './types';
import './couple-characters.css';

export default function CoupleCharacters({ profile, interactive = false }: { profile: Profile; interactive?: boolean }) {
 const [boyReaction, setBoyReaction] = useState(0), [girlReaction, setGirlReaction] = useState(0);
 const noteGradient = useId();
 const male = profile.characterOutfitIds.lyn || 'lyn28';
 const female = profile.characterOutfitIds.zsh || 'zsh09';
 // Static cutouts include props; animated frames already align each head to its column.
 const offsets = subjectOffsets as Record<string, number>;
 const noteOffset = interactive ? 0 : ((offsets[female] || 0) - (offsets[male] || 0)) / 2;
 return <div className="couple-characters">
  {interactive ? <button className="couple-figure is-boy" onClick={() => setBoyReaction(value => value + 1)} aria-label="和 KUGUY 打招呼"><CharacterVisual key={male} id={male} src={`/assets/characters/web-v1/${male}.webp`} alt="KUGUY 的当前装扮" imageClass="couple-boy" animated reaction={boyReaction}/></button> : <span className="couple-figure is-boy"><CharacterVisual id={male} src={`/assets/characters/web-v1/${male}.webp`} alt="KUGUY 的当前装扮" imageClass="couple-boy"/></span>}
  <span className="couple-note" style={{left:`calc(50% + ${noteOffset} * min(90cqh, 65cqw))`}} role="img" aria-label="跳动的彩色音符"><svg viewBox="0 0 32 32" aria-hidden="true"><defs><linearGradient id={noteGradient} x1="0" y1="0" x2="1" y2="1"><stop stopColor="#ff85ae"/><stop offset=".5" stopColor="#a575f2"/><stop offset="1" stopColor="#54cbdc"/></linearGradient></defs><g transform="translate(1.5 0)" fill={`url(#${noteGradient})`}><path d="M11 8 27 4v18h-3V11l-10 2.5V26h-3Z"/><ellipse cx="8" cy="26" rx="6" ry="4"/><ellipse cx="21" cy="22" rx="6" ry="4"/></g></svg></span>
  {interactive ? <button className="couple-figure is-girl" onClick={() => setGirlReaction(value => value + 1)} aria-label="和 KUGIRL 打招呼"><CharacterVisual key={female} id={female} src={`/assets/characters/web-v1/${female}.webp`} alt="KUGIRL 的当前装扮" imageClass="couple-girl" animated reaction={girlReaction}/></button> : <span className="couple-figure is-girl"><CharacterVisual id={female} src={`/assets/characters/web-v1/${female}.webp`} alt="KUGIRL 的当前装扮" imageClass="couple-girl"/></span>}
 </div>;
}
