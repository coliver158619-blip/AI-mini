import {expect,test} from '@playwright/test';
import {readdirSync} from 'node:fs';

test('趴姿素材覆盖所有音乐形象和装扮，按当前选择展示',async({page,request})=>{
 const ids=[...readdirSync('public/assets/music-images'),...readdirSync('public/assets/characters/web-v1')].map(n=>n.replace('.webp',''));
 expect(ids).toHaveLength(47);
 for(const id of ids)expect((await request.get(`/assets/report-companions/${id}.webp`)).ok(),id).toBe(true);
 let chosen='INTP';
 await page.route('**/api/bootstrap',async route=>{const r=await route.fetch(),data=await r.json();data.profile.appearanceMode=chosen.startsWith('zsh')||chosen.startsWith('lyn')?'outfit':'personality';data.profile.personalityId=chosen==='INTP'?'INTP':'ENFJ';data.profile.appearance={id:chosen,name:chosen,imageName:chosen+'.png',imageUrl:`/assets/report-companions/${chosen}.webp`};await route.fulfill({json:data})});
 for(const id of ['INTP','zsh09','lyn33']){chosen=id;await page.goto('/');await page.getByRole('button',{name:'更多玩法',exact:true}).click();await page.getByRole('button',{name:'音乐报告',exact:true}).click();
 const companion=page.locator('.report-companion');await expect(companion).toHaveAttribute('src',`/assets/report-companions/${id}.webp`);await expect.poll(()=>companion.evaluate((img:HTMLImageElement)=>img.complete&&img.naturalWidth>0)).toBe(true);
 await page.getByRole('tab',{name:'年报',exact:true}).click();await expect(page.locator('.report-year-card')).toBeVisible();
 await page.screenshot({path:`output/report-${id}-${test.info().project.name}.png`,fullPage:true,animations:'disabled'});
 }
});

for(const width of [320,393,768])test(`报告 ${width}px 排版、数字与周期交互`,async({page,request})=>{
 await page.setViewportSize({width,height:852});await page.goto('/');await page.getByRole('button',{name:'更多玩法',exact:true}).click();await page.getByRole('button',{name:'音乐报告',exact:true}).click();
 for(const [label,period]of [['周报','week'],['月报','month'],['年报','year']]as const){await page.getByRole('tab',{name:label,exact:true}).click();await expect(page.locator('.report-content')).toBeVisible();await expect(page.locator('.report-loading')).toHaveCount(0);
 const box=await page.locator('.report-companion').boundingBox(),card=await page.locator('.report-card').first().boundingBox(),title=await page.locator('.report-intro>div').boundingBox();
 expect(Math.abs(box!.y+box!.height-card!.y)).toBeLessThan(3);expect(box!.x).toBeGreaterThanOrEqual(title!.x+title!.width-8);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 if(period==='year'){const data=await(await request.get('/api/reports?period=year&offset=0')).json();await expect(page.locator('.report-main-number>strong')).toHaveText(Math.floor(data.summary.minutes/60).toLocaleString('zh-CN'));const face=page.locator('.report-trend-point').last();await face.click();await expect(face).toHaveAttribute('aria-pressed','true');await expect(page.locator('.report-trend-caption [role=status]')).toContainText('分钟');expect(await page.locator('.report-main-number>strong').evaluate(e=>getComputedStyle(e).backgroundImage)).toContain('linear-gradient');}
 await page.screenshot({path:`output/report-${period}-${width}-${test.info().project.name}.png`,fullPage:true,animations:'disabled'});
 }
 await page.getByRole('button',{name:'选择报告日期',exact:true}).click();await expect(page.getByLabel('报告日期',{exact:true})).toBeVisible();await page.getByRole('button',{name:'关闭',exact:true}).click();
 await page.getByRole('button',{name:'上一年',exact:true}).click();await expect(page.locator('.report-date-nav')).toContainText('2025年');
});
