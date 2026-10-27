import {useEffect,useRef,useState} from 'react';
import {Pointer} from 'lucide-react';

export default function ChargeIntro({onClick,disabled}:{onClick:()=>void;disabled:boolean}) {
 const ref=useRef<HTMLButtonElement>(null);
 const [position,setPosition]=useState({left:0,top:0,width:100,ready:false});
 useEffect(()=>{
  const button=ref.current,nav=button?.parentElement;
  const weather=nav?.querySelector('.weather-pill'),tools=nav?.querySelector('.home-tools');
  if(!button||!nav||!weather||!tools)return;
  const measure=()=>{
   const n=nav.getBoundingClientRect(),w=weather.getBoundingClientRect(),t=tools.getBoundingClientRect();
   const right=t.left-n.left-12;
   let left=Math.max(n.width*.5,w.right-n.left+10),top=w.top-n.top;
   if(right-left<66){left=n.width*.5;top=w.bottom-n.top+9;}
   setPosition({left,top,width:Math.max(60,right-left),ready:true});
  };
  measure();const observer=new ResizeObserver(measure);[nav,weather,tools].forEach(el=>observer.observe(el));
  window.addEventListener('resize',measure);
  return()=>{observer.disconnect();window.removeEventListener('resize',measure)};
 },[]);
 return <button ref={ref} className="charge-intro" disabled={disabled} onClick={onClick} style={{left:position.left,top:position.top,width:position.width,visibility:position.ready?'visible':'hidden'}}><Pointer size={24} aria-hidden="true"/><span>点击听歌充电<br/><b>解锁电量权益</b></span></button>;
}
