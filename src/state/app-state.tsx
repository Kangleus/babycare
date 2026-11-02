/* 全局状态：启动时从 Repo 读出宝宝 / 记录 / 设置；所有写操作先写 Repo 再更新内存 */
import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { getRepo, getLocalStore, DEFAULT_SETTINGS, LOCAL_MEMBER } from '@/data/repo';
import { cloud } from '@/data/sync';
import { buildDemo, buildDemoHealth } from '@/data/seed';
import { EMPTY_HEALTH } from '@/data/local-repo';
import { router } from 'expo-router';
import { upcoming, whenText } from '@/lib/health';
import type { Baby, BabyRecord, HealthData, HealthKind, Member, NewRecord, Settings } from '@/data/types';
import type { Reminderish } from '@/lib/calc';
import { dayEvs, Ev } from '@/lib/calc';
import { light, night as nightP, Kind, Palette } from '@/theme/tokens';

export const XP_MAX = 50;
export const LVN = ['', '蛋壳团子', '小奶团', '冒芽团子', '开花团子', '皇冠团子'];
export type Cele = { say: string; calm?: boolean; extra?: string } | null;
export type RecTarget = { kind: Kind; rec?: BabyRecord } | null;
export type HealthNav = { tab: 'ill' | 'vax'; anchor: 'top' | 'rem' | 'ill'; n: number };

type AppState = {
  ready: boolean; p: Palette; now: Date;
  baby: Baby | null; records: BabyRecord[]; events: Ev[]; members: Member[]; reminders: Reminderish[];
  health: HealthData; me: string;
  putHealth: <T extends HealthKind>(kind: T, item: HealthData[T][number]) => Promise<void>;
  deleteHealth: (kind: HealthKind, id: string) => Promise<void>;
  healthNav: HealthNav; goHealth: (anchor: HealthNav['anchor'], tab?: HealthNav['tab']) => void; setHealthTab: (t: HealthNav['tab']) => void;
  dismissSugg: (id: string) => void;
  settings: Settings; night: boolean; toggleNight: () => void;
  cards: Kind[]; setCards: (c: Kind[]) => void;
  lvl: number; xp: number; xpMax: number;
  sample: number; setSample: (i: number) => void;
  toast: string | null; showToast: (t: string, ms?: number) => void;
  cele: Cele; celebrate: (c: Cele) => void;
  addRecord: (r: Omit<NewRecord, 'babyId' | 'createdBy' | 'src'> & { src?: NewRecord['src'] }) => Promise<{ lvUp: boolean; rec: BabyRecord }>;
  updateRecord: (id: string, patch: Parameters<ReturnType<typeof getRepo>['updateRecord']>[1]) => Promise<void>;
  deleteRecord: (id: string) => Promise<void>;
  saveBaby: (b: Baby) => Promise<void>;
  acceptConsent: () => Promise<void>;
  finishOnboarding: (b: Baby) => Promise<void>;
  resetDemo: () => Promise<void>;
  clearAll: () => Promise<void>;
  recTarget: RecTarget; openRecord: (kind: Kind, rec?: BabyRecord) => void; closeRecord: () => void;
  trend: Kind | null; openTrend: (k: Kind | null) => void;
  summaryOpen: boolean; openSummary: () => void; closeSummary: () => void;
  samplesOpen: boolean; setSamplesOpen: (b: boolean) => void;
};
const Ctx = createContext<AppState | null>(null);

export function AppStateProvider({ children }: { children: ReactNode }) {
  const repo = getRepo();
  const [ready, setReady] = useState(false);
  const [baby, setBaby] = useState<Baby | null>(null);
  const [records, setRecords] = useState<BabyRecord[]>([]);
  const [members, setMembers] = useState<Member[]>([LOCAL_MEMBER]);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [now, setNow] = useState(() => new Date());
  const [toast, setToast] = useState<string | null>(null);
  const [cele, setCele] = useState<Cele>(null);
  const [recTarget, setRecTarget] = useState<RecTarget>(null);
  const [trend, setTrend] = useState<Kind | null>(null);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [samplesOpen, setSamplesOpen] = useState(false);
  const [health, setHealth] = useState<HealthData>(EMPTY_HEALTH);
  const [healthNav, setHealthNav] = useState<HealthNav>({ tab: 'ill', anchor: 'top', n: 0 });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    const [b, s, m] = await Promise.all([repo.getBaby(), repo.getSettings(), repo.getMembers()]);
    setBaby(b); setSettings(s); setMembers(m);
    setRecords(b ? await repo.listRecords(b.id) : []);
    setHealth(b ? await repo.getHealth(b.id) : EMPTY_HEALTH());
    setReady(true);
  }, [repo]);
  /* 启动时从仓库读一次（异步回调里 setState，订阅外部存储） */
  useEffect(() => { let alive = true; Promise.resolve().then(() => { if (alive) load(); }); return () => { alive = false; }; }, [load]);
  /* 云端同步：启动同步引擎；家人的新记录 / 成员变化到了就重新读本地副本 */
  useEffect(() => { cloud.start(getLocalStore()); return cloud.on(e => { if (e === 'data') load(); }); }, [load]);
  /* 每 30 秒刷新「现在」，让预测 / 进行中的睡眠走起来 */
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 30000); return () => clearInterval(t); }, []);

  const showToast = useCallback((t: string, ms = 2200) => {
    setToast(t); if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(null), ms);
  }, []);
  const save = useCallback(async (patch: Partial<Settings>) => setSettings(await repo.saveSettings(patch)), [repo]);
  const toggleNight = useCallback(() => {
    const n = !settings.night; save({ night: n });
    showToast(n ? '夜间模式：暖光低亮，团团戴上睡帽啦' : '白天模式');
  }, [settings.night, save, showToast]);

  const reload = useCallback(async (b: Baby | null) => setRecords(b ? await repo.listRecords(b.id) : []), [repo]);
  const seed = useCallback(async (b: Baby) => {
    await repo.replaceRecords(b.id, buildDemo(b.id, new Date())); await repo.replaceHealth(b.id, buildDemoHealth(b, new Date()));
    await reload(b); setHealth(await repo.getHealth(b.id));
  }, [repo, reload]);
  const putHealth = useCallback<AppState['putHealth']>(async (kind, item) => { await repo.putHealth(kind, item); if (baby) setHealth(await repo.getHealth(baby.id)); }, [repo, baby]);
  const deleteHealth = useCallback(async (kind: HealthKind, id: string) => { await repo.deleteHealth(kind, id); if (baby) setHealth(await repo.getHealth(baby.id)); }, [repo, baby]);
  const goHealth = useCallback((anchor: HealthNav['anchor'], tab?: HealthNav['tab']) => {
    setHealthNav(h => ({ tab: tab ?? h.tab, anchor, n: h.n + 1 })); router.navigate('/health');
  }, []);
  const setHealthTab = useCallback((t: HealthNav['tab']) => setHealthNav(h => ({ ...h, tab: t, anchor: 'ill', n: h.n + 1 })), []);

  const addRecord = useCallback<AppState['addRecord']>(async r => {
    if (!baby) throw new Error('no baby');
    const me = members.find(m => m.isLocal) ?? LOCAL_MEMBER;
    const rec = await repo.addRecord({ ...r, babyId: baby.id, createdBy: me.name, src: r.src ?? 'manual' });
    /* 结束上一段「进行中」的睡眠（原型 commit()） */
    if (r.type === 'sleep') {
      const on = records.find(x => x.type === 'sleep' && !x.endTime && x.id !== rec.id && new Date(x.time) < new Date(r.time));
      if (on) await repo.updateRecord(on.id, { endTime: r.time });
    }
    let xp = settings.xp + 1, lvl = settings.lvl, lvUp = false;
    if (xp >= XP_MAX) { xp -= XP_MAX; lvl = Math.min(5, lvl + 1); lvUp = true; }
    await save({ xp, lvl }); await reload(baby); setNow(new Date());
    return { lvUp, rec };
  }, [baby, members, records, repo, settings.xp, settings.lvl, save, reload]);
  const updateRecord = useCallback<AppState['updateRecord']>(async (id, patch) => { await repo.updateRecord(id, patch); await reload(baby); }, [repo, reload, baby]);
  const deleteRecord = useCallback(async (id: string) => { await repo.deleteRecord(id); await reload(baby); }, [repo, reload, baby]);
  const saveBaby = useCallback(async (b: Baby) => { await repo.saveBaby(b); setBaby(b); }, [repo]);
  const acceptConsent = useCallback(async () => save({ consentAt: new Date().toISOString() }), [save]);
  const finishOnboarding = useCallback(async (b: Baby) => {
    await repo.saveBaby(b); setBaby(b);
    if (!settings.demoSeeded) await seed(b); else await reload(b);
    await save({ onboarded: true, demoSeeded: true });
  }, [repo, settings.demoSeeded, seed, reload, save]);
  const resetDemo = useCallback(async () => {
    if (!baby) return; await seed(baby); await save({ cards: DEFAULT_SETTINGS.cards, lvl: 3, xp: 37, demoSeeded: true });
  }, [baby, seed, save]);
  const clearAll = useCallback(async () => {
    if (cloud.state.userId) await cloud.signOut();
    await repo.clearAll(); setBaby(null); setRecords([]); setHealth(EMPTY_HEALTH()); setSettings(DEFAULT_SETTINGS); setMembers([LOCAL_MEMBER]);
  }, [repo]);

  const events = useMemo(() => dayEvs(records, now), [records, now]);
  const me = (members.find(m => m.isLocal) ?? LOCAL_MEMBER).name;
  /* 首页「吃药 · 下次 10:30」等用：已确认、未完成提醒的下一次到点 */
  const reminders = useMemo<Reminderish[]>(() => upcoming(health.reminders, now).map(x => ({ cat: x.r.cat, done: false, when: whenText(x.at, now) })), [health.reminders, now]);
  const dismissSugg = useCallback((id: string) => { save({ sgGone: [...(settings.sgGone ?? []), id].slice(-60) }); }, [save, settings.sgGone]);
  const value = useMemo<AppState>(() => ({
    ready, p: settings.night ? nightP : light, now, baby, records, events, members, reminders,
    health, me, putHealth, deleteHealth, healthNav, goHealth, setHealthTab, dismissSugg,
    settings, night: settings.night, toggleNight,
    cards: settings.cards, setCards: c => { save({ cards: c }); },
    lvl: settings.lvl, xp: settings.xp, xpMax: XP_MAX,
    sample: settings.sample, setSample: i => { save({ sample: i }); },
    toast, showToast, cele, celebrate: setCele,
    addRecord, updateRecord, deleteRecord, saveBaby, acceptConsent, finishOnboarding, resetDemo, clearAll,
    recTarget, openRecord: (kind, rec) => setRecTarget({ kind, rec }), closeRecord: () => setRecTarget(null),
    trend, openTrend: setTrend, samplesOpen, setSamplesOpen,
    summaryOpen, openSummary: () => setSummaryOpen(true), closeSummary: () => setSummaryOpen(false),
  }), [summaryOpen, samplesOpen, ready, settings, reminders, health, me, putHealth, deleteHealth, healthNav, goHealth, setHealthTab, dismissSugg, now, baby, records, events, members, toggleNight, save, toast, showToast, cele, addRecord, updateRecord, deleteRecord, saveBaby, acceptConsent, finishOnboarding, resetDemo, clearAll, recTarget, trend]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
export const useApp = () => { const c = useContext(Ctx); if (!c) throw new Error('AppStateProvider missing'); return c; };
