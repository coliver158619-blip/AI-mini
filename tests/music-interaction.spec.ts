import {expect,test} from '@playwright/test';
import {musicImages} from '../src/music-images';

test('16 个形象的预览、静态回退和缩略卡片按人物主体居中',async({page})=>{
 await page.goto('/#/personality');
 for(const width of [320,390,844]){
  await page.setViewportSize({width,height:844});
  for(const image of musicImages){
   await page.getByRole('button',{name:`查看 ${image.name}`,exact:true}).click();
   const character=page.locator('.personality-stage .character-visual');
   await expect(character).toHaveAttribute('data-motion-ready','true');
   const offsets=await page.evaluate(id=>{
    const headOffset=(element:HTMLImageElement|HTMLCanvasElement,container:Element)=>{
     const w=element instanceof HTMLImageElement?element.naturalWidth:element.width,h=element instanceof HTMLImageElement?element.naturalHeight:element.height;
     const c=document.createElement('canvas');c.width=w;c.height=h;const ctx=c.getContext('2d')!;ctx.drawImage(element,0,0);const p=ctx.getImageData(0,0,w,h).data;
     let top=h,bottom=0,left=w,right=0;
     for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(p[(y*w+x)*4+3]>128){top=Math.min(top,y);bottom=Math.max(bottom,y)}
     for(let y=top;y<top+(bottom-top)*.32;y++)for(let x=0;x<w;x++)if(p[(y*w+x)*4+3]>128){left=Math.min(left,x);right=Math.max(right,x)}
     const r=element.getBoundingClientRect(),card=container.getBoundingClientRect(),scale=Math.min(r.width/w,r.height/h);
     return r.x+(r.width-w*scale)/2+(left+right+1)/2*scale-(card.x+card.width/2);
    };
    const stage=document.querySelector('.personality-stage')!,tile=document.querySelector(`.personality-tile-art [data-character="${id}"]`)!;
    return [headOffset(stage.querySelector('canvas')!,stage),headOffset(stage.querySelector('img')!,stage),headOffset(tile.querySelector('img')!,tile)];
   },image.id);
   for(const offset of offsets)expect(Math.abs(offset),`${image.id} width=${width} offsets=${offsets}`).toBeLessThan(1.5);
  }
 }
 await page.setViewportSize({width:390,height:844});await page.getByRole('button',{name:'查看 摇滚',exact:true}).click();
 await page.locator('.personality-header').scrollIntoViewIfNeeded();
 await page.screenshot({path:`output/music-centered-${test.info().project.name}.png`,fullPage:true});
});

test('客户端链接冷启动、刷新、浏览器前后退和未知路由',async({page})=>{
 await page.goto('/#/companion-space');await expect(page.getByRole('heading',{name:'陪伴空间',exact:true})).toBeVisible();
 await page.reload();await expect(page.getByRole('heading',{name:'陪伴空间',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'共享日记',exact:true}).click();await expect(page).toHaveURL(/#\/shared-diary$/);
 await page.goBack();await expect(page.getByRole('heading',{name:'陪伴空间',exact:true})).toBeVisible();
 await page.goForward();await expect(page).toHaveURL(/#\/shared-diary$/);
 await page.goto('/#/invalid');await expect(page.getByRole('button',{name:'更多玩法',exact:true})).toBeVisible();
});

test('音乐形象文字颜色一致，预览支持打招呼',async({page})=>{
 await page.goto('/#/personality');await page.getByRole('button',{name:'查看 摇滚',exact:true}).click();
 for(const selector of ['.personality-footer>button','.personality-details h3','.personality-details p','.personality-filters button','.personality-grid strong','.personality-grid small'])for(const el of await page.locator(selector).all())expect(await el.evaluate(e=>getComputedStyle(e).color)).toBe('rgb(48, 48, 57)');
 const character=page.locator('.personality-stage .character-visual');await expect(character).toHaveAttribute('data-motion-ready','true');
 await page.clock.install();await page.clock.pauseAt(new Date());await page.evaluate(()=>{Math.random=()=>0});await page.getByRole('button',{name:'和摇滚打招呼',exact:true}).click();await page.clock.runFor(900);await expect(character).toHaveAttribute('data-action','wave');
 await page.screenshot({path:`output/music-interaction-preview-${test.info().project.name}.png`,fullPage:true});
});

for(const image of musicImages)test(`${image.id} 首页三种动作完整显示且尺寸固定`,async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/api/bootstrap',async route=>{const data=await(await route.fetch()).json();data.profile.appearanceMode='personality';data.profile.personalityId=image.id;await route.fulfill({json:data})});
 await page.goto('/');const c=page.locator('.companion .character-visual');await expect(c).toHaveAttribute('data-character',image.id);await expect(c).toHaveAttribute('data-motion-ready','true');const box=await c.boundingBox();
 await page.clock.install();await page.clock.pauseAt(new Date());
 for(const [random,action,duration]of [[0,'wave',2240],[.4,'blink',400],[.8,'wink',650]]as const){
  await page.evaluate(n=>{Math.random=()=>n},random);await page.locator('.companion').click();await page.clock.runFor(duration*.55);await expect(c).toHaveAttribute('data-action',action);
  const pixels=await c.locator('canvas').evaluate((canvas:HTMLCanvasElement)=>{const data=canvas.getContext('2d')!.getImageData(0,0,canvas.width,canvas.height).data;let count=0,top=canvas.height,bottom=0;for(let y=0;y<canvas.height;y++)for(let x=0;x<canvas.width;x++)if(data[(y*canvas.width+x)*4+3]>128){count++;top=Math.min(top,y);bottom=Math.max(bottom,y)}return{count,height:bottom-top}});
  expect(pixels.count).toBeGreaterThan(60000);expect(pixels.height).toBeGreaterThan(780);expect(await c.boundingBox()).toEqual(box);
  await page.clock.runFor(duration+100);await expect(c).toHaveAttribute('data-action','idle');
 }
 expect(errors).toEqual([]);
});
