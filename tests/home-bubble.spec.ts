import { test, expect } from '@playwright/test';
import { greetingPeriod } from '../src/home-greetings';

test('time boundaries use the current hour', () => {
 for (const [hour, period] of [[4,'late'],[5,'morning'],[10,'morning'],[11,'noon'],[14,'afternoon'],[18,'evening'],[23,'late']] as const)
  expect(greetingPeriod(new Date(2026, 9, 27, hour))).toBe(period);
});

test('greetings vary without recent repeats; only every third tap shows a playable song', async ({page}) => {
 await page.clock.setFixedTime(new Date('2026-10-27T09:00:00+08:00'));
 await page.route('**/api/bootstrap', async route => {
  const data = await (await route.fetch()).json();
  await route.fulfill({json:{...data,integration:{configured:true,state:'connected'}}});
 });
 await page.route('**/api/recommendations/hourly', route => route.fulfill({json:{songs:[{id:'sunny-window',title:'窗边的阳光',artist:'音乐搭子',tags:[]}],pending:false,createdAt:'2026-10-27T09:00:00+08:00',nextAt:'2026-10-27T10:00:00+08:00',source:'kugou'}}));
 await page.goto('/');
 await expect(page.locator('.bubble-copy')).not.toBeEmpty();
 const initialText = await page.locator('.bubble-copy').innerText();
 await page.waitForResponse('**/api/recommendations/hourly');
 await expect(page.locator('.bubble-copy')).toHaveText(initialText);
 await expect(page.locator('.bubble-caption')).toHaveCount(0);
 await expect(page.locator('.hourly-song')).toHaveCount(0);
 const before = await page.locator('.companion').boundingBox();
 const recent = [initialText];
 for(let tap = 1; tap <= 9; tap++) {
  await page.locator('.companion').click();
  const text = await page.locator('.bubble-copy').innerText();
  expect(recent.slice(-6)).not.toContain(text);
  recent.push(text);
  await expect(page.locator('.hourly-song')).toHaveCount(tap % 3 === 0 ? 1 : 0);
  expect(await page.locator('.companion').boundingBox()).toEqual(before);
 }
 await expect(page.locator('.hourly-song-main')).toBeEnabled();
 await expect(page.locator('.hourly-song-heart')).toBeEnabled();
 await page.clock.setFixedTime(new Date('2026-10-27T20:00:00+08:00'));
 await page.locator('.companion').click();
 await expect(page.locator('.bubble-copy')).toContainText(/晚上|今晚|今天|回到这里|见到你/);
 expect(recent).not.toContain(await page.locator('.bubble-copy').innerText());
 await expect(page.locator('.hourly-song')).toHaveCount(0);
});

for (const size of [{width:320,height:568},{width:393,height:740},{width:844,height:390},{width:1440,height:900},{width:1920,height:500}]) {
 test(`bubble points to the head without covering surrounding controls ${size.width}`, async ({page,request}) => {
  await request.post('/api/outfit',{data:{outfitId:'zsh09'}});
  await page.setViewportSize(size);
  await page.goto('/');
  await expect(page.locator('.companion')).toBeVisible();
  for(let tap = 0; tap < 3; tap++) await page.locator('.companion').click();
  await expect(page.locator('.hourly-song')).toBeVisible();
  const layout = await page.evaluate(() => {
   const bubble = document.querySelector('.speech-bubble')!.getBoundingClientRect();
   const rect = (selector: string) => document.querySelector(selector)!.getBoundingClientRect();
   const overlaps = (r: DOMRect) => Math.min(bubble.right,r.right)>Math.max(bubble.left,r.left)&&Math.min(bubble.bottom,r.bottom)>Math.max(bubble.top,r.top);
   const person=rect('.companion .character-visual');
   const anchor=document.querySelector('.bubble-tip-anchor') as SVGCircleElement;
   const point=new DOMPoint(anchor.cx.baseVal.value,anchor.cy.baseVal.value).matrixTransform(anchor.getScreenCTM()!);
   const side=document.querySelector('.speech-bubble')!.getAttribute('data-tail-side');
   return { weather:overlaps(rect('.weather-pill')), shortcuts:overlaps(rect('.room-shortcuts')), scroll:document.documentElement.scrollHeight>innerHeight+1, width:document.documentElement.scrollWidth>innerWidth,
    aligned:side==='bottom'?Math.abs(point.x-person.left-person.width/2)<1:point.x<person.left+person.width/2,
    gap:side==='bottom'?person.top-point.y:(person.left+person.width/2-person.height*.25)-point.x };
  });
  await page.screenshot({path:`output/home-bubble-${size.width}.png`,animations:'disabled'});
  expect(layout).toMatchObject({weather:false,shortcuts:false,scroll:false,width:false,aligned:true});
  expect(layout.gap).toBeGreaterThanOrEqual(6);
  expect(layout.gap).toBeLessThanOrEqual(12);
 });
}

test('outfit and music selection update the border and emphasis color',async({page,request})=>{
 await request.post('/api/outfit',{data:{outfitId:'zsh09'}});
 await page.goto('/');await expect(page.locator('.bubble-emphasis')).toBeVisible();
 const ink=()=>page.locator('.speech-bubble').evaluate(el=>getComputedStyle(el).getPropertyValue('--bubble-ink'));
 const initial=await ink();
 await request.post('/api/outfit',{data:{outfitId:'zsh12'}});
 await page.reload();await expect.poll(ink).not.toBe(initial);
 const blue=await ink();
 await request.post('/api/personality',{data:{personalityId:'ENTJ'}});
 await page.reload();await expect.poll(ink).not.toBe(blue);
 expect(await page.locator('.bubble-emphasis path').evaluate(el=>getComputedStyle(el).fill)).toBe(await page.locator('.bubble-outline path').first().evaluate(el=>getComputedStyle(el).stroke));
});
