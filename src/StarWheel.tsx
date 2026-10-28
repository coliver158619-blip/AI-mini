import {useEffect,useRef,useState} from 'react';

export const stars=[
 {id:'jay',name:'周杰伦'}, {id:'joker',name:'薛之谦'}, {id:'jj',name:'林俊杰'},
 {id:'vae',name:'许嵩'}, {id:'gem',name:'邓紫棋'}, {id:'eason',name:'陈奕迅'},
 {id:'li-ronghao',name:'李荣浩'}, {id:'wang-sulong',name:'汪苏泷'},
 {id:'liu-yuning',name:'刘宇宁'}, {id:'g-dragon',name:'权志龙'},
];
export default function StarWheel({value,onChange}:{value:string;onChange:(id:string)=>void}) {
 const ref=useRef<HTMLDivElement>(null),timer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined);
 const [moving,setMoving]=useState(false);
 const recenter=useRef<number|null>(null);
 const step=144,count=stars.length;
 const index=Math.max(0,stars.findIndex(s=>s.id===value));
 // Three identical turns let the reel settle across either end, then recenter invisibly.
 useEffect(()=>{if(ref.current){recenter.current=(count+index)*step;ref.current.scrollTop=recenter.current;}return()=>clearTimeout(timer.current)},[]);
 const move=(i:number)=>ref.current?.scrollTo({top:i*step,behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});
 return <div className="star-wheel-wrap"><div className={`star-wheel${moving?' is-moving':''}`} ref={ref} role="listbox" aria-label="上下滑动选择明星" aria-activedescendant={`star-${value}`} tabIndex={0}
  onKeyDown={e=>{if(e.key==='ArrowUp'||e.key==='ArrowDown'){e.preventDefault();move(Math.round(e.currentTarget.scrollTop/step)+(e.key==='ArrowUp'?-1:1))}else if(e.key==='Home'||e.key==='End'){e.preventDefault();move(e.key==='Home'?count:count*2-1)}}}
  onScroll={e=>{const element=e.currentTarget;
   if(recenter.current!==null&&Math.abs(element.scrollTop-recenter.current)<1){recenter.current=null;return;}
   recenter.current=null;setMoving(true);clearTimeout(timer.current);timer.current=setTimeout(()=>{
   const position=Math.round(element.scrollTop/step),selected=((position%count)+count)%count;
   onChange(stars[selected].id);
   setMoving(false);
   if(position<count||position>=count*2){recenter.current=(count+selected)*step;element.scrollTo({top:recenter.current,behavior:'instant'});}
  },120)}}>
  {Array.from({length:count*3},(_,i)=>{const star=stars[i%count],clone=i<count||i>=count*2;return <div key={i} id={clone?undefined:`star-${star.id}`} role={clone?'presentation':'option'} aria-hidden={clone||undefined} aria-selected={clone?undefined:value===star.id} aria-label={clone?undefined:star.name} className={`star-wheel-option star-portrait-${star.id}${value===star.id?' is-selected':''}`} onClick={()=>move(i)}>
   <span className="star-avatar-ring"><span className="star-avatar-crop"><img src={`/assets/stars/${star.id}-v1.webp`} alt={clone?'':star.name} draggable={false}/></span></span><span>{star.name}</span>
  </div>})}
 </div><small>上下滑动 · 选择你的音乐星光</small></div>;
}
