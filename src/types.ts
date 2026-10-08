export type Song = { id: string; title: string; artist: string; color: string; tags: string[]; audioUrl?: string; audioLabel?: string; favorite?: boolean };
export type Profile = { name: string; days: number; energy: number; energyMax: number; streak: number };
export type Message = { id?: number | string; role: 'user' | 'assistant'; content: string; songs?: Song[]; createdAt?: string; source?: string };
export type Integration = { provider: string; configured: boolean; state: 'ready' | 'connected' | 'error' | 'disabled'; detail: string; configSource?: string; sessionPersistent?: boolean };
export type Bootstrap = { profile: Profile; songs: Song[]; greeting: string; mode: string; isDemo?: boolean; integration?: Integration };
