/* 今天首页：逐项对照原型 style.css（.hdr .greet .pred .sec-t .cards6 .tl）的数值移植；数据来自本机记录 */
import { useMemo, useState } from 'react';
import { Animated, PanResponder, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { router } from 'expo-router';
import { Icon, Tuan } from '@/lib/svg';
import { useApp } from '@/state/app-state';
import { CARDS, TYPE_IC } from '@/data/mock';
import { cardVal, dayEvs, dur, Ev, evMeta, evTitle, fmt, leftSegs, predict, tm, totals } from '@/lib/calc';
import { addDays, ageText, minOf, startOfDay } from '@/lib/time';
import type { AvatarKey } from '@/data/types';
import { hard, Kind, kindColor } from '@/theme/tokens';
import { ConfirmSheet, ConfirmOpts } from './confirm';
import { fam, numStyle, Segs, Txt } from './txt';

import { useLvAcc } from '@/state/hooks';
export { useLvAcc };

/* 头像：内置选项（原型 ic.baby + 团团配件） */
export const AVATARS: { k: AvatarKey; n: string }[] = [
  { k: 'baby', n: '宝宝脸' }, { k: 'sprout', n: '冒芽团子' }, { k: 'flower', n: '开花团子' }, { k: 'crown', n: '皇冠团子' }, { k: 'cap', n: '睡帽团子' }, { k: 'bottle', n: '奶瓶团子' },
];
export function BabyAvatar({ k, size }: { k?: AvatarKey; size: number }) {
  if (!k || k === 'baby') return <Icon name="baby" size={size} />;
  return <Tuan mood="happy" acc={[k]} size={size * 1.12} />;
}

export function Header() {
  const { p, night, toggleNight, lvl, xp, xpMax, baby, now } = useApp();
  const acc = useLvAcc();
  return (
    <View style={s.hdr}>
      <Pressable onPress={() => router.navigate('/me')} style={[s.avatar, { backgroundColor: p.pinkS, borderColor: p.ink }]}><BabyAvatar k={baby?.avatar} size={46} /></Pressable>
      <View style={s.who}>
        <Txt f="h" size={24} style={{ lineHeight: 25.2 }} numberOfLines={1}>{baby?.name}</Txt>
        <Txt f="b7" size={12.5} color={p.sub} style={{ marginTop: 3 }}>{baby ? ageText(baby.birthday, now) : ''}</Txt>
      </View>
      <Pressable testID="lvl" onPress={() => router.navigate('/me')} style={({ pressed }) => [s.lvl, { backgroundColor: p.card, borderColor: p.ink }, pressed ? s.pressed3 : hard(p, 3)]}>
        <Tuan mood="happy" acc={acc} size={28} />
        <View>
          <Txt f="b8" size={11} style={{ lineHeight: 12.1 }}>团团 Lv.{lvl}</Txt>
          <View style={[s.bar, { backgroundColor: p.line }]}><View style={{ width: `${(xp / xpMax) * 100}%`, height: '100%', backgroundColor: p.green, borderRadius: 9 }} /></View>
        </View>
      </Pressable>
      <Pressable onPress={toggleNight} accessibilityLabel="夜间模式" style={({ pressed }) => [s.iconbtn, { backgroundColor: p.card, borderColor: p.ink }, pressed ? s.pressed3 : hard(p, 3)]}>
        <Icon name={night ? 'sun' : 'moon'} size={22} />
      </Pressable>
    </View>
  );
}

const hello = (h: number) => h < 5 ? '夜里辛苦啦' : h < 11 ? '早上好呀' : h < 13 ? '中午好呀' : h < 18 ? '下午好呀' : '晚上好呀';
/** 这周（近 6 天）vs 上周（7–13 天前）日均睡眠 —— 原型 .gchg 文案 */
function useSleepWeek() {
  const { records, now } = useApp();
  return useMemo(() => {
    const day = (i: number) => totals(dayEvs(records, addDays(startOfDay(now), -i)), 1440).sl;
    const a = [1, 2, 3, 4, 5, 6].map(day).filter(v => v > 0), b = [7, 8, 9, 10, 11, 12, 13].map(day).filter(v => v > 0);
    if (!a.length) return null;
    const avgA = a.reduce((x, y) => x + y, 0) / a.length;
    if (!b.length) return `近 ${a.length} 天日均睡眠 ${(avgA / 60).toFixed(1)} 小时`;
    const d = Math.round((avgA - b.reduce((x, y) => x + y, 0) / b.length) / 10) * 10;
    return Math.abs(d) < 10 ? '这周睡眠和上周差不多' : `这周睡眠比上周${d < 0 ? '少' : '多'}约 ${Math.abs(d)} 分钟`;
  }, [records, now]);
}

export function Greet() {
  const { p, night, events, baby, now, openTrend } = useApp();
  const T = totals(events, minOf(now));
  const wk = useSleepWeek();
  const B = (t: string | number) => <Text style={{ ...fam('b9'), color: '#E5738A' }}>{t}</Text>;
  return (
    <View style={s.greet}>
      <View style={[s.bub, { backgroundColor: p.card, borderColor: p.ink }, hard(p, 3)]}>
        <Txt f="b7" size={13.5} style={{ lineHeight: 19.575 }} testID="greet">
          {night ? <>夜深啦，小声说一句就好，{B('团团')}陪你守夜～</> : <>{hello(now.getHours())}！{baby?.name}今天喝了 {B(T.feeds)} 顿奶，睡了 {B(dur(T.sl))} 啦</>}
        </Txt>
        {wk ? (
          <Pressable onPress={() => openTrend('sleep')} style={[s.gchg, { backgroundColor: p.blueS, borderColor: p.ink }]}>
            <Icon name="sleep" size={13} />
            <Txt f="b9" size={11.5} style={{ lineHeight: 16.7 }}>{wk}</Txt>
            <Icon name="chev" size={11} color={p.ink} />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

export function Pred() {
  const { p, night, events, records, now, baby } = useApp();
  const P = predict(records, events, now), nowMin = minOf(now);
  /* 原型 97/104/106：夜间 .pred 文字固定深色、胶囊底 rgba(0,0,0,.18) */
  const c = night ? '#2a1f16' : p.ink, chipBg = night ? { backgroundColor: 'rgba(0,0,0,.18)' } : null;
  return (
    <View testID="pred" style={[s.pred, { backgroundColor: p.yellow, borderColor: p.ink }, hard(p, 5)]}>
      <View style={s.predCircle} />
      <View style={[s.lab, chipBg]}><Icon name="clock" size={14} color={c} /><Txt f="b8" size={11.5} color={c}>{P.ongoing ? '睡眠进行中' : '下一顿预测'}</Txt></View>
      <Txt f="h" size={27} color={c} style={s.big}>
        {P.ongoing ? <>{baby?.name}<Text style={numStyle(34)}> 正在 </Text>睡觉觉</> : P.hasFeed ? <Segs segs={leftSegs(P.left)} numSize={34} /> : <>记一顿奶就能预测</>}
      </Txt>
      <Txt f="b8" size={13} color={c} style={{ opacity: 0.85 }}>{P.ongoing ? `已睡 ${dur(Math.max(1, nowMin - tm(P.ongoing.start)))} · 醒了点一下记录改结束时间` : P.hasFeed ? `下次喂奶约 ${fmt(P.win[0])}–${fmt(P.win[1])}` : '点「喂奶」卡片右上角的 +'}</Txt>
      <View style={s.row2}>
        <View style={[s.miniP, chipBg]}><Icon name="sleep" size={15} color={c} /><Txt f="b8" size={11.5} color={c}>{P.ongoing ? '睡醒后约 2 小时再困' : '下次小睡 约 ' + fmt(P.nap)}</Txt></View>
      </View>
      <Txt f="b7" size={11} color={c} style={s.basis}>依据：{baby?.name}最近 7 天的喂奶间隔{P.enough ? '' : '（记录还少，先按 3 小时 20 分）'} · 仅供参考，按需喂养优先</Txt>
      <View style={s.mascot} pointerEvents="none"><Tuan mood={night ? 'drowsy' : 'idle'} acc={night ? ['clock', 'cap'] : ['clock', 'sprout']} size={122} /></View>
    </View>
  );
}

export function SecTitle({ title, right }: { title: string; right?: React.ReactNode }) {
  return <View style={s.secT}><Txt f="h" size={20}>{title}</Txt>{right}</View>;
}

export function EditBtn({ onPress }: { onPress: () => void }) {
  const { p } = useApp();
  return (
    <Pressable testID="edit-cards" onPress={onPress} style={({ pressed }) => [s.editc, { backgroundColor: p.card, borderColor: p.ink }, pressed ? s.pressed2 : hard(p, 2)]}>
      <Icon name="pen" size={13} /><Txt f="b9" size={12}>编辑卡片</Txt>
    </Pressable>
  );
}

export function HomeCards() {
  const { p, night, cards, events, reminders, records, now, openRecord, openTrend, goHealth } = useApp();
  /* 原型 DETAIL：体温 / 吃药 / 症状卡进「健康 · 病程」，身高体重进「健康 · 疫苗体检」，其余看趋势 */
  const tap = (k: Kind) => (k === 'temp' || k === 'med' || k === 'symptom' ? goHealth('ill', 'ill') : k === 'growth' ? goHealth('ill', 'vax') : openTrend(k));
  const { width } = useWindowDimensions();
  const cw = (width - 36 - 16) / 3; /* grid-template-columns: repeat(3,1fr); gap 8 */
  return (
    <>
      <View style={s.cards6}>
        {cards.map(k => {
          const c = CARDS[k], v = cardVal(k, events, reminders, records, now), col = kindColor(p, k);
          return (
            <Pressable key={k} testID={`card-${k}`} onPress={() => tap(k)} style={({ pressed }) => [s.sc, { width: cw,  backgroundColor: col.ks, borderColor: p.ink }, pressed ? s.pressed4 : hard(p, 4)]}>
              <View style={[s.ic, { backgroundColor: col.k, borderColor: p.ink }]}><Icon name={c.ic} size={22} /></View>
              <Text testID={`card-${k}-v`} style={[s.v, numStyle(20), { color: p.ink }]}>{v.v}<Text style={{ ...fam('b8'), fontSize: 11, lineHeight: 11, letterSpacing: 0 }}>{v.u}</Text></Text>
              <View style={s.kRow}>
                <Txt f="b8" size={11} color={p.sub} numberOfLines={1} testID={`card-${k}-s`}>{v.s}</Txt>
                {v.tag ? <View style={[s.tg, { borderColor: p.ink, backgroundColor: v.tag === 'hi' ? '#FF7A92' : p.green }]}><Txt f="b9" size={9.5} color={v.tag === 'hi' ? '#fff' : p.ink} style={{ lineHeight: 15 }}>{v.tag === 'hi' ? '偏高' : '正常'}</Txt></View> : null}
              </View>
              <Pressable testID={`plus-${k}`} accessibilityLabel={`记一笔${c.n}`} hitSlop={10} onPress={() => openRecord(k)} style={[s.plus, { backgroundColor: night ? col.k : p.card, borderColor: p.ink }]}><Icon name="plus" size={12} /></Pressable>
              <View style={s.lnk}><Icon name="chev" size={11} color={p.ink} /></View>
            </Pressable>
          );
        })}
      </View>
      <View testID="hint" style={s.hint}><Icon name="plus" size={11} /><Txt f="b7" size={11} color={p.sub}>点「+」记一笔 · 点卡面看趋势 · 时间线左滑可删除</Txt></View>
    </>
  );
}

function Dots({ color }: { color: string }) {
  return <View style={s.dotsCol}>{Array.from({ length: 40 }, (_, i) => <View key={i} style={[s.dotDot, { backgroundColor: color }]} />)}</View>;
}

/* 左滑露出「删除」，点卡片编辑 */
function SwipeRow({ e, children, onDelete, onOpen }: { e: Ev; children: React.ReactNode; onDelete: () => void; onOpen: () => void }) {
  const { p } = useApp();
  const [x] = useState(() => new Animated.Value(0));
  const [isOpen, setIsOpen] = useState(false);
  /* 拖动松手后浏览器还会补一个 click，用时间戳吞掉它 */
  const [drag] = useState(() => ({ at: 0 }));
  const [pan] = useState(() => PanResponder.create({
    onMoveShouldSetPanResponderCapture: (_, g) => Math.abs(g.dx) > 8 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
    onPanResponderGrant: () => x.extractOffset(),
    onPanResponderMove: (_, g) => x.setValue(g.dx),
    onPanResponderRelease: () => {
      drag.at = Date.now();
      x.flattenOffset();
      x.stopAnimation(v => {
        const to = v < -40 ? -80 : 0; setIsOpen(to !== 0);
        Animated.spring(x, { toValue: to, useNativeDriver: false, bounciness: 6 }).start();
      });
    },
    onPanResponderTerminationRequest: () => false,
  }));
  const tx = x.interpolate({ inputRange: [-90, 0], outputRange: [-90, 0], extrapolate: 'clamp' });
  const close = () => { setIsOpen(false); Animated.spring(x, { toValue: 0, useNativeDriver: false }).start(); };
  return (
    <View style={s.swipeWrap}>
      <Pressable testID={`tl-del-${e.id}`} accessibilityLabel="删除" onPress={() => { close(); onDelete(); }} style={[s.del, { backgroundColor: p.pink, borderColor: p.ink }]}>
        <Icon name="x" size={16} /><Txt f="b9" size={12}>删除</Txt>
      </Pressable>
      <Animated.View {...pan.panHandlers} style={{ transform: [{ translateX: tx }] }}>
        <Pressable testID={`tl-${e.id}`} onPress={() => { if (Date.now() - drag.at < 400) return; if (isOpen) close(); else onOpen(); }}>{children}</Pressable>
      </Animated.View>
    </View>
  );
}

export function Timeline() {
  const { p, events, night, openRecord, deleteRecord, showToast } = useApp();
  const [confirm, setConfirm] = useState<ConfirmOpts | null>(null);
  const evs = [...events].sort((a, b) => tm(b.start) - tm(a.start) || a.rec.createdAt.localeCompare(b.rec.createdAt));
  return (
    <>
      <SecTitle title="今日时间线" right={<View style={[s.chip, { backgroundColor: p.card, borderColor: p.line }]}><Txt size={10.5} color={p.sub} testID="tl-count">{events.length} 条记录</Txt></View>} />
      <View>
        {evs.length ? null : <Txt f="b8" size={12} color={p.sub} style={{ textAlign: 'center', marginVertical: 12 }}>今天还没有记录，点上面卡片的「+」记第一条吧</Txt>}
        {evs.map((e, i) => {
          const t = evTitle(e), col = kindColor(p, e.type), voice = e.src === 'voice';
          return (
            <View key={e.id} style={s.ti}>
              <View style={s.rail}>
                <View style={[s.dot, { backgroundColor: col.k, borderColor: p.ink }]}><Icon name={TYPE_IC[e.type]} size={24} /></View>
                <View style={{ flex: 1, alignSelf: 'stretch', marginVertical: 4, opacity: i === evs.length - 1 ? 0 : 1, overflow: 'hidden' }}><Dots color={p.line} /></View>
              </View>
              <SwipeRow e={e} onOpen={() => openRecord(e.type, e.rec)}
                onDelete={() => setConfirm({ t: '要删掉这条吗？', sub: `${t.segs.map(x => x.t).join('')} · ${e.start}`, ok: '删除', note: '删掉后首页数字和趋势会一起更新', onOk: async () => { await deleteRecord(e.id); showToast('已删除这条记录'); } })}>
                <View style={[s.body, { backgroundColor: p.card, borderColor: p.line, marginBottom: 0 }]}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' }}>
                      <Txt f="b9" size={14.5}><Segs segs={t.segs} numSize={15} /></Txt>
                      {t.badge ? <View style={[s.ongo, { backgroundColor: t.badge === 'hi' ? p.pink : p.blue, borderColor: p.ink }]}><Txt f="b9" size={10}>{t.badge === 'hi' ? '偏高' : '进行中'}</Txt></View> : null}
                    </View>
                    <View style={s.meta}>
                      <Txt f="b7" size={11.5} color={p.sub}>{evMeta(e)}{e.note ? ` · ${e.note}` : ''}</Txt>
                      <View style={[s.src, { backgroundColor: voice ? p.pinkS : p.bg2 }]}><Txt f="b8" size={10} color={voice ? (night ? p.pink : '#C8546B') : p.sub}>{voice ? '语音' : '手动'}</Txt></View>
                    </View>
                  </View>
                  <Text style={[numStyle(16), { color: p.ink, textAlign: 'right' }]}>{e.cont ? '00:00' : e.start}</Text>
                </View>
              </SwipeRow>
            </View>
          );
        })}
      </View>
      <Txt f="b7" size={11} color={p.sub} style={s.foot}>点上面的卡片，看近 7 天、30 天的趋势～</Txt>
      <ConfirmSheet c={confirm} onClose={() => setConfirm(null)} />
    </>
  );
}

const s = StyleSheet.create({
  pressed2: { transform: [{ translateY: 2 }] }, pressed3: { transform: [{ translateY: 3 }] }, pressed4: { transform: [{ translateY: 4 }] },
  hdr: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  avatar: { width: 50, height: 50, borderRadius: 18, borderWidth: 3, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  who: { flex: 1, minWidth: 0 },
  lvl: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 2.5, borderRadius: 99, paddingTop: 3, paddingBottom: 3, paddingRight: 10, paddingLeft: 4 },
  bar: { width: 44, height: 6, borderRadius: 9, overflow: 'hidden', marginTop: 2 },
  iconbtn: { width: 42, height: 42, borderRadius: 15, borderWidth: 2.5, alignItems: 'center', justifyContent: 'center' },
  greet: { flexDirection: 'row', alignItems: 'flex-end', gap: 6, marginTop: 10 },
  bub: { flexShrink: 1, borderWidth: 2.5, borderTopLeftRadius: 20, borderTopRightRadius: 20, borderBottomRightRadius: 20, borderBottomLeftRadius: 6, paddingVertical: 9, paddingHorizontal: 13 },
  gchg: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6, borderWidth: 2, borderRadius: 99, paddingVertical: 3, paddingHorizontal: 9, alignSelf: 'flex-start' },
  pred: { position: 'relative', marginTop: 10, borderWidth: 3, borderRadius: 28, paddingTop: 12, paddingRight: 14, paddingBottom: 11, paddingLeft: 16, overflow: 'hidden' },
  predCircle: { position: 'absolute', right: -30, top: -40, width: 170, height: 170, borderRadius: 85, backgroundColor: 'rgba(255,255,255,.35)' },
  lab: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(255,255,255,.65)', borderRadius: 99, paddingVertical: 3, paddingHorizontal: 9 },
  big: { marginTop: 7.5, marginBottom: 1, lineHeight: 39.1 },
  row2: { flexDirection: 'row', gap: 8, marginTop: 8 },
  miniP: { flexDirection: 'row', gap: 6, alignItems: 'center', backgroundColor: 'rgba(255,255,255,.7)', borderRadius: 14, paddingVertical: 6, paddingHorizontal: 10 },
  basis: { marginTop: 6, opacity: 0.75, maxWidth: '60%' },
  mascot: { position: 'absolute', right: 2, bottom: -4, width: 122, height: 122 },
  secT: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 14, marginHorizontal: 4, marginBottom: 8 },
  editc: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 2, borderRadius: 99, paddingTop: 3, paddingBottom: 3, paddingRight: 11, paddingLeft: 9 },
  cards6: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  sc: { minHeight: 96, borderWidth: 2.5, borderRadius: 24, paddingTop: 11, paddingHorizontal: 11, paddingBottom: 10 },
  ic: { width: 34, height: 34, borderRadius: 12, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  v: { marginTop: 7, lineHeight: 20 },
  kRow: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 3, overflow: 'hidden' },
  tg: { borderWidth: 1.5, borderRadius: 99, paddingHorizontal: 5 },
  plus: { position: 'absolute', right: 8, top: 8, width: 26, height: 26, borderRadius: 13, borderWidth: 2, alignItems: 'center', justifyContent: 'center', zIndex: 2 },
  lnk: { position: 'absolute', right: 9, bottom: 9, opacity: 0.55 },
  hint: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 8, marginHorizontal: 4 },
  chip: { borderWidth: 1.5, borderRadius: 99, paddingVertical: 2, paddingHorizontal: 8 },
  ti: { flexDirection: 'row', gap: 12, alignItems: 'stretch' },
  rail: { width: 46, alignItems: 'center' },
  dot: { width: 44, height: 44, borderRadius: 16, borderWidth: 2.5, alignItems: 'center', justifyContent: 'center' },
  dotsCol: { position: 'absolute', top: 0, left: 0, right: 0, alignItems: 'center', gap: 3 },
  dotDot: { width: 3, height: 3 }, /* Chrome 的 3px dotted 画成方点 */
  body: { flex: 1, borderWidth: 2, borderRadius: 20, paddingVertical: 10, paddingHorizontal: 13, marginBottom: 10, flexDirection: 'row', alignItems: 'center', gap: 10 },
  meta: { flexDirection: 'row', gap: 6, alignItems: 'center', flexWrap: 'wrap', marginTop: 2 },
  src: { borderRadius: 99, paddingVertical: 1, paddingHorizontal: 7 },
  ongo: { borderWidth: 1.5, borderRadius: 99, paddingVertical: 1, paddingHorizontal: 7, marginLeft: 4 },
  foot: { textAlign: 'center', marginTop: 18, lineHeight: 17.6 },
  swipeWrap: { flex: 1, marginBottom: 10 },
  del: { position: 'absolute', right: 0, top: 0, bottom: 0, width: 72, borderWidth: 2.5, borderRadius: 20, alignItems: 'center', justifyContent: 'center', gap: 2 },
});
