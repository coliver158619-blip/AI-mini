import type {Personality, Profile} from './types';

export const musicImageGroups = [
 {id:'gentle',name:'温柔旋律',color:'#e4efdf',accent:'#769563'},
 {id:'rhythm',name:'律动现场',color:'#ffead3',accent:'#c88b44'},
 {id:'creative',name:'灵感声场',color:'#eee3fb',accent:'#9470bd'},
 {id:'quiet',name:'静心时光',color:'#e1eef8',accent:'#6f96b5'},
];
// Stable IDs retain saved selections and the native image-name API.
// Display order follows the supplied image, row by row.
const settings = [
 ['ENFJ','灵魂乐','Soul','gentle','拿起麦克风，把温暖唱进每个人心里。','温暖,醇厚,共鸣'],
 ['ENFP','独立民谣','Indie Folk','gentle','背上行囊，在风和树叶里寻找下一段旋律。','自由,清新,旅行'],
 ['ENTJ','摇滚','Rock','rhythm','紫色电吉他一响，让今天的热爱尽情发声。','吉他,热烈,力量'],
 ['ENTP','R&B','Rhythm & Blues','rhythm','跟着松弛的节拍，把日常唱得柔软又有律动。','律动,松弛,丝滑'],
 ['ESFJ','甜系流行','Sweet Pop','gentle','像一口草莓蛋糕，让轻快旋律甜进心里。','甜美,轻快,明亮'],
 ['ESFP','流行舞曲','Dance Pop','rhythm','麦克风交给我，快乐的节拍交给你。','舞台,活力,欢快'],
 ['ESTJ','古典','Classical','quiet','挥动指挥棒，让细腻的旋律有序展开。','管弦,优雅,层次'],
 ['ESTP','Hip-Hop','Hip-Hop','rhythm','戴好棒球帽，踩上滑板，跟鼓点自在出发。','街头,说唱,节拍'],
 ['INFJ','Lo-fi','Lo-fi','quiet','翻开书，给专注的时光配一点柔和底噪。','低保真,专注,慵懒'],
 ['INFP','梦幻流行','Dream Pop','gentle','蝴蝶轻轻停下，旋律也变得轻盈而朦胧。','梦幻,空灵,温柔'],
 ['INTJ','电子','Electronic','creative','在合成器与声波之间，发现未来的声音。','合成器,未来,探索'],
 ['INTP','爵士','Jazz','creative','给灵感留一点即兴，让音符自在交谈。','即兴,摇摆,细腻'],
 ['ISFJ','轻音乐','Easy Listening','quiet','用一段舒缓旋律，照顾今天的小小疲惫。','舒缓,安心,陪伴'],
 ['ISFP','独立流行','Indie Pop','creative','拿起调色盘，把今天的颜色写进歌里。','创意,色彩,个性'],
 ['ISTJ','氛围音乐','Ambient','quiet','把声音轻轻铺开，留一片安静思考的空间。','氛围,沉静,留白'],
 ['ISTP','原声民谣','Acoustic Folk','creative','抱起木吉他，用最质朴的声音陪你聊聊。','原声,木吉他,质朴'],
];
export const musicImages: (Personality & {englishName:string})[] = settings.map(([id,name,englishName,groupId,description,traits])=>{
 const group=musicImageGroups.find(g=>g.id===groupId)!;
 return {id,name,englishName,groupId,groupName:group.name,color:group.color,accent:group.accent,description,traits:traits.split(','),musicStyles:[name,englishName],companionship:description,imageName:`${id}.png`,imageUrl:`/assets/music-images/${id}.webp`};
});

export function withMusicImage(profile:Profile):Profile {
 const personality=musicImages.find(image=>image.id===profile.personalityId);
 if(!personality)return profile;
 return {...profile,personality,appearance:profile.appearanceMode==='personality'?{id:personality.id,name:personality.name,imageName:personality.imageName,imageUrl:personality.imageUrl}:profile.appearance};
}
