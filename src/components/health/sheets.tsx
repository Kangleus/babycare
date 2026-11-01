/* 健康页的编辑面板：提醒 / 病程 / 就诊 / 过敏 / 疫苗。全部沿用原型 .sheet .heard .editor .row .stepper .seg .inp .actions */
import { useState } from 'react';
import { View } from 'react-native';
import { useApp } from '@/state/app-state';
import { useLvAcc } from '@/state/hooks';
import { uid } from '@/data/repo';
import type { Allergy, Episode, RemCat, Reminder, Vaccine, Visit } from '@/data/types';
import { RCAT } from '@/lib/health';
import { addDays, hhmm, md, parseYmd, startOfDay, WK, ymd } from '@/lib/time';
import { Actions, Autosave, Btn, Editor, Fl, Heard, Inp, NoteS, Row, Seg, Sheet, Stepper } from '../ui';

const dayTxt = (d: Date, now: Date) => {
  const n = Math.round((startOfDay(d).getTime() - startOfDay(now).getTime()) / 86400000);
  return n === 0 ? '今天' : n === 1 ? '明天' : n === -1 ? '昨天' : `${md(d)} 周${WK[d.getDay()]}`;
};
const roundQ = (d: Date) => { const x = new Date(d); x.setSeconds(0, 0); x.setMinutes(Math.ceil(x.getMinutes() / 15) * 15); return x; };
export const medName = (title: string) => title.replace(/^(喂|吃|用)/, '').trim() || title;

/* —— 提醒 —— */
export type RemDraft = Partial<Reminder> & { cat: RemCat };
export function ReminderSheet({ draft, onClose }: { draft: RemDraft | null; onClose: () => void }) {
  return <Sheet open={!!draft} onClose={onClose} testID="rem-sheet">{draft ? <RemBody key={draft.id ?? 'new'} d={draft} onClose={onClose} /> : null}</Sheet>;
}
function RemBody({ d, onClose }: { d: RemDraft; onClose: () => void }) {
  const { now, baby, me, putHealth, deleteHealth, addRecord, showToast } = useApp();
  const acc = useLvAcc();
  const editing = !!d.id;
  const [cat, setCat] = useState<RemCat>(d.cat);
  const [title, setTitle] = useState(d.title ?? (d.cat === 'med' ? '' : ''));
  const [at, setAt] = useState(() => (d.dueAt ? new Date(d.dueAt) : roundQ(new Date(now.getTime() + 3600000))));
  const [rep, setRep] = useState<Reminder['repeat']>(d.repeat ?? 'none');
  const [note, setNote] = useState(d.note ?? '');
  const ok = title.trim().length > 0;
  const save = async () => {
    if (!ok || !baby) { showToast('写一下提醒什么吧'); return; }
    const stamp = new Date().toISOString();
    await putHealth('reminders', {
      id: d.id ?? uid(), babyId: baby.id, cat, title: title.trim().slice(0, 40), dueAt: at.toISOString(), repeat: rep, note: note.trim() || undefined,
      source: d.source ?? 'user', planKey: d.planKey, confirmed: true, doneAt: d.doneAt ?? null, doneBy: d.doneBy ?? null,
      createdBy: d.createdBy ?? me, createdAt: d.createdAt ?? stamp, updatedAt: stamp,
    });
    onClose(); showToast(editing ? '提醒改好啦' : `已加入提醒：${title.trim()}`);
  };
  /* 用药提醒「已喂」：记一笔吃药 + 这一次提醒完成（不涉及剂量） */
  const fed = async () => {
    if (!d.id || !baby) return;
    const t = new Date();
    await addRecord({ type: 'med', time: t.toISOString(), values: { name: medName(d.title ?? title), times: 1 }, note: '提醒里点「已喂」记录' });
    await putHealth('reminders', { ...(d as Reminder), doneAt: t.toISOString(), doneBy: me });
    onClose(); showToast(`已记一笔：${medName(d.title ?? title)} · 提醒完成`);
  };
  return (
    <>
      <Heard mood="happy" acc={['clock', ...acc.filter(a => a !== 'clock')]} t={editing ? '改一下提醒' : '新建提醒'} sub={cat === 'med' ? '只在你设的时间叫你 · 剂量按医嘱' : '到点团团会举着闹钟叫你'} />
      {editing && cat === 'med' && !d.doneAt ? (
        <Actions><Btn testID="rem-fed" label={`已喂 · 记一笔${medName(d.title ?? '')}`} icon="check" kind="pink" onPress={fed} /></Actions>
      ) : null}
      <Editor>
        <Fl>提醒什么</Fl>
        <Inp testID="rem-title" value={title} onChangeText={setTitle} placeholder={cat === 'med' ? '例如：喂维生素 D' : cat === 'vax' ? '例如：流感疫苗 第 2 剂' : '例如：儿保门诊复查'} maxLength={40} />
        <Fl style={{ marginTop: 12 }}>分类</Fl>
        <Seg testID="rem-cat" opts={(Object.keys(RCAT) as RemCat[]).map(k => ({ k, t: RCAT[k].n, icon: RCAT[k].ic }))} value={cat} onChange={setCat} />
        <View style={{ height: 10 }} />
        <Row label="日期"><Stepper testID="rem-day" minW={110} val={dayTxt(at, now)} onMinus={() => setAt(addDays(at, -1))} onPlus={() => setAt(addDays(at, 1))} /></Row>
        <Row label="时间"><Stepper testID="rem-time" val={hhmm(at)} onMinus={() => setAt(new Date(at.getTime() - 15 * 60000))} onPlus={() => setAt(new Date(at.getTime() + 15 * 60000))} /></Row>
        <Fl style={{ marginTop: 4 }}>重复</Fl>
        <Seg testID="rem-rep" opts={[{ k: 'none', t: '只一次' }, { k: 'daily', t: '每天' }, { k: 'weekly', t: '每周' }]} value={rep} onChange={setRep} />
        <Fl style={{ marginTop: 12 }}>备注</Fl>
        <Inp testID="rem-note" value={note} onChangeText={setNote} placeholder={cat === 'med' ? '药名、剂量按医嘱（只记你写的）' : '例如：带接种本'} maxLength={200} />
        {cat === 'med' ? <NoteS>用药提醒只在你设定的时间叫你。团团不会建议剂量，也不会建议间隔，请按医嘱。</NoteS> : null}
        {d.source === 'plan' ? <NoteS>参考国家免疫规划 / 儿童健康管理时间推算，以接种本和接种门诊通知为准</NoteS> : null}
      </Editor>
      <Actions>
        {editing ? <Btn label="删除" onPress={async () => { await deleteHealth('reminders', d.id!); onClose(); showToast('提醒已删除'); }} testID="rem-del" /> : <Btn label="算了" onPress={onClose} testID="rem-cancel" />}
        <Btn label={editing ? '保存' : '加入提醒'} icon="clock" kind="pri" disabled={!ok} onPress={save} testID="rem-save" />
      </Actions>
      <Autosave>{d.createdBy ? `${d.createdBy}设置` : `${me}设置`}{d.doneAt ? ` · ${d.doneBy ?? ''}完成于 ${dayTxt(new Date(d.doneAt), now)} ${hhmm(new Date(d.doneAt))}` : ''}</Autosave>
    </>
  );
}

/* —— 病程 —— */
const ILL_TITLES = ['发烧', '感冒', '咳嗽', '腹泻', '出疹', '湿疹'];
export function EpisodeSheet({ ep, open, onClose }: { ep: Episode | null; open: boolean; onClose: () => void }) {
  return <Sheet open={open} onClose={onClose} testID="ep-sheet">{open ? <EpBody key={ep?.id ?? 'new'} ep={ep} onClose={onClose} /> : null}</Sheet>;
}
function EpBody({ ep, onClose }: { ep: Episode | null; onClose: () => void }) {
  const { now, baby, me, putHealth, deleteHealth, showToast } = useApp();
  const [title, setTitle] = useState(ep?.title ?? '');
  const [start, setStart] = useState(() => (ep ? parseYmd(ep.startDate)! : startOfDay(now)));
  const save = async (recover?: boolean) => {
    if (!baby || !title.trim()) { showToast('写一下是什么情况吧'); return; }
    const stamp = new Date().toISOString();
    await putHealth('episodes', {
      id: ep?.id ?? uid(), babyId: baby.id, title: title.trim().slice(0, 40), startDate: ymd(start),
      endDate: recover ? ymd(startOfDay(now) < start ? start : startOfDay(now)) : ep?.endDate ?? null, status: recover ? 'recovered' : ep?.status ?? 'active',
      visits: ep?.visits ?? [], note: ep?.note, createdBy: ep?.createdBy ?? me, createdAt: ep?.createdAt ?? stamp, updatedAt: stamp,
    });
    onClose(); showToast(recover ? '已康复，团团给你比心 · 病程已归档' : ep ? '病程改好啦' : '开始记录病程 · 首页记的体温、用药、症状会自动归进来');
  };
  return (
    <>
      <Heard mood={ep ? 'idle' : 'worry'} acc={['thermo']} t={ep ? '这次病程' : '开始记一次病程'} sub="只记你说的，不判断病情" />
      <Editor>
        <Fl>是什么情况</Fl>
        <Inp testID="ep-title" value={title} onChangeText={setTitle} placeholder="例如：发烧" maxLength={40} />
        <View style={{ marginTop: 10 }}><Seg testID="ep-quick" opts={ILL_TITLES.map(t => ({ k: t, t }))} value={title as never} onChange={setTitle} /></View>
        <View style={{ height: 10 }} />
        <Row label="开始日期"><Stepper testID="ep-start" minW={110} val={dayTxt(start, now)} onMinus={() => setStart(addDays(start, -1))} onPlus={() => setStart(startOfDay(addDays(start, 1)) > startOfDay(now) ? start : addDays(start, 1))} /></Row>
        <NoteS>开始日期之后在首页记的体温、吃药、症状，会自动归到这次病程，不用再记一遍</NoteS>
      </Editor>
      <Actions>
        {ep ? <Btn label="删除" onPress={async () => { await deleteHealth('episodes', ep.id); onClose(); showToast('病程已删除（记录还在）'); }} testID="ep-del" /> : <Btn label="算了" onPress={onClose} />}
        {ep && ep.status === 'active' ? <Btn label="已康复" icon="check" kind="pink" onPress={() => save(true)} testID="ep-recover" /> : null}
        <Btn label={ep ? '保存' : '开始记录'} kind="pri" onPress={() => save()} testID="ep-save" />
      </Actions>
    </>
  );
}

/* —— 就诊（挂在病程上） —— */
export function VisitSheet({ ep, open, onClose }: { ep: Episode | null; open: boolean; onClose: () => void }) {
  return <Sheet open={open && !!ep} onClose={onClose} testID="visit-sheet">{open && ep ? <VisitBody ep={ep} onClose={onClose} /> : null}</Sheet>;
}
function VisitBody({ ep, onClose }: { ep: Episode; onClose: () => void }) {
  const { now, putHealth, showToast } = useApp();
  const [at, setAt] = useState(() => roundQ(now));
  const [title, setTitle] = useState('就诊');
  const [note, setNote] = useState('');
  const save = async () => {
    const v: Visit = { id: uid(), time: at.toISOString(), title: title.trim() || '就诊', note: note.trim() || undefined };
    await putHealth('episodes', { ...ep, visits: [...ep.visits, v].slice(-30) });
    onClose(); showToast('就诊已记入病程');
  };
  return (
    <>
      <Heard mood="idle" acc={['book']} t="记一次就诊" sub="医生说的可以记在备注里（家长转述）" />
      <Editor>
        <Fl>去了哪里</Fl>
        <Inp testID="visit-title" value={title} onChangeText={setTitle} placeholder="例如：社区医院儿科" maxLength={40} />
        <View style={{ height: 10 }} />
        <Row label="日期"><Stepper minW={110} testID="visit-day" val={dayTxt(at, now)} onMinus={() => setAt(addDays(at, -1))} onPlus={() => setAt(addDays(at, 1))} /></Row>
        <Row label="时间"><Stepper testID="visit-time" val={hhmm(at)} onMinus={() => setAt(new Date(at.getTime() - 15 * 60000))} onPlus={() => setAt(new Date(at.getTime() + 15 * 60000))} /></Row>
        <Fl>医生说（家长转述）</Fl>
        <Inp testID="visit-note" value={note} onChangeText={setNote} placeholder="例如：先观察体温" maxLength={120} />
      </Editor>
      <Actions><Btn label="算了" onPress={onClose} /><Btn label="记下" kind="pri" onPress={save} testID="visit-save" /></Actions>
    </>
  );
}

/* —— 过敏 —— */
export function AllergySheet({ item, open, onClose }: { item: Allergy | null; open: boolean; onClose: () => void }) {
  return <Sheet open={open} onClose={onClose} testID="allergy-sheet">{open ? <AllergyBody key={item?.id ?? 'new'} item={item} onClose={onClose} /> : null}</Sheet>;
}
function AllergyBody({ item, onClose }: { item: Allergy | null; onClose: () => void }) {
  const { baby, me, putHealth, deleteHealth, showToast } = useApp();
  const [name, setName] = useState(item?.name ?? '');
  const [note, setNote] = useState(item?.note ?? '');
  const save = async () => {
    if (!baby || !name.trim()) { showToast('写一下对什么过敏'); return; }
    const stamp = new Date().toISOString();
    await putHealth('allergies', { id: item?.id ?? uid(), babyId: baby.id, name: name.trim().slice(0, 30), note: note.trim() || undefined, createdBy: item?.createdBy ?? me, createdAt: item?.createdAt ?? stamp, updatedAt: stamp });
    onClose(); showToast('过敏信息已保存');
  };
  return (
    <>
      <Heard mood="worry" acc={['book']} t={item ? '过敏信息' : '添加过敏'} sub="给医生看时会写在最前面" />
      <Editor>
        <Fl>对什么过敏</Fl>
        <Inp testID="allergy-name" value={name} onChangeText={setName} placeholder="例如：鸡蛋、青霉素" maxLength={30} />
        <Fl style={{ marginTop: 12 }}>表现 / 备注</Fl>
        <Inp testID="allergy-note" value={note} onChangeText={setNote} placeholder="例如：吃了起疹子（家长观察）" maxLength={200} />
      </Editor>
      <Actions>
        {item ? <Btn label="删除" onPress={async () => { await deleteHealth('allergies', item.id); onClose(); showToast('已删除'); }} testID="allergy-del" /> : <Btn label="算了" onPress={onClose} />}
        <Btn label="保存" kind="pri" onPress={save} testID="allergy-save" />
      </Actions>
    </>
  );
}

/* —— 疫苗接种记录 —— */
export type VaxDraft = Partial<Vaccine> & { name: string };
export function VaccineSheet({ draft, onClose }: { draft: VaxDraft | null; onClose: () => void }) {
  return <Sheet open={!!draft} onClose={onClose} testID="vax-sheet">{draft ? <VaxBody key={draft.id ?? draft.name} d={draft} onClose={onClose} /> : null}</Sheet>;
}
function VaxBody({ d, onClose }: { d: VaxDraft; onClose: () => void }) {
  const { now, baby, me, health, putHealth, deleteHealth, showToast } = useApp();
  const [name, setName] = useState(d.name);
  const [date, setDate] = useState(() => (d.date ? parseYmd(d.date)! : startOfDay(now)));
  const [note, setNote] = useState(d.note ?? '');
  const save = async () => {
    if (!baby || !name.trim()) { showToast('写一下疫苗名称'); return; }
    const stamp = new Date().toISOString();
    await putHealth('vaccines', { id: d.id ?? uid(), babyId: baby.id, name: name.trim().slice(0, 30), date: ymd(date), note: note.trim() || undefined, createdBy: d.createdBy ?? me, createdAt: d.createdAt ?? stamp, updatedAt: stamp });
    /* 同名的疫苗提醒顺手标记完成 */
    const r = health.reminders.find(x => x.cat === 'vax' && !x.doneAt && x.title.includes(name.trim()));
    if (r) await putHealth('reminders', { ...r, doneAt: new Date().toISOString(), doneBy: me });
    onClose(); showToast(`已登记：${name.trim()}`);
  };
  return (
    <>
      <Heard mood="happy" acc={['flower']} t={d.id ? '接种记录' : '登记接种'} sub="以接种本为准" />
      <Editor>
        <Fl>疫苗名称</Fl>
        <Inp testID="vax-name" value={name} onChangeText={setName} placeholder="例如：流感疫苗 第 1 剂" maxLength={30} />
        <View style={{ height: 10 }} />
        <Row label="接种日期"><Stepper testID="vax-day" minW={110} val={dayTxt(date, now)} onMinus={() => setDate(addDays(date, -1))} onPlus={() => setDate(startOfDay(addDays(date, 1)) > startOfDay(now) ? date : addDays(date, 1))} /></Row>
        <Fl>备注</Fl>
        <Inp testID="vax-note" value={note} onChangeText={setNote} placeholder="例如：自费、左上臂" maxLength={200} />
      </Editor>
      <Actions>
        {d.id ? <Btn label="删除" onPress={async () => { await deleteHealth('vaccines', d.id!); onClose(); showToast('已删除'); }} testID="vax-del" /> : <Btn label="算了" onPress={onClose} />}
        <Btn label="保存" kind="pri" onPress={save} testID="vax-save" />
      </Actions>
    </>
  );
}
