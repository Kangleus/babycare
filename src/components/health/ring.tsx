/* 到点横幅（原型 .rbanner 567-580）+ 提醒调度：原生排本地通知；App 打开时（含 Web）由团团横幅提醒 */
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useApp } from '@/state/app-state';
import { Tuan } from '@/lib/svg';
import type { Reminder } from '@/data/types';
import { nextOcc, RCAT, upcoming } from '@/lib/health';
import { hhmm } from '@/lib/time';
import { listen, scheduleAll } from '@/lib/notify';
import { useTopPad } from '../chrome';
import { fam } from '../txt';
import { medName } from './sheets';

/* —— 极简 store：当前在响的提醒 —— */
let cur: string | null = null;
const subs = new Set<() => void>();
export const ring = (id: string | null) => { cur = id; subs.forEach(f => f()); };
const useRing = () => useSyncExternalStore(f => { subs.add(f); return () => { subs.delete(f); }; }, () => cur, () => cur);
const snoozed = new Map<string, number>(); // id → 到这个时间前不再响
const rung = new Set<string>();              // `${id}@${at}` 已经响过

export function RingWatcher() {
  const { health, baby, now } = useApp();
  /* 原生：提醒变化就重排本地通知 */
  const sig = health.reminders.map(r => `${r.id}${r.dueAt}${r.repeat}${r.doneAt}${r.confirmed}`).join('|');
  const name = baby?.name ?? '宝宝';
  const rsRef = useRef(health.reminders);
  useEffect(() => { rsRef.current = health.reminders; });
  useEffect(() => { scheduleAll(rsRef.current, name, new Date()).catch(() => {}); }, [sig, name]);
  useEffect(() => listen(id => { router.navigate('/health'); ring(id); }, id => ring(id)), []);
  /* App 打开时：到点 10 分钟内的提醒弹横幅 */
  useEffect(() => {
    if (cur) return;
    const t = +now;
    for (const x of upcoming(health.reminders, now)) {
      const at = +x.at, key = `${x.r.id}@${at}`;
      const sn = snoozed.get(x.r.id);
      if (sn && t >= sn) { snoozed.delete(x.r.id); ring(x.r.id); return; }
      if (!sn && at <= t && t - at < 10 * 60000 && !rung.has(key)) { rung.add(key); ring(x.r.id); return; }
    }
  }, [now, health.reminders]);
  return null;
}

export function RingBanner() {
  const id = useRing();
  const { health } = useApp();
  const r = id ? health.reminders.find(x => x.id === id) ?? null : null;
  const [shown, setShown] = useState<Reminder | null>(null);
  if (r && r !== shown) setShown(r);
  const [y] = useState(() => new Animated.Value(-240));
  const [wob] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (r) Animated.spring(y, { toValue: 0, useNativeDriver: false, friction: 6, tension: 60 }).start();
    else Animated.timing(y, { toValue: -240, duration: 300, useNativeDriver: false }).start();
  }, [r, y]);
  useEffect(() => {
    if (!r) return;
    const a = Animated.loop(Animated.sequence([
      Animated.delay(1680), ...[-1.5, 1.5, -1, 0.5, 0].map(v => Animated.timing(wob, { toValue: v, duration: 120, easing: Easing.inOut(Easing.ease), useNativeDriver: false })),
    ]));
    a.start(); return () => a.stop();
  }, [r, wob]);
  return shown ? <BannerBody r={r ?? shown} y={y} wob={wob} /> : null;
}

function BannerBody({ r, y, wob }: { r: Reminder; y: Animated.Value; wob: Animated.Value }) {
  const { p, night, now, me, putHealth, addRecord, showToast } = useApp();
  const top = useTopPad();
  const at = nextOcc(r, new Date(+now - 10 * 60000)).at;
  const done = async (fed?: boolean) => {
    ring(null);
    const t = new Date();
    if (fed) await addRecord({ type: 'med', time: t.toISOString(), values: { name: medName(r.title), times: 1 }, note: '提醒里点「已喂」记录' });
    await putHealth('reminders', { ...r, doneAt: t.toISOString(), doneBy: me });
    showToast(fed ? `已记一笔：${medName(r.title)} · 提醒完成` : `完成啦：${r.title}`);
  };
  const later = () => { snoozed.set(r.id, Date.now() + 10 * 60000); ring(null); showToast('好的，10 分钟后团团再叫你'); };
  const rot = wob.interpolate({ inputRange: [-2, 2], outputRange: ['-2deg', '2deg'] });
  return (
    <Animated.View testID="rbanner" style={[s.b, { top: top - 26, backgroundColor: p.yellow, borderColor: p.ink, shadowColor: p.shadow, transform: [{ translateY: y }, { rotate: rot }] }]}>
      <View style={s.m}><Tuan mood="happy" acc={['clock', ...(night ? ['cap'] : [])]} size={72} /></View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[fam('b9'), s.l]}>到点啦 · {RCAT[r.cat].n}提醒</Text>
        <Text style={[fam('h'), s.t]} numberOfLines={2}><Text style={[fam('b9'), { fontSize: 20 }]}>{hhmm(at)}</Text> {r.title}</Text>
        <Text style={[fam('b8'), s.s]} numberOfLines={1}>{r.cat === 'med' ? '按医嘱 · 团团只负责叫你' : r.note || ''}</Text>
      </View>
      <View style={s.bb}>
        {r.cat === 'med' ? <Pressable testID="ring-fed" onPress={() => done(true)} style={[s.btn, s.ok]}><Text style={[fam('b9'), s.bt]}>已喂</Text></Pressable> : null}
        <Pressable testID="ring-done" onPress={() => done()} style={[s.btn, r.cat === 'med' ? null : s.ok]}><Text style={[fam('b9'), s.bt]}>完成</Text></Pressable>
        <Pressable testID="ring-later" onPress={later} style={s.btn}><Text style={[fam('b9'), s.bt]}>10 分钟后</Text></Pressable>
      </View>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  b: { position: 'absolute', left: 12, right: 12, zIndex: 96, flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 3, borderRadius: 26, paddingTop: 8, paddingRight: 10, paddingBottom: 8, paddingLeft: 6, shadowOffset: { width: 0, height: 5 }, shadowOpacity: 1, shadowRadius: 0, elevation: 8 },
  m: { width: 72, height: 72, marginTop: -14, marginBottom: -6 },
  l: { fontSize: 10.5, opacity: 0.75, color: '#2a1f16' },
  t: { fontSize: 19, lineHeight: 22.8, marginTop: 1, color: '#2a1f16' },
  s: { fontSize: 10.5, opacity: 0.75, marginTop: 1, color: '#2a1f16' },
  bb: { flexDirection: 'column', gap: 5 },
  btn: { borderWidth: 2, borderColor: '#4A3A2C', borderRadius: 99, paddingVertical: 4, paddingHorizontal: 10, backgroundColor: 'rgba(255,255,255,.6)', alignItems: 'center' },
  ok: { backgroundColor: '#fff', shadowColor: '#4A3A2C', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 1, shadowRadius: 0 },
  bt: { fontSize: 12, color: '#2a1f16' },
});
