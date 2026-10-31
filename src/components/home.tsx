/* 今天首页：逐项对照原型 style.css（.hdr .greet .pred .sec-t .cards6 .tl）的数值移植 */
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { router } from 'expo-router';
import { Icon, Tuan } from '@/lib/svg';
import { useApp } from '@/state/app-state';
import { BABY, CARDS, LVACC, NOW, TYPE_IC, ageText } from '@/data/mock';
import { cardVal, dur, evMeta, evTitle, fmt, leftSegs, predict, tm, totals } from '@/lib/calc';
import { hard, kindColor, Kind } from '@/theme/tokens';
import { fam, numStyle, Segs, Txt } from './txt';

export function useLvAcc() { const { night, lvl } = useApp(); return night ? ['cap'] : LVACC[lvl]; }

export function Header() {
  const { p, night, toggleNight, lvl, xp, xpMax, showToast } = useApp();
  const acc = useLvAcc();
  return (
    <View style={s.hdr}>
      <View style={[s.avatar, { backgroundColor: p.pinkS, borderColor: p.ink }]}><Icon name="baby" size={46} /></View>
      <View style={s.who}>
        <Txt f="h" size={24} style={{ lineHeight: 25.2 }}>{BABY.name}</Txt>
        <Txt f="b7" size={12.5} color={p.sub} style={{ marginTop: 3 }}>{ageText()}</Txt>
      </View>
      <Pressable onPress={() => showToast('团团成长页在后续版本接入')} style={({ pressed }) => [s.lvl, { backgroundColor: p.card, borderColor: p.ink }, pressed ? s.pressed3 : hard(p, 3)]}>
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

export function Greet() {
  const { p, night, events } = useApp();
  const T = totals(events);
  const B = (t: string | number) => <Text style={{ ...fam('b9'), color: '#E5738A' }}>{t}</Text>;
  return (
    <View style={s.greet}>
      <View style={[s.bub, { backgroundColor: p.card, borderColor: p.ink }, hard(p, 3)]}>
        <Txt f="b7" size={13.5} style={{ lineHeight: 19.575 }}>
          {night ? <>夜深啦，小声说一句就好，{B('团团')}陪你守夜～</> : <>早上好呀！{BABY.name}今天喝了 {B(T.feeds)} 顿奶，睡了 {B(dur(T.sl))} 啦</>}
        </Txt>
        <Pressable onPress={() => router.navigate('/health')} style={[s.gchg, { backgroundColor: p.blueS, borderColor: p.ink }]}>
          <Icon name="sleep" size={13} />
          <Txt f="b9" size={11.5} style={{ lineHeight: 16.7 }}>这周睡眠比上周少约 40 分钟，夜里多醒 1 次</Txt>
          <Icon name="chev" size={11} color={p.ink} />
        </Pressable>
      </View>
    </View>
  );
}

export function Pred() {
  const { p, night, events } = useApp();
  const P = predict(events);
  return (
    <View style={[s.pred, { backgroundColor: p.yellow, borderColor: p.ink }, hard(p, 5)]}>
      <View style={s.predCircle} />
      <View style={s.lab}><Icon name="clock" size={14} /><Txt f="b8" size={11.5}>{P.ongoing ? '睡眠进行中' : '下一顿预测'}</Txt></View>
      <Txt f="h" size={27} style={s.big}>
        {P.ongoing ? <>{BABY.name}<Text style={numStyle(34)}> 正在 </Text>睡觉觉</> : <Segs segs={leftSegs(P.left)} numSize={34} />}
      </Txt>
      <Txt f="b8" size={13} style={{ opacity: 0.85 }}>{P.ongoing ? `已睡 ${dur(Math.max(1, NOW - tm(P.ongoing.start)))} · 醒了说一句「醒了」就好` : `下次喂奶约 ${fmt(P.win[0])}–${fmt(P.win[1])}`}</Txt>
      <View style={s.row2}>
        <View style={s.miniP}><Icon name="sleep" size={15} /><Txt f="b8" size={11.5}>{P.ongoing ? '睡醒后约 2 小时再困' : '下次小睡 约 ' + fmt(P.nap)}</Txt></View>
      </View>
      <Txt f="b7" size={11} style={s.basis}>依据：{BABY.name}最近 7 天的喂奶间隔 · 仅供参考，按需喂养优先</Txt>
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
    <Pressable onPress={onPress} style={({ pressed }) => [s.editc, { backgroundColor: p.card, borderColor: p.ink }, pressed ? s.pressed2 : hard(p, 2)]}>
      <Icon name="pen" size={13} /><Txt f="b9" size={12}>编辑卡片</Txt>
    </Pressable>
  );
}

export function HomeCards() {
  const { p, cards, events, reminders, showToast } = useApp();
  const { width } = useWindowDimensions();
  const cw = (width - 36 - 16) / 3; /* grid-template-columns: repeat(3,1fr); gap 8 */
  const tap = (k: Kind) => {
    if (k === 'temp' || k === 'med' || k === 'symptom' || k === 'growth') router.navigate('/health');
    else showToast(`${CARDS[k].n}趋势面板在 M1 接入`);
  };
  return (
    <>
      <View style={s.cards6}>
        {cards.map(k => {
          const c = CARDS[k], v = cardVal(k, events, reminders), col = kindColor(p, k);
          return (
            <Pressable key={k} testID={`card-${k}`} onPress={() => tap(k)} style={({ pressed }) => [s.sc, { width: cw,  backgroundColor: col.ks, borderColor: p.ink }, pressed ? s.pressed4 : hard(p, 4)]}>
              <View style={[s.ic, { backgroundColor: col.k, borderColor: p.ink }]}><Icon name={c.ic} size={22} /></View>
              <Text style={[s.v, numStyle(20), { color: p.ink }]}>{v.v}<Text style={{ ...fam('b8'), fontSize: 11, lineHeight: 11, letterSpacing: 0 }}>{v.u}</Text></Text>
              <View style={s.kRow}>
                <Txt f="b8" size={11} color={p.sub} numberOfLines={1}>{v.s}</Txt>
                {v.tag ? <View style={[s.tg, { borderColor: p.ink, backgroundColor: v.tag === 'hi' ? '#FF7A92' : p.green }]}><Txt f="b9" size={9.5} color={v.tag === 'hi' ? '#fff' : p.ink} style={{ lineHeight: 15 }}>{v.tag === 'hi' ? '偏高' : '正常'}</Txt></View> : null}
              </View>
              <Pressable accessibilityLabel={`记一笔${c.n}`} hitSlop={10} onPress={() => showToast(`手动记${c.n}在 M1 接入`)} style={[s.plus, { backgroundColor: p.card, borderColor: p.ink }]}><Icon name="plus" size={12} /></Pressable>
              <View style={s.lnk}><Icon name="chev" size={11} color={p.ink} /></View>
            </Pressable>
          );
        })}
      </View>
      <View style={s.hint}><Icon name="plus" size={11} /><Txt f="b7" size={11} color={p.sub}>点「+」记一笔 · 点卡面看趋势，体温、吃药卡进健康</Txt></View>
    </>
  );
}

function Dots({ color }: { color: string }) {
  return <View style={s.dotsCol}>{Array.from({ length: 40 }, (_, i) => <View key={i} style={[s.dotDot, { backgroundColor: color }]} />)}</View>;
}

export function Timeline() {
  const { p, events, night } = useApp();
  const evs = [...events].sort((a, b) => tm(b.start) - tm(a.start) || a.id - b.id);
  return (
    <>
      <SecTitle title="今日时间线" right={<View style={[s.chip, { backgroundColor: p.card, borderColor: p.line }]}><Txt size={10.5} color={p.sub}>{events.length} 条记录</Txt></View>} />
      <View>
        {evs.map((e, i) => {
          const t = evTitle(e), col = kindColor(p, e.type), voice = e.src === 'voice';
          return (
            <View key={e.id} style={s.ti}>
              <View style={s.rail}>
                <View style={[s.dot, { backgroundColor: col.k, borderColor: p.ink }]}><Icon name={TYPE_IC[e.type]} size={24} /></View>
                <View style={{ flex: 1, alignSelf: 'stretch', marginVertical: 4, opacity: i === evs.length - 1 ? 0 : 1, overflow: 'hidden' }}><Dots color={p.line} /></View>
              </View>
              <View style={[s.body, { backgroundColor: p.card, borderColor: p.line }]}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' }}>
                    <Txt f="b9" size={14.5}><Segs segs={t.segs} numSize={15} /></Txt>
                    {t.badge ? <View style={[s.ongo, { backgroundColor: t.badge === 'hi' ? p.pink : p.blue, borderColor: p.ink }]}><Txt f="b9" size={10}>{t.badge === 'hi' ? '偏高' : '进行中'}</Txt></View> : null}
                  </View>
                  <View style={s.meta}>
                    <Txt f="b7" size={11.5} color={p.sub}>{evMeta(e)}</Txt>
                    <View style={[s.src, { backgroundColor: voice ? p.pinkS : p.bg2 }]}><Txt f="b8" size={10} color={voice ? (night ? p.pink : '#C8546B') : p.sub}>{voice ? '语音' : '手动'}</Txt></View>
                  </View>
                </View>
                <Text style={[numStyle(16), { color: p.ink, textAlign: 'right' }]}>{e.cont ? '00:00' : e.start}</Text>
              </View>
            </View>
          );
        })}
      </View>
      <Txt f="b7" size={11} color={p.sub} style={s.foot}>点上面的卡片，看近 7 天、30 天的趋势～</Txt>
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
});
