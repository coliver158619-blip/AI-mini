import { useEffect, useRef, useState, type CSSProperties } from 'react';

export function usePullToDismiss(enabled: boolean, onClose: () => void) {
 const ref = useRef<HTMLElement>(null);
 const close = useRef(onClose); close.current = onClose;
 const didDrag = useRef(false);
 const [distance, setDistance] = useState(0);
 const [dragging, setDragging] = useState(false);

 useEffect(() => {
  const sheet = ref.current;
  didDrag.current = false;
  setDistance(0); setDragging(false);
  if (!enabled || !sheet) return;
  let start: { x: number; y: number } | null = null;
  let offset = 0;
  let active = false;
  const reset = () => { start = null; offset = 0; active = false; setDistance(0); setDragging(false); };
  const begin = (event: TouchEvent) => {
   reset();
   if (event.touches.length !== 1) return;
   const target = event.target instanceof Element ? event.target : null;
   if (target?.closest('button, a, input, textarea, select, [role="slider"], .chat-history-panel')) return;
   const scroller = target?.closest('.sheet-content, .chat-messages');
   if (scroller && scroller.scrollTop > 1) return;
   start = { x: event.touches[0].clientX, y: event.touches[0].clientY };
  };
  const move = (event: TouchEvent) => {
   if (!start || event.touches.length !== 1) { if (active) reset(); return; }
   const dx = event.touches[0].clientX - start.x;
   const dy = event.touches[0].clientY - start.y;
   if (!active) {
    if (Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy)) { start = null; return; }
    if (dy < -8) { start = null; return; }
    if (dy <= 8 || dy < Math.abs(dx) * 1.2) return;
    active = true; didDrag.current = true; setDragging(true);
   }
   if (event.cancelable) event.preventDefault();
   offset = Math.max(0, Math.min(dy * .85, sheet.clientHeight * .65));
   setDistance(offset);
  };
  const end = () => {
   const dismiss = active && offset >= Math.min(100, sheet.clientHeight * .22);
   reset();
   if (dismiss) close.current();
  };
  sheet.addEventListener('touchstart', begin, { passive: true });
  sheet.addEventListener('touchmove', move, { passive: false });
  sheet.addEventListener('touchend', end);
  sheet.addEventListener('touchcancel', reset);
  return () => {
   sheet.removeEventListener('touchstart', begin);
   sheet.removeEventListener('touchmove', move);
   sheet.removeEventListener('touchend', end);
   sheet.removeEventListener('touchcancel', reset);
  };
 }, [enabled]);

 const style: CSSProperties | undefined = enabled ? {
  transform: `translate3d(0, ${distance}px, 0)`,
  transition: dragging ? 'none' : 'transform .2s ease',
  animation: didDrag.current ? 'none' : undefined,
 } : undefined;
 return { ref, style };
}
