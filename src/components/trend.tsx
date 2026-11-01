/* 卡片趋势面板 —— 原型 app7 renderTrend()/chartHTML() + .trh .chartcard .range .bars .bcol .hcard .hr .note-desc */
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import Svg, { Defs, Pattern, Rect } from 'react-native-svg';
import { useApp } from '@/state/app-state';
import { Icon, Tuan } from '@/lib/svg';
import { CARDS, TYPE_IC } from '@/data/mock';
import { dayEvs, dayValue, evMeta, evTitle, kindRows, METRIC, rangeAvg, statsStart } from '@/lib/calc';
import { addDays, md, minOf, startOfDay, WK } from '@/lib/time';
import { hard, Kind, kindColor } from '@/theme/tokens';
import { useLvAcc } from '@/state/hooks';
import { fam, Segs, Txt } from './txt';
import { Actions, Btn, HGroup, Sheet } from './ui';

const H = 130;
export function TrendSheet() {
  const { trend, openTrend } = useApp();
  return <Sheet open={!!trend} onClose={() => openTrend(null)} maxH="86%" testID="trend-sheet">{trend ? <Body k={trend} key={trend} /> : null}</Sheet>;
}

function Body({ k }: { k: Kind }) {
  const { p, records, now, baby, events, night, settings, openTrend, openRecord } = useApp();
  const lv = useLvAcc();
  const [r, setR] = useState<7 | 30>(7);
  const M = METRIC[k], c = CARDS[k], col = kindColor(p, k);
  const acc = (() => { const a = c.acc.filter(x => x !== 'cap'); return night ? [...a, 'cap'] : (a.length ? a : lv); })();
  const today = startOfDay(now);
  /* 统计起点：这类记录的第一条 与 开始使用这天 取更早者；更早的天不画柱、不计入日均 */
  const start = useMemo(() => { const t = k === 'pee' || k === 'poop' ? 'diaper' : k; return statsStart(records.filter(x => x.type === t), settings.consentAt); }, [records, settings.consentAt, k]);
  const series = useMemo(() => {
    const day = (i: number) => addDays(today, -i);
    const val = (i: number) => (start && day(i) < start ? null : dayValue(k, dayEvs(records, day(i)), i === 0 ? minOf(now) : 1440));
    const vals = Array.from({ length: r }, (_, j) => val(r - 1 - j));
    const prev = Array.from({ length: r }, (_, j) => val(2 * r - 1 - j));
    const days = Array.from({ length: r }, (_, j) => day(r - 1 - j));
    const pdays = Array.from({ length: r }, (_, j) => day(2 * r - 1 - j));
    return { vals, prev, days, pdays };
  }, [k, r, records, now, today, start]);
  const { vals, prev, days, pdays } = series;
  const base = k === 'temp' ? 35 : 0;
  /* 范围内没记录的天按 0 计（体温 / 体重除外），起点之前的天不计 */
  const avgN = rangeAvg(k, vals, days, start, today), pavg = rangeAvg(k, prev, pdays, start, today);
  const avg = avgN ?? 0;
  const full = vals.slice(0, -1).filter((v): v is number => v !== null && v > 0);
  const max = (Math.max(...vals.map(v => (v ?? base) - base), 1)) * 1.12;
  const maxI = full.length ? vals.slice(0, -1).indexOf(Math.max(...full)) : -1;
  const show = (v: number | null) => v === null ? '—' : M.dec ? v.toFixed(M.dec) : String(Math.round(v));
  /* 次数类日均可能是小数（隔天洗澡 = 0.5 次），保留 1 位 */
  const fmtAvg = (v: number) => (M.dec ? v.toFixed(M.dec) : v < 10 && !Number.isInteger(v) ? v.toFixed(1) : String(Math.round(v)));
  const avgTxt = avgN === null ? '—' : fmtAvg(avg);
  const label = (i: number) => {
    if (i === vals.length - 1) return '今天';
    const d = addDays(today, -(vals.length - 1 - i));
    return r === 7 ? WK[d.getDay()] : (i % 7 === 1 ? md(d) : '');
  };
  const period = r === 7 ? '上周' : '上个 30 天';
  const cmp = (() => {
    if (avgN === null) return '还没有满一天的记录';
    if (pavg === null) return `${period}还没有记录`;
    const lastTxt = `${period}日均 ${fmtAvg(pavg)} ${M.u}`;
    const d = avg - pavg;
    if (Math.abs(d) < Math.max(0.05 * pavg, M.dec ? 0.1 : pavg < 10 ? 0.1 : 1)) return `${lastTxt} · 和${period}基本持平`;
    if (k === 'sleep') return `${lastTxt} · 比${period}${d < 0 ? '少' : '多'}约 ${Math.round(Math.abs(d) * 60 / 10) * 10} 分钟`;
    return `${lastTxt} · 比${period}${d < 0 ? '少' : '多'} ${fmtAvg(Math.abs(d))} ${M.u}`;
  })();
  const rows = kindRows(k, events);
  const thin = r === 30;
  return (
    <>
      <View style={s.trh}>
        <View style={[s.trIc, { backgroundColor: col.k, borderColor: p.ink }]}><Icon name={c.ic} size={24} /></View>
        <View style={{ flex: 1 }}>
          <Txt f="h" size={22} style={{ lineHeight: 24.2 }}>{c.n} · 趋势</Txt>
          <Txt f="b8" size={11.5} color={p.sub}>{baby?.name}近 {r} 天 · 本机记录</Txt>
        </View>
        <Pressable onPress={() => openTrend(null)} accessibilityLabel="关闭" style={({ pressed }) => [s.iconbtn, { backgroundColor: p.card, borderColor: p.ink }, pressed ? { transform: [{ translateY: 3 }] } : hard(p, 3)]}><Icon name="x" size={16} /></Pressable>
      </View>
      <View style={[s.chart, { backgroundColor: p.card, borderColor: p.ink }, hard(p, 5)]}>
        <View style={[s.range, { backgroundColor: p.bg2 }]}>
          {([7, 30] as const).map(x => (
            <Pressable key={x} testID={`range-${x}`} onPress={() => setR(x)} style={[s.rb, x === r && { backgroundColor: p.ink }]}><Txt f="b9" size={11.5} color={x === r ? p.bg : p.ink}>{x}天</Txt></Pressable>
          ))}
        </View>
        <Txt f="b9" size={12} color={p.sub}>日均{M.n}</Txt>
        <View style={s.avg}><Text testID="trend-avg" style={[fam('b9'), { fontSize: 38, lineHeight: 38, color: p.ink, letterSpacing: -0.38 }]}>{avgTxt}</Text><Txt f="b9" size={14} style={{ marginBottom: 4 }}>{M.u}</Txt></View>
        <Txt testID="trend-cmp" f="b8" size={12} color={p.sub} style={{ marginTop: 4 }}>{cmp}</Txt>
        <View style={[s.bars, { height: H + 56, gap: thin ? 3 : 9 }]}>
          {avgN !== null ? <View pointerEvents="none" style={[s.avgline, { bottom: (avg - base) / max * H + 28, borderColor: p.ink }]}><Txt f="b9" size={10} style={s.avgT}>均值</Txt></View> : null}
          {vals.map((v, i) => {
            const h = v === null ? 0 : Math.max(6, (v - base) / max * H), isT = i === vals.length - 1;
            return (
              <View key={i} style={s.bcol}>
                {!thin ? <Txt f="b9" size={10.5} style={{ marginBottom: 3 }}>{show(v)}</Txt> : null}
                {!thin && i === maxI ? <View style={[s.crown, { bottom: h + 38 }]}><Tuan mood="happy" acc={['crown']} size={34} /></View> : null}
                {v !== null ? (
                  <View style={[s.b, { height: h, backgroundColor: col.k, borderColor: p.ink }, thin && s.bThin]}>
                    {isT ? <Svg style={StyleSheet.absoluteFill}><Defs><Pattern id={`st${k}`} width="11" height="11" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><Rect width="7" height="11" fill={col.k} /><Rect x="7" width="4" height="11" fill={p.card} /></Pattern></Defs><Rect width="100%" height="100%" fill={`url(#st${k})`} /></Svg> : null}
                    {!thin ? <View style={s.shine} /> : null}
                  </View>
                ) : null}
                <View style={s.dWrap}><Txt f="b9" size={10.5} color={p.sub} numberOfLines={1} style={{ width: 60, textAlign: 'center' }}>{label(i) || ' '}</Txt></View>
              </View>
            );
          })}
        </View>
        {!thin ? <Txt f="b8" size={10.5} color={p.sub} style={{ marginTop: 8 }}>斜纹 = 今天还没过完{maxI >= 0 ? ` · 戴皇冠的是这周${M.n}最多的一天` : ''}</Txt> : null}
      </View>
      <HGroup t={`今天的${c.n}`} mini={`${rows.length} 条`} />
      <View style={[s.hcard, { backgroundColor: p.card, borderColor: p.ink }, hard(p, 4)]}>
        {rows.length ? rows.map((e, i) => {
          const t = evTitle(e), kc = kindColor(p, e.type);
          return (
            <Pressable key={e.id} testID={`trend-row-${i}`} onPress={() => { openTrend(null); openRecord(e.type, e.rec); }} style={[s.hr, i > 0 && { borderTopWidth: 2, borderStyle: 'dashed', borderColor: p.line }]}>
              <View style={s.hd}><Text style={[fam('b9'), { fontSize: 14, color: p.ink, lineHeight: 16.1 }]}>{e.cont ? '00:00' : e.start}</Text><Txt f="b8" size={10} color={p.sub} style={{ lineHeight: 11.5 }}>今天</Txt></View>
              <View style={[s.hi, { backgroundColor: kc.k, borderColor: p.ink }]}><Icon name={TYPE_IC[e.type]} size={20} /></View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Txt f="b9" size={13.5}><Segs segs={t.segs} /></Txt>
                <Txt f="b7" size={11.5} color={p.sub} style={{ marginTop: 2, lineHeight: 16.7 }}>{evMeta(e)}{e.note ? ` · ${e.note}` : ''}</Txt>
              </View>
            </Pressable>
          );
        }) : <Txt f="b8" size={12} color={p.sub} style={{ padding: 12 }}>今天还没有记录</Txt>}
      </View>
      <View style={[s.noteDesc, { backgroundColor: p.bg2, borderColor: p.line }]}>
        <Tuan mood={c.mood === 'sleep' ? 'idle' : c.mood} acc={acc} size={52} />
        <Txt f="b7" size={12} style={{ flex: 1, lineHeight: 18 }}>趋势只做描述、不做评价。想知道正不正常，可以<Text style={[fam('b9'), { textDecorationLine: 'underline' }]} onPress={() => { openTrend(null); router.navigate('/ai'); }}>问问团子</Text>。</Txt>
      </View>
      <Actions>
        <Btn label="关闭" onPress={() => openTrend(null)} testID="trend-close" />
        <Btn label={`记一笔${c.n}`} icon="plus" kind="pri" onPress={() => { openTrend(null); openRecord(k); }} testID="trend-add" />
      </Actions>
    </>
  );
}

const s = StyleSheet.create({
  trh: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6 },
  trIc: { width: 44, height: 44, borderRadius: 16, borderWidth: 2.5, alignItems: 'center', justifyContent: 'center' },
  iconbtn: { width: 42, height: 42, borderRadius: 15, borderWidth: 2.5, alignItems: 'center', justifyContent: 'center' },
  chart: { marginTop: 6, borderWidth: 3, borderRadius: 28, paddingTop: 16, paddingHorizontal: 14, paddingBottom: 12, overflow: 'hidden' },
  range: { position: 'absolute', right: 14, top: 14, flexDirection: 'row', borderRadius: 99, padding: 3, zIndex: 2 },
  rb: { paddingVertical: 4, paddingHorizontal: 10, borderRadius: 99 },
  avg: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  bars: { flexDirection: 'row', alignItems: 'flex-end', marginTop: 18, paddingHorizontal: 2 },
  avgline: { position: 'absolute', left: 0, right: 0, borderTopWidth: 2.5, borderStyle: 'dashed', opacity: 0.25 },
  avgT: { position: 'absolute', right: 0, top: -18 },
  bcol: { flex: 1, minWidth: 0, height: '100%', alignItems: 'center', justifyContent: 'flex-end' },
  b: { width: '100%', maxWidth: 34, borderTopLeftRadius: 14, borderTopRightRadius: 14, borderBottomLeftRadius: 10, borderBottomRightRadius: 10, borderWidth: 2.5, overflow: 'hidden' },
  bThin: { maxWidth: undefined, borderWidth: 2, borderTopLeftRadius: 7, borderTopRightRadius: 7, borderBottomLeftRadius: 5, borderBottomRightRadius: 5 },
  shine: { position: 'absolute', left: 5, top: 5, width: 6, height: 12, borderRadius: 9, backgroundColor: 'rgba(255,255,255,.65)' },
  crown: { position: 'absolute', left: '50%', marginLeft: -17, width: 34, height: 34 },
  dWrap: { width: 0, alignItems: 'center', overflow: 'visible', marginTop: 6 },
  hcard: { borderWidth: 2.5, borderRadius: 24, paddingVertical: 6, paddingHorizontal: 12, marginTop: 12 },
  hr: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', paddingVertical: 9 },
  hd: { width: 44, alignItems: 'flex-end' },
  hi: { width: 34, height: 34, borderRadius: 12, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  noteDesc: { flexDirection: 'row', gap: 10, alignItems: 'center', borderWidth: 2, borderStyle: 'dashed', borderRadius: 22, paddingVertical: 10, paddingHorizontal: 12, marginTop: 12 },
});
