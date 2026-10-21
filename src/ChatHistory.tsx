import { useRef, useState } from 'react';
import { Check, History, LoaderCircle, MessageSquarePlus, X } from 'lucide-react';
import { api, post } from './api';
import type { Message } from './types';
import './chat-history.css';

type Conversation = { id: string; title: string; updatedAt: string; preview: string; messageCount: number };
export type ChatSelection = { conversationId: string; messages: Message[] };
type Props = {
 activeId: string; disabled: boolean; onBusy: (busy: boolean) => void;
 onSelect: (selection: ChatSelection) => void; onError: (error: string) => void;
};

export default function ChatHistory({ activeId, disabled, onBusy, onSelect, onError }: Props) {
 const [open, setOpen] = useState(false);
 const [loading, setLoading] = useState(false);
 const [error, setError] = useState('');
 const [conversations, setConversations] = useState<Conversation[]>([]);
 const working = useRef(false);
 const historyButton = useRef<HTMLButtonElement>(null);
 async function showHistory() {
  if (disabled || working.current) return;
  setOpen(true); setLoading(true); setError('');
  working.current = true;
  try { setConversations((await api<{ conversations: Conversation[] }>('/api/conversations')).conversations); }
  catch (cause) { setError(cause instanceof Error ? cause.message : '历史对话暂时无法打开'); }
  finally { setLoading(false); working.current = false; }
 }
 async function choose(id?: string) {
  if (disabled || working.current) return;
  working.current = true; onBusy(true); setError('');
  try {
   const selection = await post<ChatSelection>(id ? `/api/conversations/${encodeURIComponent(id)}/select` : '/api/conversations', {});
   onSelect(selection); setOpen(false); historyButton.current?.focus();
  } catch (cause) {
   const message = cause instanceof Error ? cause.message : '对话暂时无法切换，请重试';
   setError(message); onError(message);
  } finally { working.current = false; onBusy(false); }
 }
 return <div className="chat-session-actions">
  <button type="button" aria-label="开启新对话" title="开启新对话" disabled={disabled || loading} onClick={() => void choose()}><MessageSquarePlus size={16}/></button>
  <button ref={historyButton} type="button" aria-label="选择历史对话" title="选择历史对话" aria-expanded={open} aria-controls="chat-history-panel" disabled={disabled || loading} onClick={() => open ? setOpen(false) : void showHistory()}><History size={16}/></button>
  {open && <section id="chat-history-panel" className="chat-history-panel" aria-label="历史对话" onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); setOpen(false); historyButton.current?.focus(); } }}>
   <header><strong>历史对话</strong><button type="button" aria-label="关闭历史对话" onClick={() => { setOpen(false); historyButton.current?.focus(); }}><X size={16}/></button></header>
   {loading ? <p role="status"><LoaderCircle size={16} className="spin"/> 正在读取对话…</p> : error ? <p role="alert">{error}<button type="button" onClick={() => void showHistory()}>重试</button></p> : <div className="chat-history-list">
    {conversations.map(item => <button type="button" key={item.id} aria-current={item.id === activeId ? 'true' : undefined} disabled={disabled} onClick={() => void choose(item.id)}>
     <span><strong>{item.title}</strong><small>{item.preview}</small><time dateTime={item.updatedAt}>{new Date(item.updatedAt).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })} · {item.messageCount} 条消息</time></span>
     {item.id === activeId && <Check size={16}/>}<span className="sr-only">{item.id === activeId ? '当前对话' : '继续对话'}</span>
    </button>)}
    {!conversations.length && <p>还没有历史对话，开始聊聊吧。</p>}
   </div>}
  </section>}
 </div>;
}
