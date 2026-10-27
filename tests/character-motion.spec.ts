import { expect, test } from '@playwright/test';

test('整帧动作保持人物高度，尺寸不随动作和对话框改变', async ({ page, request }) => {
 await request.post('/api/outfit', { data: { outfitId: 'zsh09' } });
 await page.goto('/');
 const character=page.locator('.companion .character-visual'), button=page.locator('.companion');
 await expect(character).toHaveAttribute('data-motion-ready','true');await expect(character).toHaveAttribute('data-wave-ready','true');
 await expect(character.locator('img')).toHaveAttribute('src','/assets/characters/web-v1/zsh09.webp');
 for (const size of [{width:1920,height:500},{width:844,height:390},{width:393,height:852}]) {
  await page.setViewportSize(size);
  const before=await character.boundingBox();
  const caption=await page.locator('.companion-caption').boundingBox();expect(before!.y+before!.height).toBeLessThanOrEqual(caption!.y+1);
  await page.locator('.bubble-copy').evaluate(el=>{el.textContent='这是一段更长的问候，今天也想陪你一起听歌。'.repeat(5);});
  const after=await character.boundingBox();
  expect(after!.width).toBeCloseTo(before!.width,2);expect(after!.height).toBeCloseTo(before!.height,2);
  await page.locator('.bubble-copy').evaluate(el=>{el.textContent='今天也陪着你。';});
  await page.screenshot({path:`test-results/original-motion-${size.width}.png`,fullPage:true});
 }
 await page.clock.install();await page.clock.pauseAt(new Date());
 const original=await character.locator('img').boundingBox();
 for (const [value,action,hold] of [[0,'wave',600],[.4,'blink',100],[.8,'wink',220]] as const) {
  await page.evaluate(n=>{Math.random=()=>n;},value);
  await button.click();if(action==='wave'){await page.clock.runFor(180);await page.screenshot({path:'test-results/girl-wave-raising.png'});}await page.clock.runFor(action==='wave'?hold-180:hold);
  await expect(character).toHaveAttribute('data-action',action);
  const bounds=await character.locator('.character-frames').boundingBox();
  expect(bounds!.width).toBeCloseTo(original!.width,2);expect(bounds!.height).toBeCloseTo(original!.height,2);
  const pixels=await character.locator('.character-frames').evaluate((canvas:HTMLCanvasElement)=>{
   const {data}=canvas.getContext('2d')!.getImageData(0,0,768,768);
   let top=768,bottom=0;for(let y=0;y<768;y++)for(let x=0;x<768;x++)if(data[(y*768+x)*4+3]>128){top=Math.min(top,y);bottom=Math.max(bottom,y)}
   return {top,bottom};
  });
  expect(pixels.top).toBeGreaterThan(25);expect(pixels.top).toBeLessThan(65);
  expect(pixels.bottom).toBeGreaterThan(720);expect(pixels.bottom).toBeLessThan(745);
  await page.screenshot({path:`test-results/original-${action}.png`,fullPage:true});
  await button.click();await expect(character).toHaveAttribute('data-action',action);
  await page.clock.runFor(3200);await expect(character).toHaveAttribute('data-action','idle');
 }
 await page.emulateMedia({reducedMotion:'reduce'});await button.click();await expect(character).toHaveAttribute('data-action','idle');
 await character.locator('.character-frames').evaluate(canvas=>canvas.dispatchEvent(new Event('contextlost',{cancelable:true})));
 await expect(character).toHaveAttribute('data-motion-ready','false');await expect(character.locator('img')).toBeVisible();
});

test('画布不可用时继续展示原图', async ({ page }) => {
 await page.addInitScript(()=>{
  const original=HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext=function(type:string,...args:unknown[]){if(type==='2d')return null;return Reflect.apply(original,this,[type,...args]);} as typeof original;
 });
 await page.goto('/');
 const character=page.locator('.companion .character-visual');
 await expect(character).toHaveAttribute('data-motion-ready','false');
 await expect.poll(()=>character.locator('img').evaluate(img=>(img as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
 await page.locator('.companion').click();await expect(character.locator('img')).toBeVisible();
 await expect(character).toHaveAttribute('data-action','idle');
});

test('男生整帧固定动作和回到站立',async({page,request})=>{
 await request.post('/api/outfit/unlock',{data:{outfitId:'lyn22'}});await request.post('/api/outfit',{data:{outfitId:'lyn22'}});
 await page.goto('/');const character=page.locator('.companion .character-visual');
 await expect(character).toHaveAttribute('data-motion-ready','true');await expect(character).toHaveAttribute('data-wave-ready','true');
 await expect(character.locator('img')).toHaveAttribute('src','/assets/characters/web-v1/lyn22.webp');
 await page.clock.install();await page.clock.pauseAt(new Date());
 for(const [choice,name,hold] of [[0,'wave',700],[.4,'blink',100],[.8,'wink',220]] as const){
  await page.evaluate(n=>{Math.random=()=>n;},choice);await page.locator('.companion').click();if(name==='wave'){await page.clock.runFor(180);await page.screenshot({path:'test-results/boy-wave-raising.png'});}await page.clock.runFor(name==='wave'?hold-180:hold);
  await expect(character).toHaveAttribute('data-action',name);
  await page.screenshot({path:`test-results/original-boy-${name}.png`,fullPage:true});
  await page.clock.runFor(3200);await expect(character).toHaveAttribute('data-action','idle');
 }
});

test('陪伴空间精简文案、天数和首页一致的右侧入口',async({page})=>{
 await page.goto('/');
 const home=await page.locator('.room-shortcuts').boundingBox();
 const homeButton=await page.locator('.room-shortcut').first().boundingBox();
 await page.getByRole('button',{name:/听歌充电/}).click();
 await page.goto('/#/more'); await page.getByRole('button',{name:'陪伴空间',exact:true}).click();
 await expect(page.getByText('两个人，一起慢慢喜欢')).toHaveCount(0);
 await expect(page.getByText('把日子，听成我们的歌')).toHaveCount(0);
 await expect(page.locator('.space-intro')).toHaveCount(0);
 const heading=await page.getByRole('heading',{name:'陪伴空间',exact:true}).boundingBox();
 const days=await page.locator('.space-days').boundingBox();expect(days!.y).toBeGreaterThan(heading!.y+heading!.height);
 const shortcuts=await page.locator('.space-shortcuts').boundingBox(), shortcut=await page.locator('.space-shortcuts button').first().boundingBox();
 expect(shortcuts!.x).toBeCloseTo(home!.x,1);expect(shortcut!.width).toBe(homeButton!.width);expect(shortcut!.height).toBe(homeButton!.height);
 await page.screenshot({path:'test-results/space-original-layout.png',fullPage:true});
 await page.getByRole('button',{name:'一起听歌单',exact:true}).click();await expect(page.getByRole('heading',{name:'一起听歌单',exact:true})).toBeVisible();
});
