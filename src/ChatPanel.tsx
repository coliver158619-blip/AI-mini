import { useState } from 'react';
import { ChevronLeft, Disc3, History, MessageSquarePlus, MoreHorizontal, Play, Send, Sun, Tag, X } from 'lucide-react';
import { api, post } from './api';
import type { Message, Song, Profile } from './types';
import AppearanceAvatar from './AppearanceAvatar';

type Selection = { conversationId: string; messages: Message[] };
type Props = {
 appearance?: Profile['appearance'];
 messages: Message[]; input: string; sending: boolean; error: string; greeting: string;
 weather: string; provider: string; commands: string[]; conversationId: string;
 onInput: (value: string) => void; onSend: (value: string, scene?: string) => void;
 onClose: () => void; onPlay: (song: Song) => void; onSelect: (value: Selection) => void;
};

export default function ChatPanel(props: Props) {
 const [history, setHistory] = useState<{ id: string; title: string; updated_at: string; messageCount: number }[]>([]);
 const [historyOpen, setHistoryOpen] = useState(false);
 const [busy, setBusy] = useState(false);
 const [error, setError] = useState('');
 async function openHistory() {
  if (props.sending || busy) return;
  setHistoryOpen(true); setBusy(true); setError('');
  try { setHistory((await api<{ conversations: typeof history }>('/api/conversations')).conversations); }
  catch (cause) { setError(cause instanceof Error ? cause.message : '对话暂时无法读取'); }
  finally { setBusy(false); }
 }
 async function select(id?: string) {
  if (props.sending || busy) return;
  setBusy(true); setError('');
  try { props.onSelect(await post<Selection>(id ? `/api/conversations/${encodeURIComponent(id)}/select` : '/api/conversations', {})); setHistoryOpen(false); }
  catch (cause) { setError(cause instanceof Error ? cause.message : '对话暂时无法打开'); }
  finally { setBusy(false); }
 }
 const disabled = props.sending || busy;
 return <>
  <header className="chat-topbar sheet-heading"><button className="chat-circle" aria-label="关闭面板" onClick={props.onClose}><ChevronLeft size={28}/></button><button className="chat-circle" aria-label="对话更多选项" onClick={() => void openHistory()} disabled={disabled}><MoreHorizontal size={28}/></button></header>
  <div className="chat-context"><span className="chat-presence"><i/>{props.weather}</span><div className="chat-session-actions"><button title="开启新对话" aria-label="开启新对话" onClick={() => void select()} disabled={disabled}><MessageSquarePlus size={21}/></button><button title="选择历史对话" aria-label="选择历史对话" onClick={() => void openHistory()} disabled={disabled}><History size={22}/></button></div><span className="chat-provider">{props.provider}</span></div>
  <div className="chat-messages" aria-live="polite">
   <div className="chat-message assistant"><AppearanceAvatar appearance={props.appearance} className="message-avatar"/><div className="message-content"><p>{props.greeting}</p></div></div>
   {props.messages.map((message, index) => <div className={`chat-message ${message.role}`} key={message.id || index}>
    {message.role === 'assistant' && <AppearanceAvatar appearance={props.appearance} className="message-avatar"/>}<div className="message-content"><p>{message.content.split(/(\*\*[^*]+\*\*)/g).map((part, i) => part.startsWith('**') ? <strong key={i}>{part.slice(2, -2)}</strong> : part)}</p>
    {message.songs?.map(song => <button className="chat-song" key={song.id} onClick={() => props.onPlay(song)}><span className="chat-song-cover"><Disc3 size={25}/></span><span><strong>{song.title}</strong><small>{song.artist}</small></span><Play size={16}/></button>)}
    </div>
   </div>)}
   {props.sending && <div className="typing-dots"><span/><span/><span/> 正在认真听你说…</div>}
   {(props.error || error) && <p className="inline-error" role="alert">{props.error || error}</p>}
   <div className="chat-bottom-anchor"/>
  </div>
  <div className="chat-quick-actions">{props.commands.length ? props.commands.map(command => <button key={command} onClick={() => props.onSend(command)} disabled={disabled}>{command}</button>) : <>
   <button className="chat-relax" onClick={() => props.onSend('有点累，想放松一下', '放松一下')} disabled={disabled}><span className="chat-orb"/>放松一下</button>
   <button onClick={() => props.onSend('今天很开心，推荐轻快的音乐', '开心加倍')} disabled={disabled}><Sun className="chat-sun" size={23}/>开心加倍</button>
   <button onClick={() => props.onSend('我要专注工作，推荐适合学习的音乐', '专注时刻')} disabled={disabled}><Tag className="chat-tag" size={21} fill="currentColor"/>专注时刻</button>
  </>}</div>
  <form className="chat-form" onSubmit={event => { event.preventDefault(); props.onSend(props.input); }}><input aria-label="对搭子说点什么" placeholder="聊聊心情，或告诉我想听的歌..." value={props.input} maxLength={500} onChange={event => props.onInput(event.target.value)} disabled={disabled}/><button type="submit" aria-label="发送消息" disabled={!props.input.trim() || disabled}><Send size={25} fill="white"/></button></form>
  {historyOpen && <div className="chat-history-backdrop" onClick={event => { if (event.target === event.currentTarget) setHistoryOpen(false); }}><section className="chat-history-panel" role="region" aria-label="历史对话"><header><h3>历史对话</h3><button aria-label="关闭历史对话" onClick={() => setHistoryOpen(false)}><X size={21}/></button></header>{busy ? <p>正在读取…</p> : error ? <p role="alert">{error}<button onClick={() => void openHistory()}>重试</button></p> : history.map(item => <button key={item.id} aria-current={props.conversationId === item.id ? 'true' : undefined} onClick={() => void select(item.id)}><strong>{item.title}</strong><span>{new Date(item.updated_at).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })} · {item.messageCount} 条消息</span></button>)}</section></div>}
 </>;
}
