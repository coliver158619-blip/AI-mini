import { Heart } from 'lucide-react';
import { useState } from 'react';
import CharacterVisual from './CharacterVisual';
import type { Profile } from './types';
import './couple-characters.css';

export default function CoupleCharacters({ profile, interactive = false }: { profile: Profile; interactive?: boolean }) {
 const [boyReaction, setBoyReaction] = useState(0), [girlReaction, setGirlReaction] = useState(0);
 const male = profile.characterOutfitIds.lyn || 'lyn28';
 const female = profile.characterOutfitIds.zsh || 'zsh09';
 return <div className="couple-characters">
  {interactive ? <button className="couple-figure is-boy" onClick={() => setBoyReaction(value => value + 1)} aria-label="和 KUGUY 打招呼"><CharacterVisual key={male} id={male} src={`/assets/characters/web-v1/${male}.webp`} alt="KUGUY 的当前装扮" imageClass="couple-boy" animated reaction={boyReaction}/></button> : <span className="couple-figure is-boy"><CharacterVisual id={male} src={`/assets/characters/web-v1/${male}.webp`} alt="KUGUY 的当前装扮" imageClass="couple-boy"/></span>}
  <span className="couple-heart" aria-label="心动相伴"><Heart fill="currentColor" strokeWidth={1.5}/><i/><i/></span>
  {interactive ? <button className="couple-figure is-girl" onClick={() => setGirlReaction(value => value + 1)} aria-label="和 KUGIRL 打招呼"><CharacterVisual key={female} id={female} src={`/assets/characters/web-v1/${female}.webp`} alt="KUGIRL 的当前装扮" imageClass="couple-girl" animated reaction={girlReaction}/></button> : <span className="couple-figure is-girl"><CharacterVisual id={female} src={`/assets/characters/web-v1/${female}.webp`} alt="KUGIRL 的当前装扮" imageClass="couple-girl"/></span>}
 </div>;
}
