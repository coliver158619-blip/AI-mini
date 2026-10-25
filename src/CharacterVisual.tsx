import {useEffect,useRef,useState,type CSSProperties} from 'react';
import measurements from './character-metrics.json';
import {actionDuration,characterAtlas,createCharacterFrames,type CharacterAction} from './character-frames';
import './character-visual.css';
type Bounds={height:number;top:number;center:number};
const actions:CharacterAction[]=['wave','blink','wink'];
export default function CharacterVisual({id,src,alt,imageClass='',animated=false,reaction=0}:{id:string;src:string;alt:string;imageClass?:string;animated?:boolean;reaction?:number}){
 const canvas=useRef<HTMLCanvasElement>(null),renderer=useRef<ReturnType<typeof createCharacterFrames>>(null),animation=useRef(0),running=useRef(false),lastReaction=useRef(reaction);
 const [ready,setReady]=useState(false),[action,setAction]=useState<CharacterAction|'idle'>('idle');
 const atlas=animated?characterAtlas(id):undefined;
 useEffect(()=>{
  if(!atlas||!canvas.current)return;
  let active=true;const target=canvas.current;
  const stop=()=>{cancelAnimationFrame(animation.current);running.current=false;renderer.current?.draw('idle');setAction('idle')};
  const visibility=()=>{if(document.hidden)stop()};
  const lost=(event:Event)=>{event.preventDefault();stop();setReady(false)};
  const image=new Image();image.src=atlas.src;
  image.decode().then(()=>{if(active){renderer.current=createCharacterFrames(target,image,id);setReady(!!renderer.current)}}).catch(()=>{});
  target.addEventListener('contextlost',lost);document.addEventListener('visibilitychange',visibility);
  return()=>{active=false;cancelAnimationFrame(animation.current);running.current=false;renderer.current=null;target.removeEventListener('contextlost',lost);document.removeEventListener('visibilitychange',visibility)};
 },[id,atlas]);
 useEffect(()=>{
  if(reaction===lastReaction.current)return;lastReaction.current=reaction;
  if(!ready||running.current||window.matchMedia('(prefers-reduced-motion: reduce)').matches)return;
  const chosen=actions[Math.floor(Math.random()*actions.length)];let started:number|undefined;running.current=true;setAction(chosen);
  const tick=(now:number)=>{
   started??=now;const elapsed=Math.max(0,now-started);
   try {
    if(elapsed>=actionDuration[chosen]){renderer.current?.draw('idle');running.current=false;setAction('idle');return}
    renderer.current?.draw(chosen,elapsed);animation.current=requestAnimationFrame(tick);
   } catch { running.current=false;setAction('idle');setReady(false); }
  };
  animation.current=requestAnimationFrame(tick);
 },[reaction,ready]);
 const bounds=(measurements as Record<string,Bounds>)[id];
 const style:CSSProperties|undefined=bounds?{height:`${bounds.height*100}%`,top:`${bounds.top}%`,transform:`translateX(-${bounds.center}%)`}:undefined;
 return <span className={`character-visual${bounds?' is-normalized':''}`} data-character={id} data-action={action} data-motion-ready={ready} data-wave-ready={ready} data-renderer="frames">
  <img className={imageClass} src={src} alt={alt} draggable={false} decoding="async" style={style}/>
  {atlas&&<canvas ref={canvas} className="character-frames" aria-hidden="true" style={style}/>}
 </span>;
}
