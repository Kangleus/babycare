/* 「+」记一笔 / 点时间线改一条 —— 沿用原型识别确认卡（.sheet .heard .split .rc .editor .stepper .seg .risk .actions），
   字段与默认值来自原型 openManual()：默认上次的量、时间默认现在、只记你说的、不给剂量建议 */
import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { useApp, LVN } from '@/state/app-state';
import { getRepo } from '@/data/repo';
import { CARDS, TYPE_IC } from '@/data/mock';
import type { BabyRecord, RecordType, RecordValues } from '@/data/types';
import { dayEvs, dur, fmt, predict, SUBN } from '@/lib/calc';
import { addDays, hhmm, startOfDay } from '@/lib/time';
import type { Kind } from '@/theme/tokens';
import { ConfirmSheet, ConfirmOpts } from './confirm';
import { useLvAcc } from '@/state/hooks';
import { Actions, Autosave, Btn, Editor, Heard, Inp, NoteS, Rc, Risk, Row, Seg, Sheet, Split, Stepper } from './ui';

const TITLE: Record<Kind, string> = { feed: '记一次喂奶', sleep: '记一次睡觉', diaper: '记一次换尿布', pee: '记一次尿尿', poop: '记一次便便', water: '记一次喝水', med: '记一次吃药', temp: '记一次体温', symptom: '记一条症状', growth: '记身高体重', bath: '记一次洗澡' };
const LINE: Record<Kind, string> = { feed: '又到干饭时间啦～咕嘟咕嘟', sleep: '嘘…团团陪宝宝一起睡', diaper: '换上干爽的小屁屁，舒服！', pee: '嘘嘘完，换片干爽的～', poop: '噗噗顺利，团团给你鼓掌', water: '小口小口，咕嘟一下～', med: '乖乖吃药，团团陪着你', temp: '量一量，团团帮你记着', symptom: '哪里不舒服？团团先记下来', growth: '又长高了一点点吗？', bath: '泡泡浴时间到！' };
const MEDS = ['维生素 D', '退烧药', '益生菌', '其他'], SYMS = ['脸上小红点', '咳嗽', '流鼻涕', '呕吐', '拉肚子', '其他'];
const toType = (k: Kind): RecordType => (k === 'pee' || k === 'poop' ? 'diaper' : k);
const kindOf = (r: BabyRecord): Kind => r.type;

type M = { t: Date; end: Date | null; sub: string; ml: number; mins: number; wml: number; v: number; site: string; med: string; medOther: string; sym: string; symOther: string; cm: number; kg: number; note: string };

export function RecordSheet() {
  const { recTarget } = useApp();
  /* key：每次打开重新初始化表单 */
  return recTarget ? <Form key={(recTarget.rec?.id ?? 'new') + recTarget.kind} /> : null;
}

function Form() {
  const app = useApp();
  const { recTarget, closeRecord, records, baby, now, addRecord, updateRecord, deleteRecord, celebrate, showToast, lvl } = app;
  const acc = useLvAcc();
  const rec = recTarget!.rec, kind: Kind = rec ? kindOf(rec) : recTarget!.kind;
  const card: Kind = rec && rec.type === 'diaper' ? 'diaper' : kind;
  const type = toType(card);
  const [confirm, setConfirm] = useState<ConfirmOpts | null>(null);

  const [m, setM] = useState<M>(() => {
    const last = (t: RecordType) => records.filter(r => r.type === t).sort((a, b) => +new Date(b.time) - +new Date(a.time))[0]?.values;
    const lf = last('feed'), lw = last('water'), lt = last('temp'), lg = last('growth');
    const base: M = {
      t: new Date(now), end: null, ml: lf?.ml || 120, mins: card === 'bath' ? 10 : 15, wml: lw?.ml || 30, v: lt?.v || 36.8, site: '腋温',
      sub: card === 'pee' ? 'pee' : card === 'poop' ? 'poop' : card === 'diaper' ? 'pee' : (lf?.sub as string) || baby?.feeding || 'formula',
      med: '维生素 D', medOther: '', sym: '咳嗽', symOther: '', cm: lg?.cm || 68.5, kg: lg?.kg || 8.1, note: '',
    };
    if (!rec) return base;
    const v = rec.values;
    return { ...base, t: new Date(rec.time), end: rec.endTime ? new Date(rec.endTime) : null, note: rec.note || '',
      sub: (v.sub as string) || base.sub, ml: v.ml ?? base.ml, mins: v.mins ?? base.mins, wml: v.ml ?? base.wml, v: v.v ?? base.v, site: v.site || base.site,
      med: v.name && MEDS.includes(v.name) ? v.name : v.name ? '其他' : base.med, medOther: v.name && !MEDS.includes(v.name) ? v.name : '',
      sym: v.name && SYMS.includes(v.name) ? v.name : v.name ? '其他' : base.sym, symOther: v.name && !SYMS.includes(v.name) ? v.name : '',
      cm: v.cm ?? base.cm, kg: v.kg ?? base.kg };
  });
  const set = (p: Partial<M>) => setM(x => ({ ...x, ...p }));
  const clampT = (d: Date) => (d > now ? new Date(now) : d);
  const adjT = (d: number) => set({ t: clampT(new Date(m.t.getTime() + d * 60000)) });
  const adjEnd = (d: number) => { const e = new Date((m.end ?? now).getTime() + d * 60000); set({ end: e < m.t ? new Date(m.t.getTime() + 5 * 60000) : clampT(e) }); };
  const dayIdx = Math.round((startOfDay(now).getTime() - startOfDay(m.t).getTime()) / 86400000);
  const setDay = (i: number) => { const d = addDays(startOfDay(now), -i); const t = new Date(d.getFullYear(), d.getMonth(), d.getDate(), m.t.getHours(), m.t.getMinutes()); set({ t: clampT(t) }); };
  const isNow = !rec && Math.abs(m.t.getTime() - now.getTime()) < 60000;
  const hi = m.v >= 37.5, fever = m.v >= 38;
  const medName = m.med === '其他' ? m.medOther.trim() : m.med, symName = m.sym === '其他' ? m.symOther.trim() : m.sym;

  const values = useMemo<RecordValues>(() => {
    switch (type) {
      case 'feed': return m.sub === 'breast' ? { sub: 'breast', ml: null, mins: m.mins } : { sub: m.sub as RecordValues['sub'], ml: m.ml };
      case 'diaper': return { sub: m.sub as RecordValues['sub'] };
      case 'water': return { ml: m.wml };
      case 'med': return { name: medName || '其他', times: 1 };
      case 'temp': return { v: m.v, site: m.site };
      case 'symptom': return { name: symName || '其他' };
      case 'growth': return { cm: m.cm, kg: m.kg };
      case 'bath': return { mins: m.mins };
      default: return {};
    }
  }, [type, m, medName, symName]);

  /* 预览卡（原型 recCard） */
  const time = (dayIdx === 0 ? '' : dayIdx === 1 ? '昨天 ' : `${dayIdx} 天前 `) + hhmm(m.t);
  const tags: { t: string; def?: boolean; num?: boolean; clock?: boolean }[] = [{ t: time, clock: true }];
  let title = '';
  switch (type) {
    case 'feed': if (m.sub === 'breast') { title = `亲喂 ${m.mins} 分钟`; tags.push({ t: `${m.mins} 分钟`, num: true }); } else { title = `喂奶 ${m.ml}ml`; tags.push({ t: `${m.ml} ml`, num: true }); } tags.push({ t: SUBN[m.sub] }); break;
    case 'sleep': title = m.end ? `睡觉 · ${dur(Math.max(0, Math.round((m.end.getTime() - m.t.getTime()) / 60000)))}` : '开始睡觉'; tags.push({ t: m.end ? `到 ${hhmm(m.end)}` : '进行中' }); break;
    case 'diaper': title = `换尿布 · ${SUBN[m.sub]}`; tags.push({ t: SUBN[m.sub] }); break;
    case 'water': title = `喝水 ${m.wml}ml`; tags.push({ t: `${m.wml} ml`, num: true }); break;
    case 'med': title = `用药 · ${medName || '…'}`; tags.push({ t: '1 次' }, { t: '剂量按医嘱 · 只记你选的', def: true }); break;
    case 'temp': title = `体温 ${m.v.toFixed(1)}℃`; tags.push({ t: `${m.v.toFixed(1)} ℃`, num: true }, { t: m.site }); if (hi) tags.push({ t: '偏高' }); break;
    case 'symptom': title = `症状 · ${symName || '…'}`; tags.push({ t: '只记录，不判断原因', def: true }); break;
    case 'growth': title = '身高体重'; tags.push({ t: `${m.cm.toFixed(1)} cm`, num: true }, { t: `${m.kg.toFixed(1)} kg`, num: true }); break;
    case 'bath': title = `洗澡 · ${m.mins} 分钟`; break;
  }
  const by = rec ? rec.createdBy : (app.members.find(x => x.isLocal)?.name ?? '妈妈');
  tags.push({ t: `${by}记` });

  const invalid = (type === 'med' && !medName) || (type === 'symptom' && !symName);
  const save = async () => {
    if (invalid) { showToast(type === 'med' ? '写一下药名吧' : '写一下是什么情况吧'); return; }
    const payload = { type, time: m.t.toISOString(), endTime: type === 'sleep' ? (m.end ? m.end.toISOString() : null) : undefined, values, note: m.note.trim() || undefined };
    if (rec) { await updateRecord(rec.id, payload); closeRecord(); showToast('改好啦！'); return; }
    const { lvUp } = await addRecord(payload);
    closeRecord();
    const calm = (type === 'temp' && fever) || type === 'symptom';
    celebrate({ say: calm ? '记下啦' : '记好啦！', calm, extra: type === 'feed' && m.sub !== 'breast' ? `${m.ml}ml` : undefined });
    /* 用刚写入的数据算新的预测，给出原型同款提示 */
    const all = baby ? await getRepo().listRecords(baby.id) : [];
    const n = new Date(), P = predict(all, dayEvs(all, n), n);
    setTimeout(() => {
      celebrate(null);
      showToast(lvUp ? `团团升级啦！Lv.${Math.min(5, lvl + 1)} ${LVN[Math.min(5, lvl + 1)]}`
        : type === 'symptom' ? '已记入健康档案 · 拿不准就问问医生'
        : type === 'temp' && fever ? '已记入健康档案 · 不舒服请及时就医'
        : ['temp', 'med', 'growth'].includes(type) ? '已同步到健康档案 · 成长值 +1'
        : P.ongoing ? '已记下进行中的睡眠，醒了再点一下改结束时间' : `预测已刷新：下次喂奶约 ${fmt(P.win[0])}–${fmt(P.win[1])}`, 2600);
    }, 1500);
  };
  const askDelete = () => setConfirm({ t: '要删掉这条吗？', sub: `${title} · ${hhmm(m.t)}`, ok: '删除', note: '删掉后首页数字和趋势会一起更新', onOk: async () => { await deleteRecord(rec!.id); closeRecord(); showToast('已删除这条记录'); } });

  const c = CARDS[card];
  return (
    <>
      <Sheet open onClose={closeRecord} testID="record-sheet">
        <Heard mood={card === 'sleep' ? 'sleep' : c.mood} acc={card === 'sleep' ? ['cap'] : c.acc.length ? c.acc : acc} t={rec ? `改一下这条${c.n}` : TITLE[card]} sub={LINE[card]} />
        <Split left={rec ? `${by}记的 · 改完点「保存」` : '记 1 条 · 时间默认现在'} chip={rec ? '编辑' : '手动记录'} chipIcon={rec ? 'pen' : 'plus'} />
        <Rc kind={card === 'pee' || card === 'poop' ? card : type} icon={TYPE_IC[card]} title={title} tags={tags} edit={null} testID="rec-preview" />
        <Editor>
          {type === 'feed' ? <>
            <Seg testID="feed-sub" style={{ marginBottom: 10 }} opts={(['formula', 'bm', 'breast'] as const).map(k => ({ k, t: SUBN[k] }))} value={m.sub} onChange={k => set({ sub: k })} />
            {m.sub === 'breast'
              ? <Row label="亲喂时长"><Stepper testID="mins" val={`${m.mins} 分钟`} minW={86} onMinus={() => set({ mins: Math.max(1, m.mins - 5) })} onPlus={() => set({ mins: Math.min(90, m.mins + 5) })} /></Row>
              : <Row label="奶量 · 默认上次的量"><Stepper testID="ml" val={`${m.ml} ml`} onMinus={() => set({ ml: Math.max(10, m.ml - 10) })} onPlus={() => set({ ml: Math.min(300, m.ml + 10) })} /></Row>}
          </> : null}
          {type === 'diaper' ? <Seg testID="diaper-sub" style={{ marginBottom: 10 }} opts={(['pee', 'poop', 'both'] as const).map(k => ({ k, t: SUBN[k] }))} value={m.sub} onChange={k => set({ sub: k })} /> : null}
          {type === 'water' ? <Row label="水量 · 默认上次的量"><Stepper testID="wml" val={`${m.wml} ml`} onMinus={() => set({ wml: Math.max(10, m.wml - 10) })} onPlus={() => set({ wml: Math.min(200, m.wml + 10) })} /></Row> : null}
          {type === 'med' ? <>
            <Seg testID="med" style={{ marginBottom: 10 }} opts={MEDS.map(k => ({ k, t: k }))} value={m.med} onChange={k => set({ med: k })} />
            {m.med === '其他' ? <View style={{ marginBottom: 10 }}><Inp testID="med-other" value={m.medOther} onChangeText={t => set({ medOther: t })} placeholder="药名（按医生说的写）" maxLength={20} /></View> : null}
          </> : null}
          {type === 'temp' ? <>
            <Row label="体温 · 每次 ±0.1"><Stepper testID="temp" val={`${m.v.toFixed(1)} ℃`} onMinus={() => set({ v: Math.round(Math.max(34, m.v - 0.1) * 10) / 10 })} onPlus={() => set({ v: Math.round(Math.min(42, m.v + 0.1) * 10) / 10 })} /></Row>
            <Seg testID="site" style={{ marginBottom: 10 }} opts={['腋温', '耳温', '额温'].map(k => ({ k, t: k }))} value={m.site} onChange={k => set({ site: k })} />
          </> : null}
          {type === 'symptom' ? <>
            <Seg testID="sym" style={{ marginBottom: 10 }} opts={SYMS.map(k => ({ k, t: k }))} value={m.sym} onChange={k => set({ sym: k })} />
            {m.sym === '其他' ? <View style={{ marginBottom: 10 }}><Inp testID="sym-other" value={m.symOther} onChangeText={t => set({ symOther: t })} placeholder="什么情况（只记录，不判断）" maxLength={20} /></View> : null}
          </> : null}
          {type === 'growth' ? <>
            <Row label="身长 cm"><Stepper testID="cm" val={m.cm.toFixed(1)} onMinus={() => set({ cm: Math.round((m.cm - 0.5) * 10) / 10 })} onPlus={() => set({ cm: Math.round((m.cm + 0.5) * 10) / 10 })} /></Row>
            <Row label="体重 kg"><Stepper testID="kg" val={m.kg.toFixed(1)} onMinus={() => set({ kg: Math.round((m.kg - 0.1) * 10) / 10 })} onPlus={() => set({ kg: Math.round((m.kg + 0.1) * 10) / 10 })} /></Row>
          </> : null}
          {type === 'bath' ? <Seg testID="bath" style={{ marginBottom: 10 }} opts={[5, 10, 15].map(k => ({ k: String(k), t: `${k} 分钟` }))} value={String(m.mins)} onChange={k => set({ mins: +k })} /> : null}
          <Row label={type === 'sleep' ? '开始睡觉' : '时间'}><Stepper testID="time" val={isNow ? `${hhmm(m.t)} 现在` : hhmm(m.t)} minW={92} onMinus={() => adjT(-5)} onPlus={() => adjT(5)} /></Row>
          <Seg testID="day" style={{ marginBottom: type === 'sleep' ? 10 : 4 }} opts={[{ k: '2', t: '前天' }, { k: '1', t: '昨天' }, { k: '0', t: '今天' }]} value={String(dayIdx)} onChange={k => setDay(+k)} />
          {type === 'sleep' ? <>
            <Seg testID="sleep-state" style={{ marginBottom: m.end ? 10 : 4 }} opts={[{ k: 'on', t: '还在睡' }, { k: 'woke', t: '已经醒了' }]} value={m.end ? 'woke' : 'on'} onChange={k => set({ end: k === 'on' ? null : clampT(new Date(Math.max(m.t.getTime() + 30 * 60000, Math.min(now.getTime(), m.t.getTime() + 60 * 60000)))) })} />
            {m.end ? <Row label="醒来"><Stepper testID="end" val={hhmm(m.end)} minW={92} onMinus={() => adjEnd(-5)} onPlus={() => adjEnd(5)} /></Row> : null}
          </> : null}
          <View style={{ marginTop: 8 }}><Inp testID="note" value={m.note} onChangeText={t => set({ note: t })} placeholder="备注（可不填）" maxLength={60} /></View>
          {type === 'water' ? <NoteS>只记录喝了多少，团团不给饮水量建议</NoteS> : null}
          {type === 'med' ? <NoteS>只记你选的药名；剂量请按医嘱，团团不推荐剂量</NoteS> : null}
          {type === 'growth' ? <NoteS>家里量的会标「家里量」，以体检数据为准</NoteS> : null}
          {type === 'temp' && !fever ? <NoteS>{hi ? '37.5℃ 以上会标「偏高」' : '记好后会同步到健康档案的体温记录'}</NoteS> : null}
          {type === 'sleep' && !m.end ? <NoteS>醒了以后点这条记录，改一下醒来时间就好</NoteS> : null}
        </Editor>
        {type === 'temp' && fever ? <Risk title={`${m.v.toFixed(1)}℃ 偏高`} items={['团团不判断病情，也不建议用药剂量', '精神差、呼吸急促、抽搐、持续高烧不退，或不吃不尿，请尽快就医']} /> : null}
        {type === 'symptom' ? <Risk title="只记录，不判断原因" items={['嘴唇或眼睛肿、呼吸困难、反复呕吐、精神差，请立即就医或拨打 120']} /> : null}
        <Actions>
          {rec ? <Btn label="删除" kind="pink" onPress={askDelete} testID="rec-delete" /> : <Btn label="取消" onPress={closeRecord} testID="rec-cancel" />}
          <Btn label={rec ? '保存' : '记下来'} icon="check" kind="pri" onPress={save} testID="rec-save" />
        </Actions>
        <Autosave>{rec ? '改动只保存在这台设备 · 云端同步开通后会同步给家人' : '两步就记好 · 语音不方便时的兜底'}</Autosave>
      </Sheet>
      <ConfirmSheet c={confirm} onClose={() => setConfirm(null)} />
    </>
  );
}
