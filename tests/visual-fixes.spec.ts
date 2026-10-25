import {expect,test} from '@playwright/test';

const weather={city:'广州市',condition:'阴天',temperature:26,code:3,cached:true,greeting:'嗨，我在呢。今天有什么想和我分享的？',updatedAt:new Date().toISOString()};
test('换装后首页和聊天头像同步，右侧快捷入口保持竖排',async({page,request})=>{
 await request.post('/api/outfit',{data:{outfitId:'zsh12'}});
 await page.goto('/');
 await expect(page.locator('.streak-avatar img')).toHaveAttribute('src',/zsh12/);
 const buttons=page.locator('.room-shortcuts .room-shortcut');
 const first=(await buttons.nth(0).boundingBox())!,second=(await buttons.nth(1).boundingBox())!;
 expect(first.x).toEqual(second.x);expect(first.y+first.height).toBeLessThan(second.y);
 await page.getByRole('button',{name:'和音乐搭子聊天',exact:true}).click();
 await expect(page.locator('.message-avatar img').first()).toHaveAttribute('src',/zsh12/);
 await page.screenshot({path:`output/chat-avatar-${test.info().project.name}.png`});
});

for(const width of [320,393])for(const mode of ['mood','personal'])test(`${mode}参考布局与交互 ${width}`,async({page})=>{
 await page.setViewportSize({width,height:852});
 const songs=(mode==='personal'?[['下完这场雨','后弦'],['赤道和北极','卢西'],['喜欢你','G.E.M.邓紫棋']]:[['此情可待','纯音乐'],['Mystery of Love','Luke Pickman']]).map(([title,artist],i)=>({id:`reference-${i}`,title,artist,color:'#ddd',tags:[]}));
 await page.route('**/api/bootstrap',async route=>{const data=await(await route.fetch()).json();await route.fulfill({json:{...data,weather}})});
 await page.route('**/api/recommendations?*',route=>route.fulfill({json:{songs,source:'kugou',context:{scene:mode==='mood'?'放松一下':'',weather}}}));
 let changed=false;
 await page.route('**/api/recommendations',async route=>{changed=true;await route.fulfill({json:{songs,source:'kugou',context:{weather}}})});
 await page.goto('/');await page.getByRole('button',{name:'更多玩法',exact:true}).click();
 await page.getByRole('button',{name:mode==='mood'?'心情选歌':'为你推荐',exact:true}).click();
 await expect(page.locator('.recommendation-song')).toHaveCount(songs.length);
 const header=(await page.locator('.recommendation-header h1').boundingBox())!;expect(header.x+header.width/2).toBeCloseTo(width/2,0);
 for(const card of await page.locator('.recommendation-song').all()){
  const cover=(await card.locator('.recommendation-cover').boundingBox())!,actions=(await card.locator('.recommendation-song-actions').boundingBox())!;
  expect(Math.abs(cover.y+cover.height/2-actions.y-actions.height/2)).toBeLessThan(2);
  expect(actions.x+actions.width).toBeLessThanOrEqual(width-16);
 }
 if(mode==='mood'){
  await expect(page.locator('.recommendation-moods button')).toHaveCount(5);
  await expect(page.locator('.mood-selected')).toBeVisible();
  await page.getByRole('button',{name:'开心加倍',exact:true}).click();
  await expect(page.getByRole('button',{name:'开心加倍',exact:true})).toHaveAttribute('aria-pressed','true');
 }else await page.getByRole('button',{name:'换一换',exact:true}).click();
 expect(changed).toBe(true);
 await page.screenshot({path:`output/reference-${mode}-${width}-${test.info().project.name}.png`,fullPage:true});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
