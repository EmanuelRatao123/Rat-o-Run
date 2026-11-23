import { Megaphone } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { GlobalMessage } from '../shared/constants.ts';

interface GlobalBroadcastOverlayProps {
  messages: GlobalMessage[];
}

export function GlobalBroadcastOverlay({ messages }: GlobalBroadcastOverlayProps) {
  const [visibleMsg, setVisibleMsg] = useState<GlobalMessage | null>(null);
  const shownIdsRef = useRef<Set<string>>(new Set());
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    const now = Date.now();
    const fresh = messages.find(
      (m) =>
        m.active &&
        new Date(m.expiresAt).getTime() > now &&
        !shownIdsRef.current.has(m.id)
    );
    if (!fresh) return;

    shownIdsRef.current.add(fresh.id);
    setVisibleMsg(fresh);

    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
    }
    timerRef.current = window.setTimeout(() => {
      setVisibleMsg(null);
      timerRef.current = null;
    }, 3000);
  }, [messages]);

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        window.clearTimeout(timerRef.current);
      }
    };
  }, []);

  if (!visibleMsg) return null;

  return (
    <div className="fixed inset-0 z-40 pointer-events-none flex items-start justify-center px-4 pt-16 sm:pt-20">
      <div className="w-full max-w-2xl rounded-3xl bg-slate-950/92 border-2 border-amber-400/90 shadow-2xl px-7 py-5 sm:px-9 sm:py-6 text-center animate-in fade-in zoom-in-95 duration-200">
        <div className="inline-flex items-center gap-2 text-amber-300 font-black text-xs sm:text-sm uppercase tracking-[0.22em] mb-1.5">
          <Megaphone className="w-5 h-5" />
          COMUNICADO GLOBAL
        </div>
        <h2 className="text-2xl sm:text-3xl font-black text-white leading-tight tracking-tight">
          {visibleMsg.title}
        </h2>
        <p className="text-slate-100 text-base sm:text-lg font-medium mt-2 leading-snug">
          {visibleMsg.content}
        </p>
      </div>
    </div>
  );
}
