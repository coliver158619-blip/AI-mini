import {useEffect,useState} from 'react';
import {api} from './api';
import type {Profile} from './types';
import {relationshipPreview} from './relationship-preview';
type SharedEntry={date:string;note:string;body:string};
type TogetherSong={seconds:number;playCount:number};
export function pairSpark(songs:TogetherSong[],entries:SharedEntry[]){
 const minutes=Math.floor(songs.reduce((sum,song)=>sum+song.seconds,0)/60);
 const diaries=new Set(entries.filter(entry=>entry.note.trim()||entry.body.trim()).map(entry=>entry.date)).size;
 const value=minutes+diaries*10;
 return {value,minutes,diaries,songs:songs.length,next:(Math.floor(value/100)+1)*100};
}
export function usePairSpark(profile:Profile){
 const [data,setData]=useState<ReturnType<typeof pairSpark>|null>(relationshipPreview?.spark ?? null),[error,setError]=useState(''),[attempt,setAttempt]=useState(0);
 useEffect(()=>{if(relationshipPreview)return;const controller=new AbortController();setError('');
  Promise.all([api<{songs:TogetherSong[]}>('/api/together/playlist',{signal:controller.signal}),api<{entries:SharedEntry[]}>('/api/shared-diary',{signal:controller.signal})])
   .then(([songs,diary])=>{if(!controller.signal.aborted)setData(pairSpark(songs.songs,diary.entries))})
   .catch(cause=>{if(!controller.signal.aborted)setError(cause instanceof Error?cause.message:'暂时没能打开，请再试一次')});
  return()=>controller.abort();
 },[attempt,profile]);
 return {data,error,retry:()=>setAttempt(value=>value+1)};
}
