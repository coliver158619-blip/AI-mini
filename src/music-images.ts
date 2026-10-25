import type {Personality, Profile} from './types';
import catalog from '../shared/music-images.json';
export const musicImageGroups = catalog.groups;
// Stable IDs preserve saved selections and the native widget image-name API.
export const musicImages: (Personality & {englishName:string})[] = catalog.images.map(item=>{
 const group=musicImageGroups.find(g=>g.id===item.groupId)!;
 return {...item,gender:item.gender as 'male'|'female',groupName:group.name,color:group.color,accent:group.accent,musicStyles:[item.name,item.englishName],companionship:item.description};
});
export function withMusicImage(profile:Profile):Profile {
 const personality=musicImages.find(image=>image.id===profile.personalityId);
 if(!personality)return profile;
 return {...profile,personality,appearance:profile.appearanceMode==='personality'?{id:personality.id,name:personality.name,imageName:personality.imageName,imageUrl:personality.imageUrl}:profile.appearance};
}
