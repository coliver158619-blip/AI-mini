import {test,expect} from '@playwright/test';

test('礼盒需主动领取，取消保留晃动，失败重试，刷新和明星独立保存',async({page,context})=>{
 await context.request.post('/api/auth/login',{data:{nickname:`礼盒${Date.now().toString(36)}`,gender:'female'}});
 await context.request.post('/api/auth/complete');
 await page.goto('/#/spark');
 const first=page.locator('.charge-milestone').first(),dialog=page.getByRole('dialog');
 await expect(first).toHaveClass(/is-ready/);
 await expect(first.locator('.gift-lid')).toHaveCSS('transform','none');
 await expect(first.locator('button>svg')).toHaveCSS('animation-name','gift-ready-wiggle');
 await expect(dialog).toHaveCount(0);
 await expect(page.locator('.charge-milestone').nth(1).getByRole('button')).toHaveAttribute('aria-disabled','true');
 await first.getByRole('button').click();
 await expect(dialog).toContainText('初次见面');
 await dialog.getByRole('button',{name:'返回听歌充电'}).click();
 await expect(first).toHaveClass(/is-ready/);
 await first.getByRole('button').click();
 await page.route('**/api/charge/rewards/total',route=>route.request().method()==='POST'?route.fulfill({status:503,json:{error:'暂时无法领取，请重试'}}):route.continue());
 await dialog.getByRole('button',{name:'收下这份惊喜',exact:true}).click();
 await expect(dialog.getByRole('alert')).toContainText('暂时无法领取');
 await expect(first).not.toHaveClass(/is-opened/);
 await page.unroute('**/api/charge/rewards/total');
 await dialog.getByRole('button',{name:'重播动画'}).click();
 await expect(dialog.locator('.unlock-lid')).toBeVisible();
 await dialog.getByRole('button',{name:'收下这份惊喜',exact:true}).click();
 await expect(dialog).toHaveCount(0);await expect(first).toHaveClass(/is-opened/);
 await expect(first).not.toHaveClass(/is-ready/);
 await page.reload();await expect(first).toHaveClass(/is-opened/);
 await first.getByRole('button').click();await expect(dialog.getByRole('button',{name:'已收下，返回'})).toBeVisible();
 await dialog.getByRole('button',{name:'重播动画'}).click();await dialog.getByRole('button',{name:'已收下，返回'}).click();
 await page.getByRole('button',{name:'电量值，点击切换明星电量值'}).click();
 await expect(first).toHaveClass(/is-ready/);
 await first.getByRole('button').click();await dialog.getByRole('button',{name:'收下这份惊喜',exact:true}).click();
 await expect(first).toHaveClass(/is-opened/);
 await page.getByRole('listbox').press('ArrowDown');await expect(page.locator('.spark-hero h2')).toContainText('薛之谦');
 await expect(first).toHaveClass(/is-ready/);
 await page.getByRole('listbox').press('Home');await expect(first).toHaveClass(/is-opened/);
 await context.request.post('/api/auth/login',{data:{nickname:`另一个礼盒${Date.now().toString(36)}`,gender:'male'}});
 await context.request.post('/api/auth/complete');await page.reload();
 await expect(first).toHaveClass(/is-ready/);
});

test('四阶段达标不自动弹窗，领取画面、重播与宽窄屏',async({page,context})=>{
 await context.request.post('/api/auth/login',{data:{nickname:`四阶段${Date.now().toString(36)}`,gender:'female'}});
 await context.request.post('/api/auth/complete');
 let energy=0;
 await page.route('**/api/bootstrap',async route=>{const r=await(await route.fetch()).json();r.profile.energy=energy;await route.fulfill({json:r})});
 await page.goto('/#/spark');
 await expect(page.locator('.charge-milestone.is-ready')).toHaveCount(1);
 energy=1600;await page.goto('/#/more');await page.goto('/#/spark');await page.reload();
 await expect(page.locator('.charge-milestone.is-ready')).toHaveCount(4);
 await expect(page.getByRole('dialog')).toHaveCount(0);
 const names=['初次见面','渐渐熟悉','默契搭子','心有灵犀'];
 for(let i=0;i<4;i++){
  await page.setViewportSize({width:393,height:852});
  await page.locator('.charge-milestone').nth(i).getByRole('button').click();
  const dialog=page.getByRole('dialog');await expect(dialog.getByRole('heading',{name:names[i],exact:true})).toBeVisible();
  await expect(dialog).toContainText(i===1?'一天免费会员':i===3?'全套换装':'人物换装');
  await expect.poll(()=>dialog.locator('.unlock-lid').evaluate(el=>el.getAnimations().every(a=>a.playState==='finished'))).toBe(true);
  await dialog.screenshot({path:`output/gift-stage-${i}-${test.info().project.name}.png`});
  for(const width of [320,844,1440]){
   await page.setViewportSize({width,height:852});
   expect(await dialog.evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
   await expect(dialog.getByRole('button',{name:'收下这份惊喜',exact:true})).toBeVisible();
  }
  await dialog.getByRole('button',{name:'重播动画'}).click();
  await expect.poll(()=>dialog.locator('.unlock-lid').evaluate(el=>el.getAnimations().some(a=>a.playState==='running'))).toBe(true);
  await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);
 }
 await expect(page.locator('.charge-milestone.is-ready')).toHaveCount(4);
 await page.emulateMedia({reducedMotion:'reduce'});
 await expect(page.locator('.charge-milestone.is-ready button>svg').first()).toHaveCSS('animation-name','none');
});
