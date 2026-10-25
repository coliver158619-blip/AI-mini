import {useCallback, useEffect, useState} from 'react';

const pages = ['home', 'spark', 'companion-energy', 'diary', 'reports', 'more', 'scenes', 'recommendations', 'weather', 'appearance', 'personality', 'companion-space', 'shared-diary', 'together-playlist'] as const;
export type Page = typeof pages[number];
const readPage = (): Page => {
 const value = window.location.hash.replace(/^#\/?/, '');
 return pages.includes(value as Page) ? value as Page : 'home';
};

export function usePageRoute() {
 const [page, updatePage] = useState<Page>(readPage);
 useEffect(() => {
  const navigate = () => updatePage(readPage());
  window.addEventListener('popstate', navigate);
  window.addEventListener('hashchange', navigate);
  return () => { window.removeEventListener('popstate', navigate); window.removeEventListener('hashchange', navigate); };
 }, []);
 const setPage = useCallback((next: Page) => {
  const url = new URL(window.location.href);
  url.hash = next === 'home' ? '' : `/${next}`;
  if (url.href !== window.location.href) window.history.pushState(null, '', url);
  updatePage(next);
 }, []);
 return [page, setPage] as const;
}
