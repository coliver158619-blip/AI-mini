import { Flame, Heart, Share2 } from 'lucide-react';
import type { Profile } from './types';
import './streak-share.css';
import CoupleCharacters from './CoupleCharacters';

type Props = { profile: Profile; isDemo?: boolean; onOpenSpace: () => void };

export default function StreakShare({ profile, isDemo, onOpenSpace }: Props) {
 return <section className="streak-share" aria-labelledby="streak-share-title">
  <div className="streak-share-card">
   <div className="streak-share-copy">
    <span className="streak-share-eyebrow"><Flame size={13}/> 让陪伴，有回响</span>
    <h3 id="streak-share-title">听歌续火花</h3>
    {profile.streak > 0 ? <p className="streak-share-count"><strong>{profile.streak}</strong><span>天<br/>连续听歌</span></p>
     : <p className="streak-share-start">从今天的第一首歌开始</p>}
    <p className="streak-share-companion">和{profile.name}相伴的第 {profile.days} 天</p>
   </div>
   <div className="streak-couple"><CoupleCharacters profile={profile}/></div>
  </div>
  {isDemo && <p className="streak-share-demo">火花天数包含示例听歌记录</p>}
  <div className="streak-share-actions">
   <button type="button" className="streak-space-button" onClick={onOpenSpace}><Heart size={16}/>进入陪伴空间</button>
   <button type="button" className="streak-share-button"><Share2 size={17}/>分享火花</button>
  </div>
 </section>;
}
