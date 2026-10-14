import type { Integration } from './types';

// randomUUID requires HTTPS; getRandomValues also works on LAN HTTP pages.
export function createId(): string {
 if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
 return Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, '0')).join('');
}

export class ApiError extends Error {
 constructor(message: string, public status: number, public details: { integration?: Integration; source?: string } = {}) { super(message); }
}

export function networkErrorMessage(error: unknown): string {
 if (error instanceof TypeError || (error instanceof DOMException && error.name === 'TimeoutError')) {
  return navigator.onLine === false ? '网络已断开，请联网后重试。' : '网络连接中断或等待超时，请重试；若持续失败，请切换 Wi-Fi 或移动网络。';
 }
 return error instanceof Error ? error.message : '暂时连接不上，请稍后再试。';
}

export async function api<T>(url: string, options?: RequestInit): Promise<T> {
 // Only reads can be retried safely; a lost POST response may already be saved.
 const readOnly = !options?.method || options.method.toUpperCase() === 'GET';
 const attempts = readOnly ? 2 : 1;
 for (let attempt = 0; attempt < attempts; attempt++) {
  const controller = new AbortController();
  const cancel = () => controller.abort(options?.signal?.reason);
  if (options?.signal?.aborted) cancel();
  options?.signal?.addEventListener('abort', cancel, { once: true });
  const timer = setTimeout(() => controller.abort(new DOMException('Request timed out', 'TimeoutError')), readOnly ? 15_000 : 180_000);
  try {
   const response = await fetch(url, { credentials: 'same-origin', ...options, signal: controller.signal, headers: { 'Content-Type': 'application/json', ...options?.headers } });
   if (response.status === 401) throw new ApiError('登录已失效，请重新打开页面并输入访问账号和密码。', 401);
   if ([502, 503, 504].includes(response.status) && !response.headers.get('Content-Type')?.includes('application/json')) throw new ApiError('服务暂时连接不上，请稍后重试。', response.status);
   if (!response.headers.get('Content-Type')?.includes('application/json')) throw new ApiError('服务返回异常，请刷新页面后重试。', response.status);
   const data = await response.json();
   if (!response.ok) throw new ApiError(typeof data.error === 'string' ? data.error : data.error?.message || '暂时连接不上，请稍后再试', response.status, data);
   return data as T;
  } catch (error) {
   if (options?.signal?.aborted) throw error;
   const failure = controller.signal.aborted ? controller.signal.reason : error;
   const retryable = failure instanceof TypeError || (failure instanceof DOMException && failure.name === 'TimeoutError') || (failure instanceof ApiError && [502, 503, 504].includes(failure.status));
   if (!retryable || attempt === attempts - 1) throw failure instanceof ApiError ? failure : new Error(networkErrorMessage(failure));
  } finally {
   clearTimeout(timer);
   options?.signal?.removeEventListener('abort', cancel);
  }
  await new Promise(resolve => setTimeout(resolve, 600));
 }
 throw new Error('暂时连接不上，请稍后再试。');
}
export const post = <T,>(url: string, data: unknown) => api<T>(url, { method: 'POST', body: JSON.stringify(data) });
