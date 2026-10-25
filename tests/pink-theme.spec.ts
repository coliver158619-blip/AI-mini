import { test, expect } from '@playwright/test';

test('火花天数与陪伴天数一致，整套页面视觉预览',async({page,request})=>{
 test.setTimeout(90000);
 await request.post('/api/outfit',{data:{outfitId:'zsh09'}});
 await page.route('**/api/bootstrap',async route=>{
  const data=await(await route.fetch()).json();data.profile.days=161;data.profile.streak=0;
  data.weather={city:'广州市',condition:'阴天',code:3,temperature:26,greeting:'今天也想陪你听一首喜欢的歌。',updatedAt:new Date().toISOString(),cached:true};
  await route.fulfill({json:data});
 });
 await page.route('**/api/recommendations?*',route=>route.fulfill({json:{source:'kugou',context:{scene:'放松一下'},songs:[{id:'test1',title:'此情可待',artist:'纯音乐',tags:[]},{id:'test2',title:'Mystery of Love',artist:'Luke Pickman',tags:[]}]}}));
 await page.goto('/');
 await expect(page.locator('.streak-count b')).toHaveText('161');
 await expect(page.locator('.companion-caption b')).toHaveText('161');
 await expect(page.getByRole('button',{name:'听歌续火花，已陪伴 161 天'})).toBeVisible();
 await expect(page.locator('.companion .character-visual')).toHaveAttribute('data-motion-ready','true');
 const capture=async(name:string)=>{await page.waitForTimeout(400);await page.screenshot({path:`test-results/pink-${name}.png`,fullPage:true,animations:'disabled'});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy()};
 await capture('home');
 await page.getByRole('button',{name:/听歌续火花/}).click();await capture('spark');
 await page.getByRole('button',{name:'进入陪伴空间',exact:true}).click();await capture('space');
 await page.getByRole('button',{name:'共享日记',exact:true}).click();await page.locator('.shared-experience textarea').waitFor();await capture('shared-diary');
 await page.goto('/');await page.getByRole('button',{name:'日记',exact:true}).click();await page.locator('.diary-book').waitFor();await capture('diary');
 await page.goto('/');await page.getByRole('button',{name:'更多玩法',exact:true}).click();await capture('more');
 for(const [name,selector,file] of [['形象','.wardrobe-grid','wardrobe'],['音乐人格','.personality-grid','personality'],['音乐报告','.report-content','reports'],['心情选歌','.recommendation-moods','mood'],['为你推荐','.recommendation-page','recommendations']] as const){
  await page.getByRole('button',{name,exact:true}).click();await page.locator(selector).waitFor();await capture(file);
  await page.goto('/');await page.getByRole('button',{name:'更多玩法',exact:true}).click();
 }
 await page.getByRole('button',{name:'AI聊天',exact:true}).click();await capture('chat');
});
