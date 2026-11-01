/* 「给医生看」：病程摘要便签（原型 .memo 416-440 / memoHTML 1242）。只罗列家长记录：体温变化、用药和时间、症状、就诊；不含诊断、不写剂量；可存图片 / 分享文字 */
import { useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Defs, Line, Pattern, Rect } from 'react-native-svg';
import { useApp } from '@/state/app-state';
import { Icon, Tuan } from '@/lib/svg';
import type { IconName } from '@/lib/art';
import type { BabyRecord, Episode } from '@/data/types';
import { episodeDays, episodeRecords, epRange } from '@/lib/health';
import { ageText, DAY, hhmm, md, parseYmd, startOfDay } from '@/lib/time';
import { shareImage, shareText } from '@/lib/share';
import { Actions, Autosave, Btn, Sheet } from '../ui';
import { fam } from '../txt';

const INK = '#4A3A2C', SUB = '#8C7A66', DASH = '#EBD9B6';
type Row = { ic: IconName; bg: string; k: string; d: string[] };
const tm = (r: BabyRecord) => new Date(r.time);
const dt = (d: Date, now: Date) => `${startOfDay(d).getTime() === startOfDay(now).getTime() ? '今天' : md(d)} ${hhmm(d)}`;

export function buildMemo(ep: Episode | null, records: BabyRecord[], now: Date, allergies: string[], vaxRecent: string[]) {
  const rs = ep ? episodeRecords(records, ep) : records.filter(r => ['temp', 'med', 'symptom'].includes(r.type) && +now - +tm(r) < 3 * DAY && +tm(r) <= +now).sort((a, b) => +tm(a) - +tm(b));
  const temps = rs.filter(r => r.type === 'temp'), meds = rs.filter(r => r.type === 'med'), syms = rs.filter(r => r.type === 'symptom');
  const rows: Row[] = [];
  if (temps.length) {
    const max = temps.reduce((a, b) => ((b.values.v ?? 0) > (a.values.v ?? 0) ? b : a));
    const last = temps[temps.length - 1];
    const byDay = new Map<string, number[]>();
    temps.forEach(r => { const k = md(tm(r)); byDay.set(k, [...(byDay.get(k) ?? []), r.values.v ?? 0]); });
    rows.push({ ic: 'thermo', bg: '#FF9EB1', k: `体温 · 共 ${temps.length} 次`, d: [
      `最高 ${max.values.v?.toFixed(1)}℃（${dt(tm(max), now)}）；最近 ${last.values.v?.toFixed(1)}℃（${dt(tm(last), now)}，${last.values.site || '腋温'}）`,
      [...byDay].map(([k, v]) => `${k}：${v.map(x => x.toFixed(1)).join(' → ')}`).join('；'),
    ] });
  } else rows.push({ ic: 'thermo', bg: '#FF9EB1', k: '体温', d: ['这段时间没有体温记录'] });
  rows.push({ ic: 'pill', bg: '#B8A6F2', k: `用药 · 共 ${meds.length} 次`, d: meds.length ? [meds.map(r => `${dt(tm(r), now)} ${r.values.name || '药'}${(r.values.times ?? 1) > 1 ? ` ${r.values.times} 次` : ''}`).join('；'), '（家长记录，药名剂量以医嘱为准）'] : ['没有用药记录'] });
  if (syms.length) rows.push({ ic: 'rash', bg: '#FFE6E0', k: '症状', d: [syms.map(r => `${dt(tm(r), now)} ${r.values.name || '症状'}`).join('；'), '（家长记录，未做判断）'] });
  if (ep?.visits.length) rows.push({ ic: 'hosp', bg: '#8CCBFF', k: '就诊', d: [...ep.visits].sort((a, b) => a.time.localeCompare(b.time)).map(v => `${dt(new Date(v.time), now)} ${v.title}${v.note ? `：医生说${v.note}（家长转述）` : ''}`) });
  rows.push({ ic: 'medbook', bg: '#FFD45C', k: '过敏 · 疫苗', d: [`过敏：${allergies.length ? allergies.join('、') : '暂无已知'}`, ...(vaxRecent.length ? [`近期接种：${vaxRecent.join('、')}`] : [])] });
  return { rows, n: rs.length };
}

export function DoctorSheet({ open, ep, onClose }: { open: boolean; ep: Episode | null; onClose: () => void }) {
  return <Sheet open={open} onClose={onClose} testID="doctor-sheet">{open ? <DoctorBody ep={ep} onClose={onClose} /> : null}</Sheet>;
}
function DoctorBody({ ep, onClose }: { ep: Episode | null; onClose: () => void }) {
  const { p, baby, records, now, health, showToast } = useApp();
  const ref = useRef<unknown>(null);
  const [busy, setBusy] = useState(false);
  if (!baby) return null;
  const allergies = health.allergies.map(a => a.name);
  const vaxRecent = health.vaccines.filter(v => +now - +parseYmd(v.date)! < 60 * DAY).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 3).map(v => `${v.name} ${md(parseYmd(v.date)!)}`);
  const { rows } = buildMemo(ep, records, now, allergies, vaxRecent);
  const title = ep ? `${baby.name} · ${ep.title}` : `${baby.name} · 近 3 天体温用药`;
  const sub = `${ep ? `${epRange(ep)} · 第 ${episodeDays(ep, now)} 天 · ${ep.status === 'active' ? '进行中' : '已康复'}` : `${md(new Date(+now - 2 * DAY))}–${md(now)}`} · ${baby.gender === 'girl' ? '女' : baby.gender === 'boy' ? '男' : ''} · ${ageText(baby.birthday, now, false)} · 给医生看`;
  const FOOT = '由「一句记」根据家长记录整理 · 不含诊断 · 仅供参考';
  const text = [title, sub, '', ...rows.map(r => `【${r.k}】\n${r.d.join('\n')}`), '', FOOT].join('\n');
  const doImg = async () => {
    setBusy(true);
    try { const r = await shareImage(ref.current, `${baby.name}-给医生看`); showToast(r === 'saved' ? '图片已保存（下载）' : r === 'shared' ? '已打开分享' : '这台设备不支持分享图片'); }
    catch { showToast('生成图片失败，可以先分享文字'); }
    setBusy(false);
  };
  const doText = async () => {
    try { const r = await shareText(text); if (r === 'copied') showToast('摘要文字已复制，可以粘贴给医生'); else if (r === 'shared') showToast('已打开分享'); }
    catch { showToast('分享失败'); }
  };
  return (
    <>
      <View ref={ref as never} collapsable={false} style={{ backgroundColor: p.bg, paddingVertical: 6 }}>
        <View testID="memo" style={[s.memo, { borderColor: p.ink, shadowColor: p.shadow }]}>
          <View style={[StyleSheet.absoluteFill, { borderRadius: 18, overflow: 'hidden' }]} pointerEvents="none">
            <Svg width="100%" height="100%"><Defs><Pattern id="mg" width="18" height="18" patternUnits="userSpaceOnUse"><Line x1="0" y1="0.5" x2="18" y2="0.5" stroke="#F3E6CC" strokeWidth="1" /><Line x1="0.5" y1="0" x2="0.5" y2="18" stroke="#F3E6CC" strokeWidth="1" /></Pattern></Defs><Rect width="100%" height="100%" fill="url(#mg)" /></Svg>
          </View>
          <View style={[s.tape, s.tapeL]} /><View style={[s.tape, s.tapeR]} />
          <Text style={[fam('h'), { fontSize: 22, color: INK }]}>{title}</Text>
          <Text style={[fam('b8'), { fontSize: 11.5, color: SUB, marginTop: 2 }]}>{sub}</Text>
          {rows.map((r, i) => (
            <View key={i} style={s.rowm} testID={`memo-${r.ic}`}>
              <View style={[s.ic, { backgroundColor: r.bg }]}><Icon name={r.ic} size={18} color={INK} /></View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={[fam('b9'), { fontSize: 13.5, color: INK }]}>{r.k}</Text>
                {r.d.map((x, j) => <Text key={j} style={[fam('b6'), { fontSize: 12.5, lineHeight: 19.4, color: INK }]}>{x}</Text>)}
              </View>
            </View>
          ))}
          <View style={s.foot}><Text style={[fam('b8'), { fontSize: 10.5, color: SUB, flex: 1, paddingRight: 70 }]}>{FOOT}</Text></View>
          <View style={s.stk} pointerEvents="none"><Tuan mood="happy" acc={['book']} size={84} /></View>
        </View>
      </View>
      <Actions mt={22}>
        <Btn label="关闭" onPress={onClose} testID="doctor-close" />
        <Btn label={busy ? '生成中…' : '存图片'} icon="img" kind="pri" onPress={doImg} testID="doctor-img" disabled={busy} />
        <Btn label="分享" icon="share" kind="pink" onPress={doText} testID="doctor-text" />
      </Actions>
      <Autosave>只罗列你记下的内容 · 不写诊断、不写剂量</Autosave>
    </>
  );
}

const s = StyleSheet.create({
  memo: { position: 'relative', marginTop: 22, marginHorizontal: 4, marginBottom: 6, backgroundColor: '#FFFDF6', borderWidth: 2.5, borderTopLeftRadius: 10, borderTopRightRadius: 26, borderBottomRightRadius: 18, borderBottomLeftRadius: 22, paddingTop: 22, paddingHorizontal: 18, paddingBottom: 16, shadowOffset: { width: 0, height: 5 }, shadowOpacity: 1, shadowRadius: 0, elevation: 4, transform: [{ rotate: '-1.2deg' }] },
  tape: { position: 'absolute', top: -13, width: 86, height: 24, borderLeftWidth: 2, borderRightWidth: 2, borderStyle: 'dashed', borderColor: 'rgba(255,255,255,.7)' },
  tapeL: { left: 18, backgroundColor: 'rgba(255,158,177,.75)', transform: [{ rotate: '-7deg' }] },
  tapeR: { right: 16, backgroundColor: 'rgba(140,203,255,.75)', transform: [{ rotate: '6deg' }] },
  rowm: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', paddingVertical: 9, borderBottomWidth: 2, borderStyle: 'dashed', borderColor: DASH },
  ic: { width: 30, height: 30, borderRadius: 11, borderWidth: 2, borderColor: INK, alignItems: 'center', justifyContent: 'center' },
  foot: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 10 },
  stk: { position: 'absolute', right: -10, bottom: -16, width: 84, height: 84, transform: [{ rotate: '10deg' }] },
});
