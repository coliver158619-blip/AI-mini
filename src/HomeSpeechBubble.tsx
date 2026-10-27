import { useEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from 'react';
import { characterAtlas } from './character-frames';
import type { Profile } from './types';
import './home-bubble.css';

const musicInks: Record<string, string> = {
 folk:'#64834f', rnb:'#6b8256', rock:'#8560ae', hiphop:'#b28a36',
 electronic:'#9270b4', pop:'#b78944', classical:'#577fa5', guofeng:'#628d8b',
};

function bubbleInk(profile: Profile) {
 if(profile.appearanceMode === 'personality') return musicInks[profile.personality.pairId || ''] || profile.personality.accent;
 // The wardrobe already supplies each outfit's palette; darken it for a readable outline.
 const hex = profile.outfit.color.replace('#','');
 const rgb = [0,2,4].map(index=>parseInt(hex.slice(index,index+2),16)/255);
 if(rgb.some(value=>!Number.isFinite(value))) return '#647088';
 const [r,g,b]=rgb, high=Math.max(...rgb), low=Math.min(...rgb), delta=high-low;
 const hue=delta===0?220:((high===r?(g-b)/delta+(g<b?6:0):high===g?(b-r)/delta+2:(r-g)/delta+4)*60);
 return `hsl(${Math.round(hue)} ${delta<.04?12:delta<.09?26:42}% 43%)`;
}

export default function HomeSpeechBubble({ profile, figureRef, hasSong, children }: {
 profile: Profile; figureRef: RefObject<HTMLButtonElement | null>; hasSong: boolean; children: ReactNode;
}) {
 const ref=useRef<HTMLDivElement>(null);
 const [frame,setFrame]=useState({width:260,height:140,left:0,top:0,tipX:130,tipY:139,side:false,ready:false});
 useEffect(()=>{
  const bubble=ref.current, figure=figureRef.current, stage=bubble?.parentElement;
  if(!bubble||!figure||!stage)return;
  const visual=figure.querySelector('.character-visual') as HTMLElement|null;
  const measure=()=>{
   const parent=stage.getBoundingClientRect(), body=bubble.getBoundingClientRect();
   const person=(visual||figure).getBoundingClientRect();
   const layout=characterAtlas(profile.appearance.id)?.layout;
   const scale=layout?Math.min(person.width/768,person.height/960):0;
   const headX=layout?person.left+(person.width-768*scale)/2+layout.center*scale:person.left+person.width/2;
   const headTop=layout?person.top+(person.height-960*scale)/2+layout.top*scale:person.top;
   const side=window.matchMedia('(min-width:700px) and (max-height:550px)').matches;
   const width=body.width,height=body.height;
   const left=side?Math.max(14,headX-parent.left-person.height*.25-8-width-16):parent.width/2-8-width/2;
   const top=side?Math.max(0,headTop-parent.top+person.height*.2-height/2):Math.max(0,headTop-parent.top-8-height);
   const tipX=side?width+16:Math.max(30,Math.min(width-30,headX-parent.left-left));
   const tipY=side?Math.max(28,Math.min(height-30,headTop-parent.top+person.height*.2-top)):height-1;
   const next={width,height,left,top,tipX,tipY,side,ready:true};
   setFrame(old=>Object.keys(next).every(key=>old[key as keyof typeof old]===next[key as keyof typeof next])?old:next);
  };
  measure();
  const observer=new ResizeObserver(measure);
  for(const element of [bubble,figure,stage,...(visual?[visual]:[])])observer.observe(element);
  window.addEventListener('resize',measure);
  return()=>{observer.disconnect();window.removeEventListener('resize',measure)};
 },[profile.appearance.id,figureRef]);
 const {width:w,height:h,tipX:x,tipY:y,side}=frame;
 const bottom=h-20;
 const shape=side?`M4 10 L${w-4} 3 L${w-7} ${y-15} L${x} ${y} L${w-7} ${y+13} L${w-8} ${bottom} L4 ${bottom+3} Z`
  :`M4 10 L${w-4} 3 L${w-8} ${bottom} L${x+18} ${bottom} L${x} ${y} L${x-12} ${bottom} L4 ${bottom+3} Z`;
 return <div ref={ref} className={`speech-bubble home-comic-bubble${hasSong?' has-hourly-song':''}`} data-tail-side={side?'right':'bottom'}
  style={{'--bubble-ink':bubbleInk(profile),...(frame.ready?{left:frame.left,top:frame.top,transform:'none'}:{visibility:'hidden'})} as CSSProperties & {'--bubble-ink':string}}>
  <svg className="bubble-outline" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden="true">
   <path d={shape} fill="#fff5eb" stroke="var(--bubble-ink)" strokeWidth="4" vectorEffect="non-scaling-stroke"/>
   <path d={`M18 16 L${Math.min(86,w*.35)} 14 M${w-72} ${bottom-8} H${w-22}`} fill="none" stroke="var(--bubble-ink)" strokeWidth="1.5"/>
   <circle className="bubble-tip-anchor" cx={x} cy={y} r="0"/>
  </svg>
  <svg className="bubble-emphasis" viewBox="0 0 48 40" aria-hidden="true"><path d="M4 33 31 35 4 37ZM14 10 36 28 10 17ZM35 2 43 25 43 0Z" fill="var(--bubble-ink)"/></svg>
  {children}
 </div>;
}
