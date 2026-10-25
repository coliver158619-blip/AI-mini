import atlases from './character-motion-v2.json';
import musicAtlases from './music-image-motion.json';
import measurements from './character-metrics.json';
export type CharacterAction='wave'|'blink'|'wink';
export const actionDuration:Record<CharacterAction,number>={wave:2240,blink:400,wink:650};
type Atlas={src:string;width:number;height:number;frames:{x:number;y:number;width:number;height:number;anchor:number}[];layout?:{height:number;top:number;center:number;widthScale:number}};
export const characterAtlas=(id:string):Atlas|undefined=>(atlases as Record<string,Atlas>)[id]||(musicAtlases as Record<string,Atlas>)[id];
const sequences:Record<CharacterAction,number[]>={wave:[0,8,9,10,11,12,13,12,13,12,10,14,15,0],blink:[0,3,2,3,0],wink:[0,7,6,7,0]};
export function createCharacterFrames(canvas:HTMLCanvasElement,image:HTMLImageElement,id:string){
 const atlas=characterAtlas(id),ctx=canvas.getContext('2d');if(!atlas||!ctx)return null;
 const bounds=measurements[id as keyof typeof measurements];
 canvas.width=768;canvas.height=atlas.layout?960:768;
 const {height,top,center,widthScale}=atlas.layout||{height:768/bounds.height,top:-bounds.top*(768/bounds.height)/100,center:768*bounds.center/100,widthScale:.9};
 const paint=(index:number,alpha:number)=>{
  // Use the same modest width correction for idle and every action frame.
  const frame=atlas.frames[index],width=frame.width/frame.height*height*widthScale;
  ctx.globalAlpha=alpha;
  ctx.drawImage(image,frame.x,frame.y,frame.width,frame.height,center-width*frame.anchor/100,top,width,height);
 };
 const draw=(action:CharacterAction|'idle',elapsed=0)=>{
  ctx.clearRect(0,0,canvas.width,canvas.height);ctx.globalCompositeOperation='source-over';
  if(action==='idle'){paint(0,1);return}
  // A first RAF timestamp may precede the click's performance.now() by one frame.
  const frames=sequences[action],progress=Math.max(0,Math.min(frames.length-1,elapsed/actionDuration[action]*(frames.length-1)));
  const index=Math.floor(progress),next=Math.min(index+1,frames.length-1),fraction=progress-index;
  // Blend complete, aligned frames briefly. Never deform or assemble individual limbs.
  const mix=Math.max(0,(fraction-.55)/.45);
  paint(frames[index],1-mix);
  if(mix>0){ctx.globalCompositeOperation='lighter';paint(frames[next],mix)}
  ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';
 };
 draw('idle');return{draw};
}
