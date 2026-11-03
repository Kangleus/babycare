/* 全局状态：启动时从 Repo 读出宝宝 / 记录 / 设置；所有写操作先写 Repo 再更新内存 */
import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { setRepo, getRepo, getLocalStore, DEFAULT_SETTINGS, LOCAL_MEMBER } from '@/data/repo';
import { DemoRepo } from '@/data/demo-repo';
import { SupabaseRepo } from '@/data/supabase-repo';
import { cloud } from '@/data/sync';
import { EMPTY_HEALTH } from '@/data/local-repo';
import { router } from 'expo-router';
import { upcoming, whenText } from '@/lib/health';
import type { AskMsg } from '@/lib/ask-api';
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
  /** 首次使用「开始记录」：一个 RPC 建家庭 + 宝宝，然后进空首页（团团 Lv.1、引导打开） */
  finishOnboarding: (b: Baby, displayName: string) => Promise<void>;
  demo: boolean; canWrite: boolean; guardDemo: () => boolean; enterDemo: () => void; exitDemo: () => void;
  /** 退出 / 注销后：清掉这台设备上的宝宝、记录、健康档案和设置（只保留夜间模式） */
  resetLocal: () => Promise<void>;
  /** 首次使用：空首页团团引导 / 邀请家人提示卡 / 第一条记录后的 5a sheet */
  saveFlags: (patch: Pick<Partial<Settings>, 'guideDone' | 'nudgeGone' | 'firstDone'>) => void;
  firstOpen: boolean; closeFirst: () => void;
  inviteOpen: boolean; openInvite: () => void; closeInvite: () => void;
  recTarget: RecTarget; openRecord: (kind: Kind, rec?: BabyRecord) => void; closeRecord: () => void;
  trend: Kind | null; openTrend: (k: Kind | null) => void;
  askMsgs: AskMsg[]; setAskMsgs: (m: AskMsg[]) => void;
  summaryOpen: boolean; summaryAud: 'doctor' | 'granny'; openSummary: (aud?: 'doctor' | 'granny') => void; closeSummary: () => void;
  samplesOpen: boolean; setSamplesOpen: (b: boolean) => void;
};
const Ctx = createContext<AppState | null>(null);

export function AppStateProvider({ children }: { children: ReactNode }) {
  /* demo = 只读示例模式：数据来自 DemoRepo（内存），不落盘、不同步、不调 Edge Function */
  const [demo, setDemo] = useState(false);
  /* 仓库实例由模式决定：demo = DemoRepo（只读、内存），real = SupabaseRepo（本地优先 + 云端同步） */
  const repo = useMemo(() => (demo ? new DemoRepo() : new SupabaseRepo()), [demo]);
  useMemo(() => { setRepo(repo); }, [repo]);
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
  const [askMsgs, setAskMsgs] = useState<AskMsg[]>([]);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [summaryAud, setSummaryAud] = useState<'doctor' | 'granny'>('doctor');
  const [samplesOpen, setSamplesOpen] = useState(false);
  const [health, setHealth] = useState<HealthData>(EMPTY_HEALTH);
  const [healthNav, setHealthNav] = useState<HealthNav>({ tab: 'ill', anchor: 'top', n: 0 });
  const [firstOpen, setFirstOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /* 家庭的第一条记录：庆祝文案换成「第一条记好啦！」，之后的那句 toast 换成「记满 3 天…」，再弹 5a sheet */
  const firstRef = useRef<'pending' | 'shown' | null>(null);
  const muteToast = useRef(false);

  const load = useCallback(async () => {
    const [b, s, m] = await Promise.all([repo.getBaby(), repo.getSettings(), repo.getMembers()]);
    setBaby(b); setSettings(s); setMembers(m);
    setRecords(b ? await repo.listRecords(b.id) : []);
    setHealth(b ? await repo.getHealth(b.id) : EMPTY_HEALTH());
    setReady(true);
  }, [repo]);
  /* 启动时从仓库读一次（异步回调里 setState，订阅外部存储） */
  useEffect(() => { let alive = true; Promise.resolve().then(() => { if (alive) load(); }); return () => { alive = false; }; }, [load]);
  /* 云端同步：启动同步引擎；家人的新记录 / 成员变化到了就重新读本地副本。
     示例模式绝不起同步引擎——不建会话、不发请求。 */
  useEffect(() => {
    if (demo) return;
    const store = getLocalStore();
    if (!store) return;
    cloud.start(store);
    return cloud.on(e => { if (e === 'data') load(); });
  }, [load, demo]);
  /* 每 30 秒刷新「现在」，让预测 / 进行中的睡眠走起来 */
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 30000); return () => clearInterval(t); }, []);

  const showToast = useCallback((t: string, ms = 2200) => {
    if (muteToast.current) { muteToast.current = false; return; }
    setToast(t); if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(null), ms);
  }, []);
  const save = useCallback(async (patch: Partial<Settings>) => setSettings(await repo.saveSettings(patch)), [repo]);
  const toggleNight = useCallback(() => {
    const n = !settings.night; save({ night: n });
    showToast(n ? '夜间模式：暖光低亮，团团戴上睡帽啦' : '白天模式');
  }, [settings.night, save, showToast]);

  const reload = useCallback(async (b: Baby | null) => setRecords(b ? await repo.listRecords(b.id) : []), [repo]);
  /* 示例模式进出：重新加载数据源（DemoRepo 在内存里生成豆米的数据） */
  /* 示例模式守卫：所有写入口都先问它一句，被拦就弹 toast（DemoRepo 里还会再 throw 一次兜底） */
  const guardDemo = useCallback(() => {
    if (!demo) return true;
    showToast('示例里只能看哦 · 点上方「开始记我家宝宝」');
    return false;
  }, [demo, showToast]);
  const enterDemo = useCallback(() => setDemo(true), []);
  const exitDemo = useCallback(() => setDemo(false), []);
  const putHealth = useCallback<AppState['putHealth']>(async (kind, item) => { if (!guardDemo()) return; await repo.putHealth(kind, item); if (baby) setHealth(await repo.getHealth(baby.id)); }, [repo, baby, guardDemo]);
  const deleteHealth = useCallback(async (kind: HealthKind, id: string) => { if (!guardDemo()) return; await repo.deleteHealth(kind, id); if (baby) setHealth(await repo.getHealth(baby.id)); }, [repo, baby, guardDemo]);
  const goHealth = useCallback((anchor: HealthNav['anchor'], tab?: HealthNav['tab']) => {
    setHealthNav(h => ({ tab: tab ?? h.tab, anchor, n: h.n + 1 })); router.navigate('/health');
  }, []);
  const setHealthTab = useCallback((t: HealthNav['tab']) => setHealthNav(h => ({ ...h, tab: t, anchor: 'ill', n: h.n + 1 })), []);

  const addRecord = useCallback<AppState['addRecord']>(async r => {
    if (!guardDemo()) throw new Error('demo');
    if (!baby) throw new Error('no baby');
    if (!records.length && !settings.firstDone) firstRef.current = 'pending';
    const me = members.find(m => m.isLocal) ?? LOCAL_MEMBER;
    const rec = await repo.addRecord({ ...r, babyId: baby.id, createdBy: me.name, src: r.src ?? 'manual' });
    /* 结束上一段「进行中」的睡眠（原型 commit()） */
    if (r.type === 'sleep') {
      const on = records.find(x => x.type === 'sleep' && !x.endTime && x.id !== rec.id && new Date(x.time) < new Date(r.time));
      if (on) await repo.updateRecord(on.id, { endTime: r.time });
    }
    let xp = settings.xp + 1, lvl = settings.lvl, lvUp = false;
    if (xp >= XP_MAX) { xp -= XP_MAX; lvl = Math.min(5, lvl + 1); lvUp = true; }
    await save({ xp, lvl, ...(firstRef.current === 'pending' ? { firstDone: true, guideDone: true } : {}) }); await reload(baby); setNow(new Date());
    return { lvUp, rec };
  }, [baby, members, records, repo, settings.xp, settings.lvl, settings.firstDone, save, reload, guardDemo]);
  const celebrate = useCallback((c: Cele) => {
    if (c && firstRef.current === 'pending') { firstRef.current = 'shown'; setCele({ say: '第一条记好啦！' }); return; }
    if (!c && firstRef.current === 'shown') {
      firstRef.current = null; setCele(null);
      showToast('记满 3 天，团团就能预测下一顿啦', 2600);
      muteToast.current = true; /* 调用方紧接着会弹「预测已刷新…」，第一条时不弹 */
      setTimeout(() => { muteToast.current = false; setFirstOpen(true); }, 600);
      return;
    }
    setCele(c);
  }, [showToast]);
  const updateRecord = useCallback<AppState['updateRecord']>(async (id, patch) => { if (!guardDemo()) return; await repo.updateRecord(id, patch); await reload(baby); }, [repo, reload, baby, guardDemo]);
  const deleteRecord = useCallback(async (id: string) => { if (!guardDemo()) return; await repo.deleteRecord(id); await reload(baby); }, [repo, reload, baby, guardDemo]);
  const saveBaby = useCallback(async (b: Baby) => { if (!guardDemo()) return; await repo.saveBaby(b); setBaby(b); }, [repo, guardDemo]);
  const acceptConsent = useCallback(async () => save({ consentAt: new Date().toISOString() }), [save]);
  const finishOnboarding = useCallback(async (b: Baby, displayName: string) => {
    await cloud.createFamilyWithBaby(displayName, b);
    await save({ onboarded: true, lvl: 1, xp: 0, guideDone: false, nudgeGone: false, firstDone: false });
    await load();
  }, [save, load]);
  const resetLocal = useCallback(async () => {
    const n = settings.night;
    if (demo) return;
    await repo.clearAll();
    setBaby(null); setRecords([]); setHealth(EMPTY_HEALTH()); setMembers([LOCAL_MEMBER]); setAskMsgs([]);
    setSettings(await repo.saveSettings({ night: n }));
  }, [repo, demo, settings.night]);
  const saveFlags = useCallback((patch: Pick<Partial<Settings>, 'guideDone' | 'nudgeGone' | 'firstDone'>) => { save(patch); }, [save]);

  const events = useMemo(() => dayEvs(records, now), [records, now]);
  const me = (members.find(m => m.isLocal) ?? LOCAL_MEMBER).name;
  /* 首页「吃药 · 下次 10:30」等用：已确认、未完成提醒的下一次到点 */
  const reminders = useMemo<Reminderish[]>(() => upcoming(health.reminders, now).map(x => ({ cat: x.r.cat, done: false, when: whenText(x.at, now) })), [health.reminders, now]);
  const dismissSugg = useCallback((id: string) => { save({ sgGone: [...(settings.sgGone ?? []), id].slice(-60) }); }, [save, settings.sgGone]);
  const value = useMemo<AppState>(() => ({
    ready, p: settings.night ? nightP : light, now, baby, records, events, members, reminders,
    health, me, putHealth, deleteHealth, healthNav, goHealth, setHealthTab, dismissSugg,
    settings, night: settings.night, toggleNight,
    cards: settings.cards, setCards: c => { if (!guardDemo()) return; save({ cards: c }); },
    lvl: settings.lvl, xp: settings.xp, xpMax: XP_MAX,
    sample: settings.sample, setSample: i => { save({ sample: i }); },
    toast, showToast, cele, celebrate,
    demo, canWrite: !demo, guardDemo, enterDemo, exitDemo,
    addRecord, updateRecord, deleteRecord, saveBaby, acceptConsent, finishOnboarding, resetLocal, saveFlags,
    firstOpen, closeFirst: () => setFirstOpen(false),
    inviteOpen, openInvite: () => { if (!guardDemo()) return; setFirstOpen(false); setInviteOpen(true); }, closeInvite: () => setInviteOpen(false),
    recTarget, openRecord: (kind, rec) => { if (!guardDemo()) return; setRecTarget({ kind, rec }); }, closeRecord: () => setRecTarget(null),
    trend, openTrend: setTrend, samplesOpen, setSamplesOpen,
    askMsgs, setAskMsgs,
    summaryOpen, summaryAud,
    openSummary: (aud?: 'doctor' | 'granny') => { if (aud) setSummaryAud(aud); setSummaryOpen(true); },
    closeSummary: () => setSummaryOpen(false),
  }), [demo, guardDemo, enterDemo, exitDemo, askMsgs, summaryOpen, summaryAud, samplesOpen, ready, settings, reminders, health, me, putHealth, deleteHealth, healthNav, goHealth, setHealthTab, dismissSugg, now, baby, records, events, members, toggleNight, save, toast, showToast, cele, celebrate, addRecord, updateRecord, deleteRecord, saveBaby, acceptConsent, finishOnboarding, resetLocal, saveFlags, firstOpen, inviteOpen, recTarget, trend]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
export const useApp = () => { const c = useContext(Ctx); if (!c) throw new Error('AppStateProvider missing'); return c; };
