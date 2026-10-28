import {test,expect} from '@playwright/test';

for(const size of [{width:393,height:852,top:59,bottom:34},{width:393,height:700,top:0,bottom:0},{width:393,height:740,top:47,bottom:34},{width:320,height:568,top:20,bottom:0},{width:844,height:390,top:0,bottom:21},{width:1920,height:500,top:0,bottom:0}])test(`首页居中和模块间距 ${size.width}x${size.height}`,async({page,request})=>{
 await request.post('/api/outfit',{data:{outfitId:'zsh09'}});
 await page.setViewportSize(size);
 await page.route('**/api/bootstrap',async route=>{const data=await(await route.fetch()).json();await route.fulfill({json:{...data,integration:{configured:true,state:'connected'}}})});
 await page.route('**/api/recommendations/hourly',route=>route.fulfill({json:{songs:[{id:'sunny-window',title:'最长的电影',artist:'周杰伦',tags:[],color:'#e4af63'}],pending:false,createdAt:new Date().toISOString(),nextAt:new Date(Date.now()+3600000).toISOString(),source:'kugou'}}));
 await page.goto('/');
 await page.evaluate(({top,bottom})=>{document.documentElement.style.setProperty('--safe-top',`${top}px`);document.documentElement.style.setProperty('--safe-bottom',`${bottom}px`)},size);
 for(let tap=0;tap<3;tap++) await page.locator('.companion').click();
 await expect(page.locator('.hourly-song')).toBeVisible();
 await expect(page.locator('.companion .character-visual')).toHaveAttribute('data-motion-ready','true');
 const geometry=()=>page.evaluate(()=>{
  const r=(s:string)=>document.querySelector(s)!.getBoundingClientRect();
  const figure=r('.companion'),bubble=r('.speech-bubble'),weather=r('.weather-pill'),buttons=r('.room-shortcuts'),caption=r('.companion-caption');
  return {center:figure.x+figure.width/2,weatherGap:bubble.top-weather.bottom,buttonsOverlap:Math.min(bubble.right,buttons.right)>Math.max(bubble.left,buttons.left)&&Math.min(bubble.bottom,buttons.bottom)>Math.max(bubble.top,buttons.top),figureGap:figure.top-bubble.bottom,beside:bubble.right<figure.x+figure.width*.23,captionGap:caption.top-figure.bottom,scroll:document.documentElement.scrollHeight>innerHeight+1};
 });
 const initial=await page.locator('.companion').boundingBox();
 for(const message of ['这首歌想和你一起听，你觉得怎么样？','你来啦，今天过得怎么样？陪你听会儿歌，慢慢聊。']){
  await page.locator('.bubble-copy').evaluate((el,text)=>{el.textContent=text},message);
  const g=await geometry();expect(g.center).toBeCloseTo(size.width/2,0);expect(g.weatherGap).toBeGreaterThanOrEqual(12);expect(g.buttonsOverlap).toBe(false);expect(g.figureGap>=0||g.beside).toBe(true);expect(g.captionGap).toBeGreaterThanOrEqual(-1);expect(g.scroll).toBe(false);
  expect(await page.locator('.companion').boundingBox()).toEqual(initial);
 }
 expect(await page.locator('.app-shell').evaluate(el=>getComputedStyle(el).backgroundImage)).toContain('/assets/room-v1.webp');
 await page.screenshot({path:`test-results/home-repair-${test.info().project.name}-${size.width}-${size.height}.png`,animations:'disabled'});
});

test('首帧时间提前也不消失，三种动作始终有像素并保持稳定比例',async({page,request})=>{
 await request.post('/api/outfit',{data:{outfitId:'zsh09'}});
 await page.addInitScript(()=>{const raf=window.requestAnimationFrame;window.requestAnimationFrame=callback=>raf.call(window,time=>callback(time-40));});
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/');const c=page.locator('.companion .character-visual');await expect(c).toHaveAttribute('data-motion-ready','true');
 const ratio=await c.locator('canvas').evaluate((canvas:HTMLCanvasElement)=>{
  const data=canvas.getContext('2d')!.getImageData(0,0,768,768).data;let left=768,right=0,top=768,bottom=0;
  for(let y=0;y<768;y++)for(let x=0;x<768;x++)if(data[(y*768+x)*4+3]>128){left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y)}
  return (right-left)/(bottom-top);
 });expect(ratio).toBeGreaterThan(.60);expect(ratio).toBeLessThan(.66);
 for(const choice of [0,.4,.8]){
  await page.evaluate(n=>{Math.random=()=>n},choice);await page.locator('.companion').click();
  const pixels=await c.locator('canvas').evaluate(async(canvas:HTMLCanvasElement)=>{
   const counts:number[]=[];for(let i=0;i<30;i++){
    await new Promise(requestAnimationFrame);const data=canvas.getContext('2d')!.getImageData(0,0,768,768).data;let count=0;for(let j=3;j<data.length;j+=4)if(data[j]>128)count++;counts.push(count);
   }return counts;
  });expect(Math.min(...pixels)).toBeGreaterThan(50000);await expect(c).toHaveAttribute('data-action','idle');
 }
 expect(errors).toEqual([]);
});

test('旧后台状态文案不会出现在首页或聊天欢迎语',async({page})=>{
 await page.route('**/api/bootstrap',async route=>{const data=await(await route.fetch()).json();data.greeting='上次记录（10月24日20:48）天气可能已经变化，刷新后我再为你挑歌。';data.weather={city:'广州',condition:'阴天',temperature:26,code:3,cached:true,greeting:data.greeting,updatedAt:'2026-10-24T20:48:00+08:00'};data.integration={configured:false,state:'disabled'};await route.fulfill({json:data})});
 await page.goto('/');await expect(page.locator('.bubble-copy')).not.toBeEmpty();await expect(page.locator('.bubble-copy')).not.toContainText(/记录|刷新|缓存/);
 await page.getByRole('button',{name:'和音乐搭子聊天',exact:true}).click();await expect(page.locator('.chat-messages')).not.toContainText(/记录|刷新|缓存/);
});
