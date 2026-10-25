import {test,expect} from '@playwright/test';
for(const id of ['zsh09','lyn22'])test(`greeting frame preview ${id}`,async({page,request})=>{
 await request.post('/api/outfit/unlock',{data:{outfitId:id}});await request.post('/api/outfit',{data:{outfitId:id}});
 await page.goto('/');const c=page.locator('.companion .character-visual');await expect(c).toHaveAttribute('data-wave-ready','true');
 await page.clock.install();await page.clock.pauseAt(new Date());await page.evaluate(()=>{Math.random=()=>0});await page.locator('.companion').click();
 const rest=await c.boundingBox();let previous=0;for(const elapsed of [0,160,320,640,1000,1300,1800,2200]){
  await page.clock.runFor(elapsed-previous);previous=elapsed;expect(await c.boundingBox()).toEqual(rest);
  await c.locator('.character-frames').screenshot({path:`test-results/greeting-${id}-${elapsed}.png`});
 }
 await page.clock.runFor(100);await expect(c).toHaveAttribute('data-action','idle');
});
