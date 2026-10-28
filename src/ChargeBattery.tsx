import { Zap } from 'lucide-react';
import './charge-battery.css';

export default function ChargeBattery({ days }: { days: number }) {
 const tier = days > 300 ? 'max' : days >= 200 ? 'surge' : days >= 100 ? 'spark' : 'calm';
 const progress = Math.min(100, Math.max(0, days / 300 * 100));
 return <span className={`charge-battery charge-battery--${tier}`} aria-hidden="true">
  <span className="charge-battery-track"><span className="charge-battery-fill" style={{ width: `${progress}%` }}/></span>
  <b>{days}</b>
  <Zap className="charge-battery-bolt" size={10} fill="currentColor"/>
  {tier !== 'calm' && <svg className="charge-battery-arcs" viewBox="0 0 100 40" preserveAspectRatio="none" fill="none">
   <rect className="charge-battery-orbit" x="1" y="1" width="98" height="38" rx="11" pathLength="100"/>
   <path className="charge-battery-spark spark-top" d="M14 1l6-3 3 5 5-5 5 3"/>
   <path className="charge-battery-spark spark-bottom" d="M66 39l5-3 4 5 3-5 7 3"/>
   {tier !== 'spark' && <>
    <path className="charge-battery-spark spark-side" d="M1 14l-3 4 5 3-5 4 3 4"/>
    <rect className="charge-battery-orbit orbit-gold" x="-2" y="-2" width="104" height="44" rx="14" pathLength="100"/>
   </>}
   {tier === 'max' && <path className="charge-battery-stars" d="M11-6v6m-3-3h6m72 43v6m-3-3h6m16-32v6m-3-3h6"/>}
  </svg>}
 </span>;
}
