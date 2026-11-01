/* 健康页的小部件 —— 原型 v0.2/v0.4 CSS 1:1：.hcard .hct .hr .kv .vx .rm .rcat .vt .chips .segbig .hpills .sugg .sg .sgb .tipline .ringdemo .dsep .foot-note */
import { ReactNode, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, ViewStyle } from 'react-native';
import Svg, { Circle, G, Line, Path, Rect, Text as SText } from 'react-native-svg';
import { useApp } from '@/state/app-state';
import { Icon, Tuan } from '@/lib/svg';
import type { IconName, Mood } from '@/lib/art';
import { hard, Kind, KIND_KEYS, kindColor, Palette } from '@/theme/tokens';
import { fam, Txt } from '../txt';
import { DAY, md, startOfDay } from '@/lib/time';
import type { Sugg } from '@/lib/health';
import { RCAT } from '@/lib/health';
import type { RemCat } from '@/data/types';

/* 原型 body{--temp:var(--pink);--med:var(--lilac)} 与 :root{--hp} */
export const hcol = (p: Palette, night: boolean) => ({ temp: p.pink, tempS: p.pinkS, med: p.lilac, medS: p.lilacS, hp: night ? '#4A2F3A' : '#FFE3EA' });
/* .hi.temp{--temp} .hi.med{--med} .hi.visit{--sleep}，其余按记录类型色（.hi.symptom{--coral} 590 行覆盖） */
export const HI_BG = (p: Palette, k: string) => (k === 'temp' ? p.pink : k === 'med' ? p.lilac : k === 'visit' ? kindColor(p, 'sleep').k : k === 'vax' ? p.green : k in KIND_KEYS ? kindColor(p, k as Kind).k : p.yellow);

export function HCard({ children, style, tlc, testID }: { children: ReactNode; style?: ViewStyle; tlc?: boolean; testID?: string }) {
  const { p } = useApp();
  return <View testID={testID} style={[s.hcard, tlc && s.tlc, { backgroundColor: p.card, borderColor: p.ink }, hard(p, 4), style]}>{children}</View>;
}
export function Hct({ icon, t, right }: { icon: IconName; t: string; right?: ReactNode }) {
  return (
    <View style={s.hct}>
      <View style={s.hctL}><Icon name={icon} size={18} /><Txt f="b9" size={14}>{t}</Txt></View>
      {right}
    </View>
  );
}
export function HctBtn({ icon, label, onPress, testID }: { icon?: IconName; label: string; onPress: () => void; testID?: string }) {
  const { p } = useApp();
  return (
    <Pressable testID={testID} onPress={onPress} style={({ pressed }) => [s.hctBtn, { borderColor: p.ink, backgroundColor: p.bg }, pressed && { transform: [{ translateY: 1 }] }]}>
      {icon ? <Icon name={icon} size={13} /> : null}<Txt f="b9" size={11.5}>{label}</Txt>
    </Pressable>
  );
}
export function Mini({ children }: { children: ReactNode }) { const { p } = useApp(); return <Txt f="b8" size={10.5} color={p.sub}>{children}</Txt>; }
const Dash = ({ first }: { first?: boolean }) => { const { p } = useApp(); return first ? null : <View style={[s.dash, { borderColor: p.line }]} />; };

/* .hr：时间 | 彩色图标 | 标题 + 说明 */
export function HRow({ d, t, kind, icon, title, sub, first, onPress, testID }: { d: string; t: string; kind: string; icon: IconName; title: ReactNode; sub?: string; first?: boolean; onPress?: () => void; testID?: string }) {
  const { p } = useApp();
  const body = (
    <>
      <View style={s.hd}><Text style={[fam('b9'), { fontSize: 14, color: p.ink, lineHeight: 16.1 }]}>{t}</Text><Txt f="b8" size={10} color={p.sub} style={{ lineHeight: 11.5 }}>{d}</Txt></View>
      <View style={[s.hi, { backgroundColor: HI_BG(p, kind), borderColor: p.ink }]}><Icon name={icon} size={20} /></View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Txt f="b9" size={13.5}>{title}</Txt>
        {sub ? <Txt f="b7" size={11.5} color={p.sub} style={{ marginTop: 2, lineHeight: 16.7 }}>{sub}</Txt> : null}
      </View>
    </>
  );
  return (
    <View>
      <Dash first={first} />
      {onPress ? <Pressable testID={testID} onPress={onPress} style={s.hr}>{body}</Pressable> : <View testID={testID} style={s.hr}>{body}</View>}
    </View>
  );
}
/* .kv */
export function Kv({ k, v, warn, first, testID }: { k: string; v: string; warn?: boolean; first?: boolean; testID?: string }) {
  const { p } = useApp();
  return (
    <View testID={testID} style={[s.kv, !first && { borderTopWidth: 2, borderStyle: 'dashed', borderColor: p.line }]}>
      <Txt f="b8" size={12.5} color={p.sub} style={{ width: 84 }}>{k}</Txt>
      <Txt f="b8" size={12.5} color={warn ? '#D6455F' : p.ink} style={{ flex: 1, lineHeight: 18.1 }}>{v}</Txt>
    </View>
  );
}
/* .vx：疫苗 / 体检行 */
export function Vx({ done, t, sub, first, right, onPress, testID }: { done?: boolean; t: string; sub?: string; first?: boolean; right?: ReactNode; onPress?: () => void; testID?: string }) {
  const { p } = useApp();
  const body = (
    <>
      <View style={[s.vc, { borderColor: p.ink, backgroundColor: done ? p.green : p.bg2 }]}><Icon name={done ? 'check' : 'clock'} size={14} /></View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Txt f="b9" size={13.5}>{t}</Txt>
        {sub ? <Txt f="b7" size={11.5} color={p.sub} style={{ marginTop: 2, lineHeight: 16.7 }}>{sub}</Txt> : null}
      </View>
      {right}
    </>
  );
  return (
    <View>
      <Dash first={first} />
      {onPress ? <Pressable testID={testID} onPress={onPress} style={s.vx}>{body}</Pressable> : <View testID={testID} style={s.vx}>{body}</View>}
    </View>
  );
}
/* .rcat */
export function Rcat({ cat }: { cat: RemCat }) {
  const { p } = useApp();
  const c = RCAT[cat];
  return <View style={[s.rcat, { borderColor: p.ink, backgroundColor: p[c.c] }]}><Icon name={c.ic} size={16} /><Txt f="b9" size={10.5} color="#2a1f16">{c.n}</Txt></View>;
}
/* .vt / .vt.sgt 小标签 */
export function Vt({ t, sg }: { t: string; sg?: boolean }) {
  const { p, night } = useApp();
  return <Text style={[fam('b9'), s.vt, { backgroundColor: sg ? p.yellowS : p.pinkS, color: sg ? (night ? '#5C4708' : '#A27A10') : night ? p.pink : '#C8546B' }]}> {t} </Text>;
}
/* .rm：提醒行（勾选框 + 标题 + 说明 + 分类） */
export function RmRow({ done, title, tags, sub, cat, onToggle, onPress, first, testID }: { done?: boolean; title: string; tags?: ReactNode; sub: string; cat: RemCat; onToggle?: () => void; onPress?: () => void; first?: boolean; testID?: string }) {
  const { p } = useApp();
  return (
    <View>
      <Dash first={first} />
      <View style={s.rm}>
        {onToggle ? (
          <Pressable testID={testID ? `${testID}-box` : undefined} accessibilityRole="checkbox" accessibilityState={{ checked: !!done }} accessibilityLabel="完成" onPress={onToggle} style={({ pressed }) => [s.cbox, { borderColor: p.ink, backgroundColor: done ? p.green : p.bg }, pressed && { transform: [{ scale: 0.85 }] }]}>
            {done ? <Icon name="check" size={16} /> : null}
          </Pressable>
        ) : null}
        <Pressable testID={testID} onPress={onPress} disabled={!onPress} style={{ flex: 1, minWidth: 0 }}>
          <Txt f="b9" size={13.5} style={done ? { textDecorationLine: 'line-through', opacity: 0.5 } : undefined}>{title}{tags}</Txt>
          <Txt f="b7" size={11.5} color={p.sub} style={{ marginTop: 2, lineHeight: 16.7 }}>{sub}</Txt>
        </Pressable>
        <Rcat cat={cat} />
      </View>
    </View>
  );
}
export function Dsep({ children }: { children: ReactNode }) {
  const { p } = useApp();
  return <Txt f="b9" size={11.5} color={p.sub} style={[s.dsep, { borderColor: p.line }]}>{children}</Txt>;
}
/* .chips */
export function Chips<T extends string>({ opts, value, onChange, testID }: { opts: [T, string][]; value: T; onChange: (v: T) => void; testID?: string }) {
  const { p } = useApp();
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8, flexGrow: 0 }} contentContainerStyle={s.chips}>
      {opts.map(([k, t]) => (
        <Pressable key={k} testID={testID ? `${testID}-${k}` : undefined} onPress={() => onChange(k)} style={({ pressed }) => [s.chip, { borderColor: p.ink, backgroundColor: value === k ? p.yellow : p.card }, pressed ? { transform: [{ translateY: 3 }] } : hard(p, 3)]}>
          <Txt f="b9" size={12.5}>{t}</Txt>
        </Pressable>
      ))}
    </ScrollView>
  );
}
/* .segbig */
export function SegBig<T extends string>({ opts, value, onChange, k, testID }: { opts: [T, string, IconName][]; value: T; onChange: (v: T) => void; k: string; testID?: string }) {
  const { p } = useApp();
  return (
    <View style={[s.segbig, { backgroundColor: p.card, borderColor: p.ink }, hard(p, 3)]}>
      {opts.map(([v, t, ic]) => (
        <Pressable key={v} testID={testID ? `${testID}-${v}` : undefined} onPress={() => onChange(v)} style={[s.segb, value === v && { backgroundColor: k, borderWidth: 2, borderColor: p.ink }]}>
          <Icon name={ic} size={18} /><Txt f="b9" size={14}>{t}</Txt>
        </Pressable>
      ))}
    </View>
  );
}
/* .hpills */
export function HPill({ icon, t, w, testID }: { icon: IconName; t: string; w?: boolean; testID?: string }) {
  const { p, night } = useApp();
  return <View testID={testID} style={[s.hpill, { borderColor: p.ink, backgroundColor: w ? hcol(p, night).tempS : p.greenS }]}><Icon name={icon} size={14} /><Txt f="b9" size={11.5}>{t}</Txt></View>;
}
/* .tipline */
export function TipLine({ icon, children, style }: { icon: IconName; children: ReactNode; style?: ViewStyle }) {
  const { p } = useApp();
  return <View style={[s.tip, { backgroundColor: p.card, borderColor: p.line }, style]}><Icon name={icon} size={16} /><Txt f="b8" size={12} style={{ flex: 1, lineHeight: 17.4 }}>{children}</Txt></View>;
}
/* .ringdemo：虚线大按钮 */
export function DashBtn({ icon, t, sub, onPress, testID, style }: { icon: IconName; t: string; sub?: string; onPress: () => void; testID?: string; style?: ViewStyle }) {
  const { p } = useApp();
  return (
    <Pressable testID={testID} onPress={onPress} style={({ pressed }) => [s.ring, { backgroundColor: p.yellowS, borderColor: p.ink }, pressed && { transform: [{ translateY: 2 }] }, style]}>
      <View style={{ flexDirection: 'row', gap: 7, alignItems: 'center' }}><Icon name={icon} size={18} /><Txt f="b9" size={13.5}>{t}</Txt></View>
      {sub ? <Txt f="b8" size={11} color={p.sub} style={{ paddingLeft: 25, marginTop: 4 }}>{sub}</Txt> : null}
    </Pressable>
  );
}
export function FootNote({ children }: { children: ReactNode }) { const { p } = useApp(); return <Txt f="b7" size={11} color={p.sub} style={{ textAlign: 'center', marginTop: 18, lineHeight: 17.6 }}>{children}</Txt>; }

/* .sugg 团团建议框 + .sg 卡片 */
export function SuggBox({ mood, acc, sub, children, testID }: { mood: Mood; acc: string[]; sub: ReactNode; children: ReactNode; testID?: string }) {
  const { p, night } = useApp();
  return (
    <View testID={testID} style={[s.sugg, { backgroundColor: hcol(p, night).hp, borderColor: p.ink }, hard(p, 5)]}>
      <View style={s.sh}>
        <View style={{ width: 56, height: 56 }}><Tuan mood={mood} acc={acc} size={56} /></View>
        <View style={[s.bub, { backgroundColor: p.card, borderColor: p.ink }, hard(p, 3)]}>
          <Txt f="h" size={19} style={{ lineHeight: 20.9 }}>团团建议</Txt>
          <Txt f="b8" size={12} color={p.sub} style={{ marginTop: 2 }}>{sub}</Txt>
        </View>
      </View>
      {children}
      <Txt f="b8" size={10.5} color={p.sub} style={{ textAlign: 'center', marginTop: 9 }}>只根据你记下的内容整理 · 不做医疗判断，不给剂量和饮水量建议</Txt>
    </View>
  );
}
export function SgCard({ x, on, onAdd, onGone, testID }: { x: Sugg; on?: boolean; onAdd?: () => void; onGone: () => void; testID?: string }) {
  const { p, night } = useApp();
  const pink = night ? '#FF9EB1' : '#E5738A';
  return (
    <View testID={testID} style={[s.sg, { backgroundColor: on ? p.bg2 : p.card, borderColor: p.ink }, hard(p, 3), x.risk && { borderColor: '#E26D5A', borderWidth: 3 }]}>
      <View style={[s.sgIc, { backgroundColor: p[x.k], borderColor: p.ink }]}><Icon name={x.risk ? 'warn' : x.ic} size={22} /></View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Txt f="b9" size={13.5} style={{ lineHeight: 18.2 }} color={x.risk ? (night ? '#ff9d8a' : '#C9452F') : p.ink}>{x.t.map((t, i) => t.b ? <Text key={i} style={{ color: x.risk ? undefined : pink }}>{t.t}</Text> : <Text key={i}>{t.t}</Text>)}</Txt>
        <Txt f="b7" size={11} color={p.sub} style={{ lineHeight: 16, marginTop: 2 }}>{x.s}</Txt>
        <View style={s.sgb}>
          {on ? (
            <View style={[s.sgOk, { backgroundColor: p.green, borderColor: p.ink }]}><Icon name="check" size={13} /><Txt f="b9" size={12} color={night ? '#203826' : '#2D5A36'}>已加入提醒</Txt></View>
          ) : onAdd ? (
            <Pressable testID={testID ? `${testID}-add` : undefined} onPress={onAdd} style={({ pressed }) => [s.sgBtn, { backgroundColor: p.yellow, borderColor: p.ink }, pressed ? { transform: [{ translateY: 2 }] } : hard(p, 2)]}>
              <Icon name={x.action === 'summary' ? 'doc' : 'clock'} size={13} /><Txt f="b9" size={11.5} color={night ? '#2B2230' : '#4A3A2C'}>{x.btn || '加入提醒'}</Txt>
            </Pressable>
          ) : null}
          <Pressable testID={testID ? `${testID}-no` : undefined} onPress={onGone} style={({ pressed }) => [s.sgBtn, { backgroundColor: p.card, borderColor: p.ink }, pressed ? { transform: [{ translateY: 2 }] } : hard(p, 2)]}>
            <Txt f="b9" size={11.5} color={p.sub}>知道了</Txt>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

/* —— 体温曲线（原型 tempCurve() 的 340×136 画布，换成真实记录）—— */
export type CurvePt = { at: Date; v: number };
export function TempCurve({ pts, meds, syms, start, end, testID }: { pts: CurvePt[]; meds: Date[]; syms: { at: Date; t: string }[]; start: Date; end: Date; testID?: string }) {
  const { p, night } = useApp();
  const [w, setW] = useState(0);
  const c = hcol(p, night);
  const d0 = startOfDay(start).getTime();
  const D = Math.max(2, Math.round((startOfDay(end).getTime() - d0) / DAY) + 1);
  const span = (D - 1) * 24;
  const X = (t: Date) => 34 + ((t.getTime() - d0) / 3600000 - 12) / span * 290;
  const Y = (v: number) => 104 - (Math.min(39.8, Math.max(35.6, v)) - 36.5) / 3 * 86;
  const xy = pts.map(q => [X(q.at), Y(q.v)] as const);
  let d = '';
  if (xy.length) { d = `M${xy[0][0]} ${xy[0][1]}`; for (let i = 1; i < xy.length; i++) { const [x0, y0] = xy[i - 1], [x1, y1] = xy[i], cx = (x0 + x1) / 2; d += ` C${cx} ${y0} ${cx} ${y1} ${x1} ${y1}`; } }
  const mi = pts.length ? pts.reduce((a, q, i) => (q.v > pts[a].v ? i : a), 0) : -1;
  const near = (t: Date) => { if (!pts.length) return 37; const q = pts.reduce((a, b) => (Math.abs(+b.at - +t) < Math.abs(+a.at - +t) ? b : a)); return q.v; };
  const every = Math.ceil(D / 7);
  const nf = { fontFamily: night ? 'Nunito_900Black' : 'Nunito_900Black' };
  return (
    <View testID={testID} onLayout={e => setW(e.nativeEvent.layout.width)} style={{ marginTop: 4 }}>
      {w ? (
        <Svg width={w} height={w * 136 / 340} viewBox="0 0 340 136">
          <Line x1="30" x2="330" y1={Y(37.3)} y2={Y(37.3)} stroke={p.sub} strokeWidth="1.5" strokeDasharray="4 5" opacity={0.6} />
          <SText x="332" y={Y(37.3) - 4} textAnchor="end" fill={p.sub} fontSize="9" fontWeight="800" {...nf}>37.3℃</SText>
          {xy.length > 1 ? <>
            <Path d={`${d} L${xy[xy.length - 1][0]} 104 L${xy[0][0]} 104Z`} fill={c.temp} opacity={0.22} />
            <Path d={d} fill="none" stroke={c.temp} strokeWidth="5" strokeLinecap="round" />
            <Path d={d} fill="none" stroke={p.ink} strokeWidth="1.6" strokeLinecap="round" opacity={0.55} />
          </> : null}
          {pts.map((q, i) => <Circle key={i} cx={xy[i][0]} cy={xy[i][1]} r={q.v >= 37.5 ? 5 : 4} fill={q.v >= 37.5 ? c.temp : p.green} stroke={p.ink} strokeWidth="2" />)}
          {mi >= 0 ? <SText x={xy[mi][0]} y={xy[mi][1] - 10} textAnchor="middle" fill={p.ink} fontSize="11" fontWeight="900" {...nf}>{`${pts[mi].v.toFixed(1)}℃`}</SText> : null}
          {meds.map((m, i) => <G key={i} transform={`translate(${X(m) - 7} 108)`}><Rect width="14" height="7" rx="3.5" fill={c.med} stroke={p.ink} strokeWidth="1.5" /></G>)}
          {syms.map((x, i) => <G key={i} transform={`translate(${X(x.at)} ${Y(near(x.at)) + 12})`}><Rect x="-15" y="0" width="30" height="15" rx="7.5" fill={p.card} stroke={p.ink} strokeWidth="1.5" /><SText y="11" textAnchor="middle" fill={p.ink} fontSize="9" fontWeight="900">{x.t}</SText></G>)}
          {Array.from({ length: D }, (_, i) => i).filter(i => i % every === 0).map(i => (
            <SText key={i} x={34 + (i * 24) / span * 290} y="131" textAnchor="middle" fill={p.sub} fontSize="9.5" fontWeight="900" {...nf}>{md(new Date(d0 + i * DAY))}</SText>
          ))}
        </Svg>
      ) : <View style={{ aspectRatio: 340 / 136 }} />}
    </View>
  );
}

const s = StyleSheet.create({
  hcard: { borderWidth: 2.5, borderRadius: 24, paddingVertical: 12, paddingHorizontal: 13, marginTop: 12 },
  tlc: { paddingVertical: 6, paddingHorizontal: 12 },
  hct: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  hctL: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  hctBtn: { flexDirection: 'row', gap: 4, alignItems: 'center', borderWidth: 2, borderRadius: 99, paddingVertical: 3, paddingHorizontal: 9 },
  dash: { borderTopWidth: 2, borderStyle: 'dashed' },
  hr: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', paddingVertical: 9 },
  hd: { width: 44, alignItems: 'flex-end' },
  hi: { width: 34, height: 34, borderRadius: 12, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  kv: { flexDirection: 'row', gap: 10, paddingVertical: 8 },
  vx: { flexDirection: 'row', gap: 10, alignItems: 'center', paddingVertical: 8 },
  vc: { width: 28, height: 28, borderRadius: 14, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  rm: { flexDirection: 'row', gap: 10, alignItems: 'center', paddingVertical: 9 },
  cbox: { width: 30, height: 30, borderRadius: 11, borderWidth: 2.5, alignItems: 'center', justifyContent: 'center' },
  rcat: { flexDirection: 'row', gap: 3, alignItems: 'center', borderWidth: 1.5, borderRadius: 99, paddingTop: 2, paddingBottom: 2, paddingLeft: 4, paddingRight: 7 },
  vt: { fontSize: 9.5, borderRadius: 99, overflow: 'hidden' },
  dsep: { marginTop: 10, marginHorizontal: 4, marginBottom: 2, paddingTop: 8, borderTopWidth: 2, borderStyle: 'dashed' },
  chips: { flexDirection: 'row', gap: 7, paddingTop: 2, paddingHorizontal: 2, paddingBottom: 8 },
  chip: { borderWidth: 2.5, borderRadius: 99, paddingVertical: 6, paddingHorizontal: 12 },
  segbig: { flexDirection: 'row', borderWidth: 2.5, borderRadius: 99, padding: 4, marginTop: 20 },
  segb: { flex: 1, height: 38, borderRadius: 99, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5 },
  hpill: { flexDirection: 'row', gap: 4, alignItems: 'center', borderWidth: 2, borderRadius: 99, paddingVertical: 3, paddingHorizontal: 9 },
  tip: { flexDirection: 'row', gap: 7, alignItems: 'center', borderWidth: 2, borderStyle: 'dashed', borderRadius: 16, paddingVertical: 8, paddingHorizontal: 11, marginTop: 10, marginBottom: 6 },
  ring: { width: '100%', marginTop: 12, borderWidth: 2.5, borderStyle: 'dashed', borderRadius: 20, paddingVertical: 10, paddingHorizontal: 12 },
  sugg: { marginTop: 16, borderWidth: 3, borderRadius: 28, paddingTop: 12, paddingHorizontal: 12, paddingBottom: 10 },
  sh: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  bub: { flex: 1, borderWidth: 2.5, borderTopLeftRadius: 18, borderTopRightRadius: 18, borderBottomRightRadius: 18, borderBottomLeftRadius: 6, paddingVertical: 7, paddingHorizontal: 12 },
  sg: { flexDirection: 'row', gap: 9, borderWidth: 2.5, borderRadius: 22, paddingVertical: 9, paddingHorizontal: 11, marginTop: 8 },
  sgIc: { width: 34, height: 34, borderRadius: 12, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  sgb: { flexDirection: 'row', gap: 7, marginTop: 6, alignItems: 'center' },
  sgBtn: { flexDirection: 'row', gap: 4, alignItems: 'center', borderWidth: 2, borderRadius: 99, paddingVertical: 4, paddingHorizontal: 10 },
  sgOk: { flexDirection: 'row', gap: 4, alignItems: 'center', borderWidth: 2, borderRadius: 99, paddingVertical: 4, paddingHorizontal: 10 },
});
