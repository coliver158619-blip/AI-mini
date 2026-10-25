import {expect,test} from '@playwright/test';
import {readFileSync} from 'node:fs';
const atlases:Record<string,{src:string;width:number;height:number;frames:{x:number;y:number;width:number;height:number}[]}>=JSON.parse(readFileSync('src/character-motion-v2.json','utf8'));
const metrics=JSON.parse(readFileSync('src/character-metrics.json','utf8'));

test('全部装扮均有独立完整动作素材',()=>{
 expect(Object.keys(atlases).sort()).toEqual(Object.keys(metrics).sort());
 expect(new Set(Object.values(atlases).map(a=>a.src)).size).toBe(31);
 for(const atlas of Object.values(atlases)){
  expect(atlas.frames).toHaveLength(16);
  for(const f of atlas.frames){expect(f.x).toBeGreaterThanOrEqual(0);expect(f.y).toBeGreaterThanOrEqual(0);expect(f.x+f.width).toBeLessThanOrEqual(atlas.width);expect(f.y+f.height).toBeLessThanOrEqual(atlas.height);}
 }
});

for(const id of Object.keys(metrics))test(`${id} 三种动作可见、尺寸固定并回到静止`,async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/api/bootstrap',async route=>{const data=await(await route.fetch()).json();data.profile.appearance={id,imageName:`${id}.png`,imageUrl:`/assets/characters/web-v1/${id}.webp`,name:id};await route.fulfill({json:data})});
 await page.goto('/');const c=page.locator('.companion .character-visual');await expect(c).toHaveAttribute('data-motion-ready','true');
 const box=await c.boundingBox();
 await page.clock.install();await page.clock.pauseAt(new Date());
 for(const [value,action,duration] of [[0,'wave',2240],[.4,'blink',400],[.8,'wink',650]] as const){
  await page.evaluate(v=>{Math.random=()=>v},value);await page.locator('.companion').click();
  for(let step=0;step<5;step++){
   await page.clock.runFor(duration/6);
   await expect(c).toHaveAttribute('data-action',action);
   const pixels=await c.locator('canvas').evaluate((canvas:HTMLCanvasElement)=>{
    const data=canvas.getContext('2d')!.getImageData(0,0,768,768).data;let count=0,top=768,bottom=0;
    for(let y=0;y<768;y++)for(let x=0;x<768;x++)if(data[(y*768+x)*4+3]>128){count++;top=Math.min(top,y);bottom=Math.max(bottom,y)}
    return{count,top,bottom};
   });expect(pixels.count).toBeGreaterThan(30000);expect(pixels.bottom-pixels.top).toBeGreaterThan(570);
   expect(await c.boundingBox()).toEqual(box);
  }
  await page.clock.runFor(1000);await expect(c).toHaveAttribute('data-action','idle');
 }
 expect(errors).toEqual([]);
});
