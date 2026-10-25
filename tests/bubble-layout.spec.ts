import {test,expect} from '@playwright/test';
for(const size of [{width:393,height:852,top:59,bottom:34},{width:320,height:568,top:20,bottom:0},{width:844,height:390,top:0,bottom:21},{width:1440,height:900,top:0,bottom:0}])test(`完整对话、歌曲与固定人物 ${size.width}`,async({page})=>{
 await page.setViewportSize(size);
 await page.route('**/api/bootstrap',async route=>{const data=await(await route.fetch()).json();await route.fulfill({json:{...data,integration:{configured:true,state:'connected'}}})});
 await page.route('**/api/recommendations/hourly',route=>route.fulfill({json:{songs:[{id:'preview',title:'最长的电影',artist:'周杰伦',tags:[],color:'#e4af63'}],pending:false,createdAt:new Date().toISOString(),nextAt:new Date(Date.now()+3600000).toISOString(),source:'kugou'}}));
 await page.goto('/');
 await page.evaluate(({top,bottom})=>{document.documentElement.style.setProperty('--safe-top',`${top}px`);document.documentElement.style.setProperty('--safe-bottom',`${bottom}px`)},size);
 await expect(page.locator('.hourly-song')).toBeVisible();
 const before=await page.locator('.companion').boundingBox();
 await page.locator('.bubble-copy').evaluate(el=>el.textContent='上次记录（10月24日20:48）广州市是阴天。天气可能已经变化，刷新后我再为你挑歌；现在也可以告诉我，你想听什么样的音乐？');
 expect(await page.locator('.companion').boundingBox()).toEqual(before);
 expect(await page.locator('.speech-bubble').evaluate(el=>getComputedStyle(el).overflowY==='visible'&&el.querySelector('.hourly-song')!.getBoundingClientRect().bottom<=el.getBoundingClientRect().bottom)).toBe(true);
 expect(await page.evaluate(()=>document.documentElement.scrollHeight<=innerHeight+1&&document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 console.log(size.width,await page.evaluate(()=>Object.fromEntries(['.speech-bubble','.companion','.companion-caption'].map(s=>{const r=document.querySelector(s)!.getBoundingClientRect();return[s,{x:r.x,y:r.y,w:r.width,h:r.height}]}))));
 await page.screenshot({path:`test-results/bubble-layout-${size.width}.png`,fullPage:true,animations:'disabled'});
});
