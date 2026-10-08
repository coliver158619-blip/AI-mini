import type { Integration } from './types';

// randomUUID requires HTTPS; getRandomValues also works on LAN HTTP pages.
export function createId(): string {
 if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
 return Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, '0')).join('');
}

export class ApiError extends Error {
 constructor(message: string, public status: number, public details: { integration?: Integration; source?: string } = {}) { super(message); }
}

export async function api<T>(url: string, options?: RequestInit): Promise<T> {
 const response = await fetch(url, { ...options, headers: { 'Content-Type': 'application/json', ...options?.headers } });
 const data = await response.json();
 if (!response.ok) throw new ApiError(typeof data.error === 'string' ? data.error : data.error?.message || '暂时连接不上，请稍后再试', response.status, data);
 return data as T;
}
export const post = <T,>(url: string, data: unknown) => api<T>(url, { method: 'POST', body: JSON.stringify(data) });
