import { useEffect, useState } from 'react';
import { ChevronLeft, Disc3, Headphones, LoaderCircle, Pause, Play } from 'lucide-react';
import { api } from './api';
import type { Song } from './types';
import './diary.css';
import './shared-space.css';

type HeardSong = Song & { seconds: number; playCount: number; lastListenedAt: string };
export default function TogetherPlaylist({ onBack, onPlay, playingId }: { onBack: () => void; onPlay: (song: Song) => void; playingId?: string }) {
 const [songs, setSongs] = useState<HeardSong[]>([]), [loading, setLoading] = useState(true), [error, setError] = useState(''), [retry, setRetry] = useState(0);
 useEffect(() => { const controller = new AbortController(); setLoading(true); setError(''); api<{ songs: HeardSong[] }>('/api/together/playlist', { signal: controller.signal }).then(result => setSongs(result.songs)).catch(cause => { if (!controller.signal.aborted) setError(cause.message); }).finally(() => { if (!controller.signal.aborted) setLoading(false); }); return () => controller.abort(); }, [retry]);
 return <main className="diary-screen together-playlist"><header className="diary-topbar"><button className="diary-icon-button" onClick={onBack} aria-label="返回陪伴空间"><ChevronLeft size={24}/></button><h1>一起听歌单</h1><Headphones size={24}/></header>
  <div className="together-playlist-intro"><Disc3 size={44}/><h2>每一首，都是我们的回忆</h2><p>{songs.length ? `${songs.length} 首共同听过的歌 · 按最近收听排序` : '把同一段旋律，留在两个人的时光里'}</p></div>
  {loading ? <div className="diary-state" role="status"><LoaderCircle className="spin"/>正在打开歌单…</div> : error ? <div className="diary-state" role="alert"><p>{error}</p><button className="diary-retry" onClick={() => setRetry(value => value + 1)}>重新加载</button></div> : songs.length ? <div className="together-song-list">{songs.map(song => <article className="together-song" key={song.id}><span className="together-song-cover" style={{ background: song.color }}><Disc3 size={27}/></span><div><h3>{song.title}</h3><p>{song.artist}</p><small>一起听过 {song.playCount} 次 · {new Date(song.lastListenedAt).toLocaleDateString('zh-CN', { timeZone: 'Asia/Shanghai' })}</small></div><button aria-label={`${playingId === song.id ? '暂停' : '播放'}${song.title}`} onClick={() => onPlay(song)} disabled={!song.audioUrl}>{playingId === song.id ? <Pause size={21}/> : <Play size={21}/>}</button>{!song.audioUrl && <span className="together-no-audio">暂无可用音源</span>}</article>)}</div> : <div className="together-empty"><HeartNotes/><h2>第一首共同的歌，还在等我们</h2><p>一起听的播放记录会自动留在这里。</p><button className="diary-retry" onClick={onBack}>回空间，去一起听</button></div>}
 </main>;
}
function HeartNotes() { return <span className="together-empty-notes" aria-hidden="true">♪ ♡ ♫</span>; }
