import { createContext, ReactNode, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { DEF_CARDS, EVENTS, Ev, REMINDERS, Reminder } from '@/data/mock';
import { light, night as nightP, Kind, Palette } from '@/theme/tokens';

type AppState = {
  night: boolean; toggleNight: () => void; p: Palette;
  cards: Kind[]; setCards: (c: Kind[]) => void;
  events: Ev[]; reminders: Reminder[];
  lvl: number; xp: number; xpMax: number;
  sample: number; nextSample: () => void;
  toast: string | null; showToast: (t: string, ms?: number) => void;
};
const Ctx = createContext<AppState | null>(null);

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [night, setNight] = useState(false);
  const [cards, setCards] = useState<Kind[]>(DEF_CARDS);
  const [sample, setSample] = useState(0);
  const [toast, setToast] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showToast = useCallback((t: string, ms = 2200) => {
    setToast(t); if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(null), ms);
  }, []);
  const toggleNight = useCallback(() => {
    setNight(n => { showToast(!n ? '夜间模式：暖光低亮，团团戴上睡帽啦' : '白天模式'); return !n; });
  }, [showToast]);
  const value = useMemo<AppState>(() => ({
    night, toggleNight, p: night ? nightP : light, cards, setCards,
    events: EVENTS, reminders: REMINDERS, lvl: 3, xp: 37, xpMax: 50,
    sample, nextSample: () => setSample(s => (s + 1) % 10), toast, showToast,
  }), [night, toggleNight, cards, sample, toast, showToast]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
export const useApp = () => { const c = useContext(Ctx); if (!c) throw new Error('AppStateProvider missing'); return c; };
