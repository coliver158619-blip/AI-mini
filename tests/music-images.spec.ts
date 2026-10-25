import {expect,test} from '@playwright/test';

test('more 玻璃入口下方排列日记和收藏，字体成功加载',async({page})=>{
 await page.goto('/');
 const more=page.getByRole('button',{name:'更多玩法',exact:true});await expect(more).toHaveText('more');
 const m=(await more.boundingBox())!,d=(await page.getByRole('button',{name:'日记',exact:true}).boundingBox())!,f=(await page.getByRole('button',{name:'收藏',exact:true}).boundingBox())!;
 expect(d.x).toBeCloseTo(m.x,0);expect(d.y-m.y-m.height).toBeCloseTo(14,0);expect(f.x).toEqual(d.x);expect(f.y).toBeGreaterThan(d.y+d.height);
 expect(await more.evaluate(el=>getComputedStyle(el).backdropFilter)).toContain('blur');
 await page.screenshot({path:`output/music-home-${test.info().project.name}.png`,animations:'disabled'});
 await page.getByRole('button',{name:'日记',exact:true}).click();
 await expect(page.getByRole('heading',{name:'我的音乐日记'})).toBeVisible();
 await page.evaluate(()=>document.fonts.load('16px "Momo Handwriting"','今天一起听歌'));
 expect(await page.evaluate(()=>document.fonts.check('16px "Momo Handwriting"','今天一起听歌'))).toBe(true);
 expect(await page.locator('.diary-screen').evaluate(el=>getComputedStyle(el).fontFamily)).toContain('Momo Handwriting');
 await page.screenshot({path:`output/music-diary-${test.info().project.name}.png`,fullPage:true,animations:'disabled'});
});

test('曲风顺序与十六个新素材对应，不显示 MBTI 文案',async({page})=>{
 await page.goto('/');await page.getByRole('button',{name:'更多玩法',exact:true}).click();await page.getByRole('button',{name:'音乐形象',exact:true}).click();
 await expect(page.locator('.personality-grid button')).toHaveCount(16);
 await expect(page.locator('.personality-grid button>strong')).toHaveText(['灵魂乐','独立民谣','摇滚','R&B','甜系流行','流行舞曲','古典','Hip-Hop','Lo-fi','梦幻流行','电子','爵士','轻音乐','独立流行','氛围音乐','原声民谣']);
 expect(await page.locator('.personality-page').innerText()).not.toMatch(/INTJ|INFP|音乐人格|16 型/);
 const urls=await page.locator('.personality-grid img').evaluateAll(imgs=>imgs.map(img=>(img as HTMLImageElement).src));expect(new Set(urls).size).toBe(16);
 for(const img of await page.locator('.personality-grid img').all())await expect.poll(()=>img.evaluate((el:HTMLImageElement)=>el.complete&&el.naturalWidth>0)).toBe(true);
 await page.screenshot({path:`output/music-catalog-${test.info().project.name}.png`,fullPage:true,animations:'disabled'});
});
