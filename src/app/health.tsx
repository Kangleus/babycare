/* 健康 Tab —— 原型 renderHealth()（1717-1755）：团团建议 → 提醒 → 病程记录 / 疫苗·体检 → 就医要点。只记家长说的，不判断病情、不给剂量 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { ScrollViewInstance, View } from 'react-native';
import { Page, PTitle } from '@/components/page';
import { HGroup } from '@/components/ui';
import { Txt } from '@/components/txt';
import { useApp } from '@/state/app-state';
import type { Allergy, BabyRecord, Episode, RemCat, Reminder } from '@/data/types';
import { uid } from '@/data/repo';
import {
  activeEpisode, ageLabel, episodeDays, episodeRecords, epRange, nextOcc, PLAN, PLAN_SOURCE, planDate, RCAT, REP_T, suggestions, Sugg, tempPoints, whenText,
} from '@/lib/health';
import { ageText, DAY, md, parseYmd, startOfDay } from '@/lib/time';
import type { IconName } from '@/lib/art';
import { Icon } from '@/lib/svg';
import { Chips, DashBtn, Dsep, FootNote, HCard, Hct, HctBtn, HPill, HRow, Kv, Mini, RmRow, SegBig, SgCard, SuggBox, TempCurve, TipLine, Vt, Vx, hcol } from '@/components/health/hui';
import { AllergySheet, EpisodeSheet, ReminderSheet, RemDraft, VaccineSheet, VaxDraft, VisitSheet } from '@/components/health/sheets';
import { DoctorSheet } from '@/components/health/doctor';

const KIND_IC: Record<string, IconName> = { temp: 'thermo', med: 'pill', symptom: 'rash', visit: 'hosp' };
type RF = 'all' | RemCat;
type HealthNavAnchor = 'top' | 'rem' | 'ill';

export default function Health() {
  const app = useApp();
  const { p, night, baby, now, records, health, healthNav, setHealthTab, putHealth, me, showToast, dismissSugg, settings, openRecord, openTrend } = app;
  const sref = useRef<ScrollViewInstance>(null);
  const ys = useRef<{ rem: number; ill: number }>({ rem: 0, ill: 0 });
  const [rf, setRf] = useState<RF>('all');
  const [remDraft, setRemDraft] = useState<RemDraft | null>(null);
  const [epEdit, setEpEdit] = useState<{ ep: Episode | null } | null>(null);
  const [visitFor, setVisitFor] = useState<Episode | null>(null);
  const [allergy, setAllergy] = useState<{ a: Allergy | null } | null>(null);
  const [vax, setVax] = useState<VaxDraft | null>(null);
  const [doctor, setDoctor] = useState<{ ep: Episode | null } | null>(null);
  const [pastId, setPastId] = useState<string | null>(null);
  const [sgDone, setSgDone] = useState<string[]>([]);
  const [showOld, setShowOld] = useState(false);
  const [showAllVax, setShowAllVax] = useState(false);
  const tab = healthNav.tab;

  /* 首页 / 我的 跳过来：滚到对应位置（目标区块量到位置后再滚，首次进入也准） */
  const pending = useRef<HealthNavAnchor | null>(null);
  const jump = () => {
    const a = pending.current; if (!a) return;
    if (a !== 'top' && !ys.current[a]) return;
    sref.current?.scrollTo({ y: a === 'top' ? 0 : Math.max(0, ys.current[a] - 64), animated: false });
  };
  useEffect(() => {
    pending.current = healthNav.anchor;
    const t1 = setTimeout(jump, 60), t2 = setTimeout(() => { jump(); pending.current = null; }, 450);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [healthNav.n, healthNav.anchor]);

  const today = startOfDay(now);
  const ep = activeEpisode(health);
  const past = useMemo(() => health.episodes.filter(e => e.status === 'recovered').sort((a, b) => b.startDate.localeCompare(a.startDate)), [health.episodes]);
  const shownPast = past.find(e => e.id === pastId) ?? past[0] ?? null;
  const todayH = records.filter(r => ['temp', 'med', 'symptom'].includes(r.type) && startOfDay(new Date(r.time)).getTime() === today.getTime()).sort((a, b) => +new Date(b.time) - +new Date(a.time));
  const hot = todayH.some(r => r.type === 'temp' && (r.values.v ?? 0) >= 37.5), sym = todayH.some(r => r.type === 'symptom');
  const sg = baby ? suggestions(baby, records, health, now, settings.sgGone ?? []) : [];
  const fever14 = records.some(r => r.type === 'temp' && (r.values.v ?? 0) >= 37.5 && +now - +new Date(r.time) < 14 * DAY);

  /* 国家免疫规划（参考）：还没登记、也没确认提醒的条目 */
  const planned = useMemo(() => {
    if (!baby) return [];
    return PLAN.map(x => ({ x, d: planDate(baby, x.months) })).filter(({ x }) =>
      !(x.cat === 'vax' && health.vaccines.some(v => v.name === x.name)) && !health.reminders.some(r => r.planKey?.split('+').includes(x.key)));
  }, [baby, health.vaccines, health.reminders]);
  const pend = planned.filter(({ d }) => +d >= +today && +d - +today <= 90 * DAY);
  const pendGroups = useMemo(() => {
    const m = new Map<number, typeof pend>(); pend.forEach(q => m.set(+q.d, [...(m.get(+q.d) ?? []), q]));
    return [...m.entries()].sort((a, b) => a[0] - b[0]).slice(0, 3).map(([d, xs]) => ({ d: new Date(d), xs }));
  }, [pend]);

  if (!baby) return <Page><PTitle title="健康" /></Page>;

  /* —— 提醒 —— */
  const all = health.reminders.filter(r => r.confirmed);
  const list = all.filter(r => rf === 'all' || r.cat === rf);
  const occ = (r: Reminder) => nextOcc(r, now);
  const todo = list.filter(r => !occ(r).done).sort((a, b) => +occ(a).at - +occ(b).at);
  const done = list.filter(r => occ(r).done).sort((a, b) => (b.doneAt ?? '').localeCompare(a.doneAt ?? ''));
  const todoN = all.filter(r => !occ(r).done).length;
  const toggle = async (r: Reminder) => {
    const o = occ(r);
    if (o.done) { await putHealth('reminders', { ...r, doneAt: null, doneBy: null }); showToast(`改回待办：${r.title}`); return; }
    await putHealth('reminders', { ...r, doneAt: new Date().toISOString(), doneBy: me });
    showToast(r.repeat === 'none' ? `完成啦：${r.title}` : `这次完成啦：${r.title} · 下次照常提醒`);
  };
  const remSub = (r: Reminder) => {
    const o = occ(r), by = r.doneBy ? `${r.doneBy}完成` : '已完成';
    const recentDone = r.repeat !== 'none' && r.doneAt && +now - Date.parse(r.doneAt) < DAY ? ` · 上次 ${by}` : '';
    if (o.done) return `${by} · ${whenText(new Date(r.doneAt!), now)}${r.note ? ` · ${r.note}` : ''}`;
    return `${whenText(o.at, now)}${r.repeat !== 'none' ? ` · ${REP_T[r.repeat]}` : ''}${r.note ? ` · ${r.note}` : ''}${recentDone}`;
  };
  const remRow = (r: Reminder, i: number) => (
    <RmRow key={r.id} first={i === 0} testID={`rem-${r.id}`} done={occ(r).done} cat={r.cat} title={r.title}
      tags={<>{r.source === 'suggest' ? <Vt t="团团建议" sg /> : null}{r.source === 'plan' ? <Vt t="参考" sg /> : null}</>}
      sub={remSub(r)} onToggle={() => toggle(r)} onPress={() => setRemDraft(r)} />
  );

  /* —— 建议 —— */
  const visitRem = todo.find(r => r.cat === 'visit') ?? all.find(r => r.cat === 'visit' && !occ(r).done);
  const sgAdd = async (x: Sugg) => {
    if (x.action === 'summary') { setDoctor({ ep }); return; }
    if (x.ask && visitRem) {
      if (!(visitRem.note ?? '').includes(x.ask)) await putHealth('reminders', { ...visitRem, note: `${visitRem.note ? `${visitRem.note} · ` : ''}${x.ask}`.slice(0, 200) });
      showToast(`已记到「${visitRem.title}」的备注里`); setSgDone(d => [...d, x.id]); return;
    }
    if (!x.rem) return;
    const same = health.reminders.find(r => !occ(r).done && (r.title === x.rem!.title || (x.rem!.planKey && r.planKey === x.rem!.planKey)));
    if (same) showToast(`提醒里已有「${same.title}」，不重复加啦`);
    else {
      const stamp = new Date().toISOString();
      await putHealth('reminders', { ...x.rem, id: uid(), babyId: baby.id, doneAt: null, doneBy: null, createdBy: me, createdAt: stamp, updatedAt: stamp });
      showToast(`已加入提醒：${x.rem.title}`);
    }
    setSgDone(d => [...d, x.id]);
  };
  const confirmPlan = async (g: { d: Date; xs: { x: (typeof PLAN)[number] }[] }) => {
    const vaxs = g.xs.filter(q => q.x.cat === 'vax');
    const stamp = new Date().toISOString();
    await putHealth('reminders', {
      id: uid(), babyId: baby.id, cat: vaxs.length ? 'vax' : 'check', title: g.xs.map(q => q.x.name).join('、').slice(0, 40),
      dueAt: new Date(g.d.getFullYear(), g.d.getMonth(), g.d.getDate(), 9).toISOString(), repeat: 'none', note: '以接种本和接种门诊通知为准',
      source: 'plan', planKey: g.xs.map(q => q.x.key).join('+').slice(0, 40), confirmed: true, doneAt: null, doneBy: null, createdBy: me, createdAt: stamp, updatedAt: stamp,
    });
    showToast('已确认，到时候团团提醒你 · 日期可以点开改');
  };

  /* —— 病程时间线 —— */
  const tl = (e: Episode) => {
    const rs = episodeRecords(records, e);
    type It = { at: Date; kind: string; title: string; sub: string; rec?: BabyRecord };
    const items: It[] = [
      ...rs.map(r => ({ at: new Date(r.time), kind: r.type, rec: r,
        title: r.type === 'temp' ? `体温 ${r.values.v?.toFixed(1)}℃` : r.type === 'med' ? `用药 · ${r.values.name || '药'}` : `症状 · ${r.values.name || ''}`,
        sub: r.type === 'temp' ? `${r.values.site || '腋温'} · ${r.createdBy ? `${r.createdBy}记` : ''}${(r.values.v ?? 0) >= 37.5 ? ' · 偏高' : ''}${r.note ? ` · ${r.note}` : ''}`
          : r.type === 'med' ? `${r.values.times ?? 1} 次 · 只记你说的${r.note ? ` · ${r.note}` : ''}` : `${r.note || (r.src === 'voice' ? '语音记录' : '手动记录')} · 不判断原因` })),
      ...e.visits.map(v => ({ at: new Date(v.time), kind: 'visit', title: /^(就诊|复诊)/.test(v.title) ? v.title : `就诊 · ${v.title}`, sub: v.note ? `医生：${v.note}（家长转述）` : '家长记录' })),
    ].sort((a, b) => +b.at - +a.at);
    return { rs, items };
  };
  const dLabel = (d: Date) => (startOfDay(d).getTime() === today.getTime() ? '今天' : md(d));
  const timeline = (e: Episode, tid: string) => {
    const { items } = tl(e);
    return items.length ? (
      <HCard tlc testID={tid}>
        {items.slice(0, 40).map((it, i) => (
          <HRow key={i} first={i === 0} d={dLabel(it.at)} t={`${String(it.at.getHours()).padStart(2, '0')}:${String(it.at.getMinutes()).padStart(2, '0')}`} kind={it.kind} icon={KIND_IC[it.kind]} title={it.title} sub={it.sub}
            onPress={it.rec ? () => openRecord(it.rec!.type, it.rec) : undefined} testID={it.rec ? `tl-h-${it.rec.id}` : undefined} />
        ))}
      </HCard>
    ) : <HCard><Txt f="b8" size={12.5} color={p.sub} style={{ padding: 10 }}>还没有记录 · 在首页按住团团说「体温 38.2」就会归到这里</Txt></HCard>;
  };
  const curve = (e: Episode, withTrend: boolean) => {
    const { rs } = tl(e);
    const s0 = parseYmd(e.startDate)!, e0 = e.endDate ? parseYmd(e.endDate)! : today;
    return (
      <HCard testID="curve-card">
        <Hct icon="thermo" t="体温曲线" right={withTrend ? <HctBtn icon="chart" label="看趋势" onPress={() => openTrend('temp')} testID="h-trend-temp" /> : <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}><Icon name="pill" size={14} /><Mini>= 用药</Mini></View>} />
        {rs.some(r => r.type === 'temp') ? (
          <TempCurve testID="temp-curve" pts={tempPoints(rs)} meds={rs.filter(r => r.type === 'med').map(r => new Date(r.time))} syms={rs.filter(r => r.type === 'symptom').map(r => ({ at: new Date(r.time), t: (r.values.name || '症状').slice(0, 2) }))} start={s0} end={e0 < s0 ? s0 : e0} />
        ) : <Txt f="b8" size={12} color={p.sub} style={{ paddingVertical: 14, textAlign: 'center' }}>记下体温后这里会画出曲线</Txt>}
      </HCard>
    );
  };

  /* —— 疫苗 / 体检 —— */
  const vaxDone = [...health.vaccines].sort((a, b) => a.date.localeCompare(b.date));
  const vaxPend = planned.filter(q => q.x.cat === 'vax' && +q.d >= +today - 30 * DAY).slice(0, 6);
  const vaxOld = planned.filter(q => q.x.cat === 'vax' && +q.d < +today - 30 * DAY);
  const vaxRem = health.reminders.filter(r => r.cat === 'vax' && !occ(r).done);
  const growth = records.filter(r => r.type === 'growth').sort((a, b) => +new Date(b.time) - +new Date(a.time));
  const nextCheck = planned.find(q => q.x.cat === 'check' && +q.d >= +today);
  const checkRem = health.reminders.filter(r => r.cat === 'check' && !occ(r).done);
  const lastCheck = [...PLAN].filter(x => x.cat === 'check' && +planDate(baby, x.months) < +today).pop();

  const longMeds = health.reminders.filter(r => r.cat === 'med' && r.repeat !== 'none').map(r => `${r.title.replace(/^(喂|吃|用)/, '')} · ${REP_T[r.repeat]}`);
  const g0 = growth[0];

  return (
    <Page sref={sref}>
      {/* .hhead */}
      <PTitle title="健康" sub={`${baby.name} · ${ageText(baby.birthday, now, false)} · 只记你说的，不判断病情`} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10, marginHorizontal: 2 }}>
        <HPill testID="hpill-temp" icon="thermo" t={hot ? '今天体温偏高' : fever14 ? '近 2 周记过发热' : '近 2 周无发热'} w={hot} />
        {ep ? <HPill icon="doc" t={`${ep.title} 第 ${episodeDays(ep, now)} 天`} w /> : null}
        <HPill icon="syringe" t={pendGroups[0] ? `下次疫苗约 ${md(pendGroups[0].d)}` : vaxRem[0] ? `疫苗提醒 ${md(new Date(vaxRem[0].dueAt))}` : '疫苗按时'} />
        {sym ? <HPill icon="rash" t="今天记了症状" w /> : null}
      </View>

      {/* 团团建议 */}
      <View>
        <SuggBox testID="sugg" mood={hot || sym || ep ? 'worry' : 'happy'} acc={['chart', ...(night ? ['cap'] : [])]}
          sub={sg.length ? <>翻了翻{baby.name}的记录，有 <Txt f="b9" size={12}>{sg.length}</Txt> 件事想跟你说</> : '都处理好啦，团团给你比心'}>
          {sg.map(x => <SgCard key={x.id} testID={`sg-${x.id.split('-')[0]}`} x={x} on={sgDone.includes(x.id) && !x.action} onAdd={x.rem || x.action || (x.ask && visitRem) ? () => sgAdd(x) : undefined} onGone={() => { dismissSugg(x.id); showToast('好的，团团不再提这条'); }} />)}
        </SuggBox>
      </View>

      {/* 提醒 */}
      <View onLayout={e => { ys.current.rem = e.nativeEvent.layout.y; if (pending.current === 'rem') jump(); }}>
        <HGroup t="提醒" mini={`${todoN} 项待办`} />
      </View>
      <View>
        <Chips testID="rf" opts={[['all', '全部'], ...(Object.keys(RCAT) as RemCat[]).map(k => [k, RCAT[k].n] as [RF, string])]} value={rf} onChange={setRf} />
      </View>
      <HCard testID="rem-card">
        {todo.length ? todo.map(remRow) : <Txt f="b8" size={12.5} color={p.sub} style={{ padding: 10 }}>都完成啦，团团给你比心</Txt>}
        {done.length ? <><Dsep>已完成 · {done.length}</Dsep>{done.slice(0, 6).map((r, i) => remRow(r, i))}</> : null}
      </HCard>
      <DashBtn testID="rem-new" icon="clock" t="新建提醒" sub="用药 · 复诊 · 疫苗 · 体检 · 体温，到点团团举着闹钟叫你" onPress={() => setRemDraft({ cat: rf === 'all' ? 'med' : rf })} />
      <TipLine icon="pill" style={{ marginTop: 10 }}>用药提醒只在你设的时间叫你，点「已喂」顺手记一笔；团团不建议剂量和间隔</TipLine>

      {pendGroups.length ? (
        <>
          <HGroup t="待确认" mini="国家免疫规划（参考）· 确认后才提醒" />
          <HCard testID="plan-card">
            {pendGroups.map((g, i) => (
              <Vx key={+g.d} first={i === 0} t={g.xs.map(q => q.x.name).join('、')} sub={`约 ${md(g.d)}（${ageLabel(g.xs[0].x.months)}）· 参考日期，以接种本为准`}
                right={<HctBtn icon="check" label="确认提醒" onPress={() => confirmPlan(g)} testID={`plan-ok-${i}`} />} />
            ))}
            <Mini>{PLAN_SOURCE}</Mini>
          </HCard>
        </>
      ) : null}

      {/* 病程记录 / 疫苗·体检 */}
      <View style={{ marginTop: 20 }} onLayout={e => { ys.current.ill = e.nativeEvent.layout.y; if (pending.current === 'ill') jump(); }}>
        <SegBig testID="ht" k={hcol(p, night).temp} value={tab} onChange={setHealthTab} opts={[['ill', '病程记录', 'thermo'], ['vax', '疫苗 · 体检', 'syringe']]} />
      </View>

      {tab === 'ill' ? (
        <View testID="ill-tab">
          {ep ? (
            <>
              <HGroup t={`${epRange(ep)} · ${ep.title}`} mini={`进行中 · 第 ${episodeDays(ep, now)} 天`} />
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 8, marginHorizontal: 2, flexWrap: 'wrap' }}>
                <HctBtn icon="doc" label="给医生看" onPress={() => setDoctor({ ep })} testID="ep-doctor" />
                <HctBtn icon="hosp" label="记就诊" onPress={() => setVisitFor(ep)} testID="ep-visit" />
                <HctBtn icon="check" label="已康复" onPress={() => setEpEdit({ ep })} testID="ep-open" />
              </View>
              {curve(ep, true)}
              {timeline(ep, 'ep-tl')}
            </>
          ) : (
            <>
              {todayH.length ? (
                <>
                  <HGroup t={`今天 · ${md(now)}`} />
                  <HCard tlc testID="today-h">
                    {todayH.map((r, i) => (
                      <HRow key={r.id} first={i === 0} d="今天" t={`${String(new Date(r.time).getHours()).padStart(2, '0')}:${String(new Date(r.time).getMinutes()).padStart(2, '0')}`} kind={r.type} icon={KIND_IC[r.type]}
                        title={r.type === 'temp' ? `体温 ${r.values.v?.toFixed(1)}℃` : r.type === 'med' ? `用药 · ${r.values.name || '药'}` : `症状 · ${r.values.name || ''}`}
                        sub={r.type === 'temp' ? `${r.values.site || '腋温'} · ${r.src === 'voice' ? '语音' : '手动'}记录${(r.values.v ?? 0) >= 37.5 ? ' · 偏高' : ''}` : r.type === 'med' ? `${r.values.times ?? 1} 次 · 只记你说的` : r.src === 'voice' ? '语音记录 · 不判断原因' : '手动记录'}
                        onPress={() => openRecord(r.type, r)} />
                    ))}
                  </HCard>
                </>
              ) : null}
              <DashBtn testID="ep-new" icon="thermo" t="开始记录一次病程" sub="发烧、咳嗽、出疹…之后首页记的体温、用药、症状会自动归进来" onPress={() => setEpEdit({ ep: null })} style={{ marginTop: 14 }} />
              <HCard style={{ marginTop: 10 }}>
                <Hct icon="thermo" t="体温" right={<HctBtn icon="chart" label="看趋势" onPress={() => openTrend('temp')} testID="h-trend-temp" />} />
                <Mini>{(() => { const t = records.filter(r => r.type === 'temp').sort((a, b) => +new Date(b.time) - +new Date(a.time))[0]; return t ? `最近一次：${whenText(new Date(t.time), now)} ${t.values.v?.toFixed(1)}℃（家长记录）` : '还没有体温记录'; })()}</Mini>
              </HCard>
            </>
          )}
          {shownPast ? (
            <>
              <HGroup t={`${epRange(shownPast)} · ${shownPast.title}`} ok="已康复" />
              {curve(shownPast, false)}
              {timeline(shownPast, 'past-tl')}
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 8, marginHorizontal: 2 }}>
                <HctBtn icon="doc" label="给医生看" onPress={() => setDoctor({ ep: shownPast })} testID="past-doctor" />
                <HctBtn icon="pen" label="改一下" onPress={() => setEpEdit({ ep: shownPast })} testID="past-edit" />
              </View>
              {past.length > 1 ? (
                <>
                  <HGroup t="过往病程" mini={`${past.length} 次`} />
                  <HCard testID="past-list">
                    {past.map((e, i) => <Vx key={e.id} first={i === 0} done t={`${e.title} · ${epRange(e)}`} sub={`${episodeDays(e, now)} 天 · ${e.visits.length ? `就诊 ${e.visits.length} 次 · ` : ''}已康复`} onPress={() => setPastId(e.id)} testID={`past-${e.id}`} />)}
                  </HCard>
                </>
              ) : null}
            </>
          ) : null}
        </View>
      ) : (
        <View testID="vax-tab">
          <HGroup t="疫苗" mini="参考国家免疫规划 · 以接种本为准" />
          <HCard testID="vax-card">
            {vaxDone.length > 3 && !showAllVax ? <Vx first done t={`更早已接种 ${vaxDone.length - 3} 剂`} sub="点开看全部接种记录" onPress={() => setShowAllVax(true)} testID="vax-more" /> : null}
            {(showAllVax ? vaxDone : vaxDone.slice(-3)).map((v, i) => <Vx key={v.id} first={i === 0 && (vaxDone.length <= 3 || showAllVax)} done t={v.name} sub={`已接种 · ${md(parseYmd(v.date)!)}${v.note ? ` · ${v.note}` : ''}`} onPress={() => setVax(v)} testID={`vax-${v.id}`} />)}
            {vaxRem.map((r, i) => <Vx key={r.id} first={!vaxDone.length && i === 0} t={r.title} sub={`待接种 · ${whenText(new Date(r.dueAt), now, false)} · 提醒已设`} onPress={() => setVax({ name: r.title.split('、')[0] })} />)}
            {vaxPend.map((q, i) => <Vx key={q.x.key} first={!vaxDone.length && !vaxRem.length && i === 0} t={q.x.name} sub={`待接种 · 约 ${md(q.d)}（${ageLabel(q.x.months)}）· 参考`} onPress={() => setVax({ name: q.x.name })} testID={`vaxp-${q.x.key}`} />)}
            {vaxOld.length ? (showOld
              ? vaxOld.map(q => <Vx key={q.x.key} t={q.x.name} sub={`${ageLabel(q.x.months)} · 约 ${md(q.d)} · 未登记 · 点一下补登`} onPress={() => setVax({ name: q.x.name, date: undefined })} />)
              : <Vx t={`更早的 ${vaxOld.length} 剂还没登记`} sub="打过的话点开补登，以接种本为准" onPress={() => setShowOld(true)} testID="vax-old" />) : null}
          </HCard>
          <DashBtn testID="vax-new" icon="syringe" t="登记接种" sub="名称和日期照着接种本写就好" onPress={() => setVax({ name: '' })} style={{ marginTop: 10 }} />
          <HGroup t="体检" />
          <HCard testID="check-card">
            <Hct icon="ruler" t="身高体重" right={<HctBtn icon="chart" label="看成长曲线" onPress={() => openTrend('growth')} testID="h-trend-growth" />} />
            {growth.slice(0, 3).map((g, i) => <Vx key={g.id} first={i === 0} done t={`家里量 · ${whenText(new Date(g.time), now, false)}`} sub={`${g.values.cm ? `身长 ${g.values.cm} cm` : ''}${g.values.cm && g.values.kg ? ' · ' : ''}${g.values.kg ? `体重 ${g.values.kg} kg` : ''}（家长记录，以体检为准）`} onPress={() => openRecord('growth', g)} />)}
            {checkRem.map(r => <Vx key={r.id} t={`${r.title} · ${md(new Date(r.dueAt))}`} sub="提醒已设 · 到时候按住团子说身高体重就能记" />)}
            {nextCheck && !checkRem.length ? <Vx t={`${nextCheck.x.name} · 约 ${md(nextCheck.d)}`} sub="参考儿童健康管理时间 · 以社区通知为准" /> : null}
          </HCard>
          <HGroup t="过敏" />
          <HCard testID="allergy-card">
            <Hct icon="warn" t={health.allergies.length ? `${health.allergies.length} 项` : '暂无已知过敏'} right={<HctBtn icon="plus" label="添加" onPress={() => setAllergy({ a: null })} testID="allergy-new" />} />
            {health.allergies.map((a, i) => <Vx key={a.id} first={i === 0} t={a.name} sub={a.note || '家长记录'} onPress={() => setAllergy({ a })} testID={`allergy-${a.id}`} />)}
          </HCard>
        </View>
      )}

      {/* 就医要点 */}
      <HCard testID="h-key" style={{ marginTop: 18 }}>
        <Hct icon="medbook" t="就医要点" right={<HctBtn icon="doc" label="给医生摘要" onPress={() => setDoctor({ ep: ep ?? null })} testID="key-doctor" />} />
        <Kv first k="过敏" v={health.allergies.length ? health.allergies.map(a => a.name).join('、') : '暂无已知过敏'} warn={!!health.allergies.length} />
        <Kv k="既往" v={past.length ? past.slice(0, 2).map(e => `${e.title} · ${epRange(e)} · 已康复`).join('；') : '暂无记录'} />
        <Kv k="长期用药" v={longMeds.length ? `${longMeds.join('、')}（家长记录）` : '暂无'} />
        <Kv k="最近体检" v={g0 ? `${md(new Date(g0.time))}${g0.values.cm ? ` · ${g0.values.cm} cm` : ''}${g0.values.kg ? ` · ${g0.values.kg} kg` : ''}` : lastCheck ? `${lastCheck.name}（约 ${md(planDate(baby, lastCheck.months))}）` : '暂无'} />
      </HCard>
      <FootNote>健康页只记录你说的内容，团团不判断病情、不建议剂量{'\n'}疫苗 / 体检日期参考国家免疫规划，以接种本为准</FootNote>

      <ReminderSheet draft={remDraft} onClose={() => setRemDraft(null)} />
      <EpisodeSheet open={!!epEdit} ep={epEdit?.ep ?? null} onClose={() => setEpEdit(null)} />
      <VisitSheet open={!!visitFor} ep={visitFor} onClose={() => setVisitFor(null)} />
      <AllergySheet open={!!allergy} item={allergy?.a ?? null} onClose={() => setAllergy(null)} />
      <VaccineSheet draft={vax} onClose={() => setVax(null)} />
      <DoctorSheet open={!!doctor} ep={doctor?.ep ?? null} onClose={() => setDoctor(null)} />
    </Page>
  );
}
