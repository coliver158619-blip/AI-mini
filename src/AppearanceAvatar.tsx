import measurements from './character-metrics.json';
import type {Profile} from './types';
import './appearance-avatar.css';

export default function AppearanceAvatar({appearance,className=''}:{appearance?:Profile['appearance'];className?:string}){
 const bounds=appearance?measurements[appearance.id as keyof typeof measurements]:undefined;
 return <span className={`appearance-avatar ${className}`}><img src={appearance?.imageUrl || '/assets/personalities/INFP.png'} alt={appearance?.name || '音乐搭子'} draggable={false} style={bounds?{height:`${bounds.height*240}%`,top:`${bounds.top*2.4}%`,transform:`translateX(-${bounds.center}%)`}:undefined}/></span>;
}
