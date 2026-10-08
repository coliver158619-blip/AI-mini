import { useEffect, useRef } from 'react';
import { api } from './api';
import type { Integration, Song } from './types';
import type { WeatherData } from './Weather';

type HourlyResult = {
 songs: Song[]; source: string; createdAt: string | null; nextAt: string | null;
 pending: boolean; error?: string | null; integration?: Integration;
 context?: { weather?: WeatherData | null };
};
type Options = { enabled: boolean; active: boolean; onRecommendation: (result: HourlyResult) => void };

// SQLite owns the hourly deadline. Timers only wake the visible home page to check it.
export function useHourlyRecommendation({ enabled, active, onRecommendation }: Options) {
 const callback = useRef(onRecommendation); callback.current = onRecommendation;
 const delivered = useRef<string | null>(null);

 useEffect(() => {
  if (!enabled || !active) return;
  let stopped = false;
  let checking = false;
  let timer: ReturnType<typeof setTimeout>;
  let controller: AbortController | undefined;
  const schedule = (milliseconds: number) => {
   clearTimeout(timer);
   if (!stopped) timer = setTimeout(() => void check(), Math.max(250, milliseconds));
  };
  const show = (result: HourlyResult) => {
   if (stopped || document.hidden || result.source !== 'kugou' || !result.songs.length || !result.createdAt || delivered.current === result.createdAt) return;
   delivered.current = result.createdAt;
   callback.current(result);
  };
  const delay = (result: HourlyResult) => {
   const remaining = Date.parse(result.nextAt || '') - Date.now();
   return result.pending ? 5000 : Number.isFinite(remaining) && remaining > 0 ? remaining + 100 : 60_000;
  };
  async function check() {
   if (stopped || checking || document.hidden) return;
   checking = true;
   controller = new AbortController();
   try {
    let result = await api<HourlyResult>('/api/recommendations/hourly', { signal: controller.signal });
    if (stopped || document.hidden) return;
    show(result);
    const next = Date.parse(result.nextAt || '');
    if (!Number.isFinite(next) || next <= Date.now()) {
     result = await api<HourlyResult>('/api/recommendations/hourly', { method: 'POST', body: '{}', signal: controller.signal });
     show(result);
    }
    schedule(delay(result));
   } catch {
    // Keep the last real song/greeting; a network failure must not invent a recommendation.
    if (!stopped) schedule(60_000);
   } finally { checking = false; }
  }
  const resume = () => { clearTimeout(timer); if (!document.hidden) void check(); };
  document.addEventListener('visibilitychange', resume);
  window.addEventListener('online', resume);
  schedule(300);
  return () => {
   stopped = true; clearTimeout(timer); controller?.abort();
   document.removeEventListener('visibilitychange', resume);
   window.removeEventListener('online', resume);
  };
 }, [enabled, active]);
}
