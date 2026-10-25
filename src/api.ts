import type { Integration } from './types';
import {withMusicImage, musicImages, musicImageGroups} from './music-images';

// randomUUID requires HTTPS; getRandomValues also works on LAN HTTP pages.
export function createId(): string {
 if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
 return Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, '0')).join('');
}

export class ApiError extends Error {
 constructor(message: string, public status: number, public details: { integration?: Integration; source?: string } = {}) { super(message); }
}

let activeUser = '';
export const setApiUser = (id: string) => { activeUser = id; };
export async function roomFetch(url: string, options?: RequestInit): Promise<Response> {
 const requestUser = activeUser;
 const headers = new Headers(options?.headers);
 if (requestUser && !['/api/auth/session', '/api/auth/login'].includes(url)) headers.set('X-Music-User', requestUser);
 const response = await fetch(url, { ...options, headers });
 if (!url.startsWith('/api/auth/') && (response.status === 401 || response.status === 409)) {
  const error = await response.clone().json().catch(() => ({}));
  if (requestUser === activeUser && (error.code === 'LOGIN_REQUIRED' || error.code === 'ACCOUNT_CHANGED')) window.dispatchEvent(new Event('music-session-ended'));
 }
 return response;
}

export async function api<T>(url: string, options?: RequestInit): Promise<T> {
 const response = await roomFetch(url, { ...options, headers: { 'Content-Type': 'application/json', ...options?.headers } });
 const data = await response.json();
 if (!response.ok) throw new ApiError(typeof data.error === 'string' ? data.error : data.error?.message || '暂时连接不上，请稍后再试', response.status, data);
 if (data.profile?.personalityId) data.profile = withMusicImage(data.profile);
 if (url === '/api/personalities' && Array.isArray(data.personalities)) {
  const available = new Set(data.personalities.map((item:{id:string})=>item.id));
  data.personalities = musicImages.filter(image=>available.has(image.id));
  data.groups = musicImageGroups;
 }
 return data as T;
}
export const post = <T,>(url: string, data: unknown) => api<T>(url, { method: 'POST', body: JSON.stringify(data) });
