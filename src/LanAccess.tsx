import { useEffect, useRef, useState } from 'react';
import { Copy, Wifi } from 'lucide-react';
import { api } from './api';

export default function LanAccess() {
 const [network, setNetwork] = useState<{ enabled: boolean; urls: string[] } | null>(null);
 const [message, setMessage] = useState('');
 const address = useRef<HTMLInputElement>(null);
 useEffect(() => { api<{ enabled: boolean; urls: string[] }>('/api/network').then(setNetwork).catch(() => setMessage('暂时无法获取地址，请稍后重新打开设置。')); }, []);
 const url = network?.urls[0];
 async function copy() {
  if (!url) return;
  try {
   if (window.isSecureContext && navigator.clipboard) await navigator.clipboard.writeText(url);
   else { address.current?.select(); if (!document.execCommand('copy')) throw new Error(); }
   setMessage('地址已复制，用同一 Wi-Fi 下的手机浏览器打开。');
  } catch { address.current?.select(); setMessage('请长按地址复制，再用同一 Wi-Fi 下的手机打开。'); }
 }
 return <section className="lan-access" aria-label="局域网访问">
  <h3><Wifi size={18}/> 手机 / 局域网访问</h3>
  <p>手机和电脑连接同一 Wi-Fi，在手机浏览器打开下方地址。</p>
  {url ? <div className="lan-address"><input ref={address} aria-label="局域网访问地址" value={url} readOnly onClick={e => e.currentTarget.select()}/><button type="button" onClick={() => void copy()} aria-label="复制局域网地址"><Copy size={16}/>复制</button></div> : <p>{!network ? '正在获取访问地址…' : network.enabled ? '暂未找到局域网地址，请连接 Wi-Fi 后重新打开设置。' : '当前服务仅供本机访问，请用 start.ps1 重新启动。'}</p>}
  <small>请保持电脑和服务运行。手机上可手动选城查看天气。</small>
  {message && <p role="status">{message}</p>}
 </section>;
}
