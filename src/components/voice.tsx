/* M3 语音一句话记录 —— 界面严格沿用原型：
   · 听写浮层 .listen-ov（index.html 200-226, 991-1015）
   · 识别确认卡 .sheet .heard .split .rc .editor .clar .risk .actions .btn.pri .fill .autosave（227-275, 1028-1090, 1359-1399）
   录音 → Edge Function（Fun-ASR + qwen-flash）→ 确认卡 → 家长点「记下来」（或 3 秒自动）才写 records（src = voice）。
   麦克风不可用 / 没听清 / 没登录 / 断网 → 打字一句话，走同样的解析（AI 不可用时用本地规则）。 */
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, View } from 'react-native';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';
import { useApp, LVN } from '@/state/app-state';
import { useLvAcc } from '@/state/hooks';
import { voice, useVoice, Draft, Target } from '@/state/voice';
import { MicError, useRecorder } from '@/lib/recorder';
import { localCtx, parseLocal, parseRemote, VEvent, VoiceParse } from '@/lib/voice-api';
import { getRepo } from '@/data/repo';
import { cloud } from '@/data/sync';
import { TYPE_IC } from '@/data/mock';
import type { BabyRecord, RecordType, RecordValues } from '@/data/types';
import { dayEvs, dur, fmt, predict, SUBN } from '@/lib/calc';
import { hhmm, startOfDay } from '@/lib/time';
import { Icon, Tuan } from '@/lib/svg';
import { hard } from '@/theme/tokens';
import { IS_WEB } from './chrome';
import { Txt } from './txt';
import { Actions, Autosave, Btn, Editor, Heard, Inp, NoteS, Rc, Risk, Row, Seg, Sheet, Split, Stepper } from './ui';

const HEALTH: RecordType[] = ['temp', 'med', 'symptom', 'growth'];
const SITES = ['腋温', '耳温', '额温'];

/* ---------- 逻辑：按住 → 录音 → 识别 → 确认 ---------- */
function findTarget(p: VoiceParse, records: BabyRecord[], now: Date): Target {
  const u = p.update; if (!u) return null;
  const recent = records.filter(r => +now - +new Date(r.time) < 24 * 3600000).sort((a, b) => +new Date(b.time) - +new Date(a.time));
  if (u.kind === 'wake') { const r = recent.find(x => x.type === 'sleep' && !x.endTime); return r ? { rec: r, from: null, found: true } : null; }
  const feeds = recent.filter(r => r.type === 'feed' && r.values.sub !== 'breast');
  const byTime = u.near ? feeds.find(r => hhmm(new Date(r.time)) === u.near) : undefined;
  const byMl = u.fromMl ? feeds.find(r => r.values.ml === u.fromMl) : undefined;
  const r = byTime ?? byMl ?? feeds[0];
  return r ? { rec: r, from: r.values.ml ?? null, found: !!(byTime || byMl) } : null;
}

export function VoiceLayer() {
  const app = useApp();
  const { baby, records, showToast } = app;
  const rec = useRecorder();
  const v = useVoice();
  const t0 = useRef(0);
  const noCloud = useRef(false);

  useEffect(() => {
    const openConfirm = (text: string, parse: VoiceParse, asr: string) => {
      if (parse.action === 'update') {
        const target = findTarget(parse, records, new Date());
        if (!target) { voice.set({ phase: 'type', typeReason: parse.update?.kind === 'wake' ? '没找到进行中的睡眠，打一句话或手动记一笔' : '最近没有找到可以改的喂奶记录', typeText: text, busy: false }); return; }
        voice.set({ phase: 'confirm', busy: false, draft: { text, parse, asr, editing: -1, paused: false, target } });
        return;
      }
      voice.set({ phase: 'confirm', busy: false, draft: { text, parse, asr, editing: -1, paused: false, target: null } });
    };
    voice.h.begin = async () => {
      if (!baby) return;
      /* 没登录 / 没加入家庭：AI 语音用不了，不白录一段，直接打字（本地规则解析） */
      const link = cloud.state.link;
      t0.current = Date.now();
      if (!link || link.babyId !== baby.id) { noCloud.current = true; return; }
      voice.set({ phase: 'listen', cancel: false, draft: null }); voice.resetBars();
      try { await rec.start(lv => voice.level(lv)); }
      catch (e) {
        const code = e instanceof MicError ? e.code : 'failed';
        voice.set({ phase: 'type', busy: false, typeText: '', typeReason: code === 'denied' ? '麦克风没打开，打一句话也行' : code === 'unsupported' ? '这里没法录音，打一句话也行' : '录音没开起来，打一句话也行' });
      }
    };
    voice.h.end = async (short: boolean) => {
      if (noCloud.current) {
        noCloud.current = false;
        if (short || Date.now() - t0.current < 450) showToast('要按住团子说话哦～');
        else voice.set({ phase: 'type', busy: false, typeText: '', typeReason: '登录并加入家庭后可以用 AI 语音，先打一句话吧' });
        return;
      }
      const s = voice.get(); if (s.phase !== 'listen') return;
      if (s.cancel) { await rec.cancel(); voice.set({ phase: 'idle' }); showToast('已取消，没有保存任何记录'); return; }
      if (short || Date.now() - t0.current < 450) { await rec.cancel(); voice.set({ phase: 'idle' }); showToast('要按住团子说话哦～'); return; }
      voice.set({ phase: 'thinking' });
      let audio;
      try { audio = await rec.stop(); } catch (e) { console.warn('[voice] stop failed', (e as Error)?.message); voice.set({ phase: 'type', typeReason: '录音没录上，打一句话也行', typeText: '' }); return; }
      if (audio.ms < 700) { voice.set({ phase: 'idle' }); showToast('要按住团子说话哦～'); return; }
      /* 16k 16bit：0.3 秒 ≈ 12.8k 个 base64 字符；麦克风刚打开时可能一帧都没拿到 */
      if (audio.b64.length < 12800) { voice.set({ phase: 'idle' }); showToast('没录到声音，再按住团子说一次'); return; }
      const r = await parseRemote({ audio }, baby!.id, records);
      if (r.ok) openConfirm(r.text, r.parse, r.asr);
      else voice.set({ phase: 'type', typeReason: r.message, typeText: '', busy: false });
    };
    voice.h.openType = (reason?: string, text?: string) => voice.set({ phase: 'type', typeReason: reason ?? null, typeText: text ?? '', busy: false });
    typeSubmit = async (text: string) => {
      if (!baby || !text.trim()) return;
      voice.set({ busy: true });
      const r = await parseRemote({ text: text.trim() }, baby.id, records);
      if (r.ok) { openConfirm(r.text, r.parse, 'text'); return; }
      /* AI 不可用（没登录 / 断网 / 未配置 / 次数用完）：本地规则解析，同样弹确认卡 */
      const p = parseLocal(text.trim(), localCtx(records, baby.name, baby.feeding));
      openConfirm(text.trim(), p, 'local');
    };
  }, [baby, records, rec, showToast]);

  return (
    <>
      {v.phase === 'listen' || v.phase === 'thinking' ? <ListenOverlay /> : null}
      {v.phase === 'confirm' && v.draft ? <ConfirmCard key={v.draft.text + v.draft.parse.events.length} d0={v.draft} /> : null}
      {v.phase === 'type' ? <TypeSheet /> : null}
    </>
  );
}
let typeSubmit: (text: string) => Promise<void> = async () => {};

/* ---------- 听写浮层（原型 .listen-ov） ---------- */
function Ripple({ delay }: { delay: number }) {
  const [a] = useState(() => new Animated.Value(0));
  useEffect(() => {
    const l = Animated.loop(Animated.sequence([Animated.delay(delay), Animated.timing(a, { toValue: 1, duration: 1800, easing: Easing.out(Easing.quad), useNativeDriver: !IS_WEB }), Animated.timing(a, { toValue: 0, duration: 0, useNativeDriver: !IS_WEB })]));
    l.start(); return () => l.stop();
  }, [a, delay]);
  return <Animated.View pointerEvents="none" style={[s.ringp, { opacity: a.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }), transform: [{ scale: a.interpolate({ inputRange: [0, 1], outputRange: [0.55, 1.35] }) }] }]} />;
}
function Dots() {
  const [a] = useState(() => new Animated.Value(0));
  useEffect(() => { const l = Animated.loop(Animated.timing(a, { toValue: 1, duration: 1000, easing: Easing.linear, useNativeDriver: !IS_WEB })); l.start(); return () => l.stop(); }, [a]);
  const { p } = useApp();
  return (
    <View style={s.dots}>
      {[0, 0.15, 0.3].map((d, i) => {
        const r = [0, d, d + 0.25, d + 0.5, 1].map(x => Math.min(1, x));
        return <Animated.View key={i} style={[s.dot, { backgroundColor: p.ink, opacity: a.interpolate({ inputRange: r, outputRange: [0.4, 0.4, 1, 0.4, 0.4], extrapolate: 'clamp' }), transform: [{ translateY: a.interpolate({ inputRange: r, outputRange: [0, 0, -5, 0, 0], extrapolate: 'clamp' }) }] }]} />;
      })}
    </View>
  );
}
function Cursor() {
  const [on, setOn] = useState(true);
  useEffect(() => { const t = setInterval(() => setOn(x => !x), 400); return () => clearInterval(t); }, []);
  return <View style={[s.cur, { opacity: on ? 1 : 0 }]} />;
}
function ListenOverlay() {
  const { p, night } = useApp(); const acc = useLvAcc(); const v = useVoice();
  const thinking = v.phase === 'thinking';
  const c0 = v.cancel ? '#ddd' : night ? '#5a3a40' : '#FFC4CF', c1 = v.cancel ? '#bbb' : night ? '#3a262a' : p.pink;
  return (
    <View testID="listen-ov" pointerEvents="none" style={s.ov}>
      <Svg style={StyleSheet.absoluteFill} width="100%" height="100%">
        <Defs><RadialGradient id="lg" cx="50%" cy="38%" r="75%" fx="50%" fy="38%"><Stop offset="0" stopColor={c0} /><Stop offset="0.7" stopColor={c1} /><Stop offset="1" stopColor={c1} /></RadialGradient></Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#lg)" />
      </Svg>
      <View style={s.top}>
        {thinking
          ? <><View style={{ flexDirection: 'row', alignItems: 'center' }}><Txt f="h" size={30}>团团在整理</Txt><Dots /></View><Txt f="b8" size={13} style={s.topS}>语音转文字 → 拆成结构化记录 → 规则校验</Txt></>
          : <><Txt f="h" size={30}>团团在听…</Txt><Txt f="b8" size={13} style={s.topS}>按住说话，说完松手</Txt></>}
      </View>
      <View style={s.stage}>
        <Ripple delay={0} /><Ripple delay={600} /><Ripple delay={1200} />
        <View style={s.stageT}><Tuan mood={thinking ? 'idle' : 'listen'} acc={thinking ? (night ? ['cap', 'book'] : ['book', ...acc]) : acc} size={210} cls={thinking ? '' : 'listen'} /></View>
      </View>
      <View style={[s.wave, thinking && { opacity: 0.25 }]}>
        {v.bars.map((h, i) => <View key={i} style={[s.bar, { height: h, backgroundColor: p.ink }]} />)}
      </View>
      <View style={[s.live, { backgroundColor: p.card, borderColor: p.ink }, hard(p, 5)]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' }}>
          <Txt f="b7" size={15} color={p.sub}>{thinking ? '正在把语音转成文字…' : '正在听…'}</Txt>{thinking ? null : <Cursor />}
        </View>
      </View>
      <View style={s.bottom}><View style={[s.hint, { backgroundColor: night ? 'rgba(0,0,0,.25)' : 'rgba(255,255,255,.6)' }]}><Txt f="b9" size={13}>{v.cancel && !thinking ? '松开手指，取消这次录音' : '松开就记好 · 上滑取消'}</Txt></View></View>
    </View>
  );
}

/* ---------- 识别确认卡（原型 renderConfirm / recCard / editor / extraBoxes） ---------- */
function dayPrefix(iso: string, now: Date) { const d = Math.round((+startOfDay(now) - +startOfDay(new Date(iso))) / 86400000); return d === 0 ? '' : d === 1 ? '昨天 ' : `${d} 天前 `; }
function cardOf(e: VEvent, now: Date) {
  const v = e.values, def = (k: string) => (e.def || []).includes(k);
  const tags: { t: string; def?: boolean; num?: boolean; clock?: boolean }[] = [{ t: dayPrefix(e.time, now) + hhmm(new Date(e.time)), clock: true }];
  let t = '';
  switch (e.type) {
    case 'feed':
      if (v.sub === 'breast') { t = `亲喂 ${v.mins ?? 15} 分钟`; tags.push({ t: `${v.mins ?? 15} 分钟`, num: true }); }
      else { t = `喂奶${v.ml ? ' ' + v.ml + 'ml' : ''}`; if (v.ml) tags.push({ t: `${v.ml} ml`, num: true }); }
      tags.push({ t: `${SUBN[v.sub ?? 'formula']}${def('sub') ? ' · 默认' : ''}`, def: def('sub') }); break;
    case 'sleep': t = e.endTime ? `睡觉 · ${dur(Math.round((+new Date(e.endTime) - +new Date(e.time)) / 60000))}` : '开始睡觉'; tags.push({ t: e.endTime ? `到 ${hhmm(new Date(e.endTime))}` : '进行中' }); break;
    case 'diaper': t = `换尿布 · ${SUBN[v.sub ?? 'pee']}`; tags.push({ t: `${SUBN[v.sub ?? 'pee']}${def('sub') ? ' · 默认' : ''}`, def: def('sub') }); break;
    case 'temp': t = `体温 ${v.v}℃`; tags.push({ t: `${v.v} ℃`, num: true }, { t: `${v.site}${def('site') ? ' · 默认' : ''}`, def: def('site') }); if ((v.v ?? 0) >= 37.5 && (v.v ?? 0) < 38) tags.push({ t: '偏高' }); break;
    case 'med': t = `用药 · ${v.name}`; tags.push({ t: `${v.times ?? 1} 次` }, { t: '剂量按医嘱 · 只记你说的', def: true }); break;
    case 'water': t = `喝水 ${v.ml}ml`; tags.push({ t: `${v.ml} ml`, num: true }); break;
    case 'symptom': t = `症状 · ${v.name}`; tags.push({ t: '只记录，不判断原因', def: true }); break;
    case 'growth': t = '身高体重'; if (v.cm) tags.push({ t: `${v.cm} cm`, num: true }); if (v.kg) tags.push({ t: `${v.kg} kg`, num: true }); break;
    case 'bath': t = '洗澡'; tags.push({ t: `${v.mins ?? 10} 分钟`, def: def('mins') }); break;
  }
  return { t, tags };
}

function SaveBtn({ onPress, run, paused }: { onPress: () => void; run: boolean; paused: boolean }) {
  const { p } = useApp();
  const [w] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (!run || paused) { w.stopAnimation(); return; }
    w.setValue(0); const a = Animated.timing(w, { toValue: 1, duration: 3000, easing: Easing.linear, useNativeDriver: false }); a.start(); return () => a.stop();
  }, [run, paused, w]);
  return (
    <Pressable testID="voice-save" onPress={onPress} style={({ pressed }) => [s.btn, { flex: 1.6, backgroundColor: p.yellow, borderColor: p.ink }, pressed ? { transform: [{ translateY: 4 }, { scale: 0.98 }] } : hard(p, 4)]}>
      <Animated.View pointerEvents="none" style={[s.fill, { width: w.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) }]} />
      <Icon name="check" size={20} color={p.ink} /><Txt f="b9" size={16}>记下来</Txt>
    </Pressable>
  );
}

function ConfirmCard({ d0 }: { d0: Draft }) {
  const app = useApp(); const { p, now, baby, addRecord, updateRecord, celebrate, showToast, lvl } = app;
  const acc = useLvAcc();
  const [d, setD] = useState<Draft>(d0);
  const P = d.parse, clar = P.clarify;
  const done = useRef(false);
  const setEv = (i: number, patch: Partial<VEvent> | ((e: VEvent) => VEvent)) => setD(x => ({ ...x, parse: { ...x.parse, events: x.parse.events.map((e, j) => j !== i ? e : typeof patch === 'function' ? patch(e) : { ...e, ...patch }) } }));
  const setVal = (i: number, k: keyof VEvent['values'], val: unknown, undef?: string) => setEv(i, e => ({ ...e, values: { ...e.values, [k]: val }, def: undef ? (e.def || []).filter(x => x !== undef) : e.def }));
  const close = (msg?: string) => { done.current = true; voice.set({ phase: 'idle', draft: null }); if (msg) showToast(msg); };
  const edit = (i: number) => setD(x => ({ ...x, editing: x.editing === i ? -1 : i, paused: true }));
  const adjT = (i: number, m: number) => setEv(i, e => ({ ...e, time: new Date(Math.min(Date.now(), +new Date(e.time) + m * 60000)).toISOString(), def: (e.def || []).filter(x => x !== 'time') }));
  const answer = (ml: number) => setD(x => ({ ...x, parse: { ...x.parse, clarify: null, events: x.parse.events.map((e, j) => j === clar!.index ? { ...e, values: { ...e.values, ml } } : e) } }));

  const commit = async () => {
    if (done.current || !baby) return; done.current = true;
    voice.set({ phase: 'idle', draft: null });
    if (P.action === 'update' && d.target) {
      const r = d.target.rec;
      if (P.update?.kind === 'wake') { await updateRecord(r.id, { endTime: P.update.at }); showToast(`改好啦！睡了 ${dur(Math.round((+new Date(P.update.at) - +new Date(r.time)) / 60000))}`); return; }
      if (P.update?.kind === 'feed_ml') { await updateRecord(r.id, { values: { ...r.values, ml: P.update.toMl } }); celebrate({ say: '改好啦！', extra: `${P.update.toMl}ml` }); setTimeout(() => celebrate(null), 1500); return; }
    }
    let lvUp = false;
    for (const e of P.events) {
      const res = await addRecord({ type: e.type, time: e.time, endTime: e.type === 'sleep' ? (e.endTime ?? null) : undefined, values: e.values as RecordValues, note: e.note, src: 'voice' });
      lvUp = lvUp || res.lvUp;
    }
    const calm = P.safety === 'fever' || P.safety === 'symptom';
    const feeds = P.events.filter(e => e.type === 'feed' && e.values.ml);
    celebrate({ say: calm ? '记下啦' : '记好啦！', calm, extra: feeds.length === 1 ? `${feeds[0].values.ml}ml` : undefined });
    const all = await getRepo().listRecords(baby.id);
    const n = new Date(), pr = predict(all, dayEvs(all, n), n);
    setTimeout(() => {
      celebrate(null);
      showToast(lvUp ? `团团升级啦！Lv.${Math.min(5, lvl + 1)} ${LVN[Math.min(5, lvl + 1)]}`
        : P.safety === 'symptom' ? '已记入健康档案 · 拿不准就问问医生'
        : P.safety === 'fever' ? '已记入健康档案 · 不舒服请及时就医'
        : P.events.some(e => HEALTH.includes(e.type)) ? '已同步到健康档案'
        : pr.ongoing ? '已记下进行中的睡眠，醒了说一声「醒了」就好' : `预测已刷新：下次喂奶约 ${fmt(pr.win[0])}–${fmt(pr.win[1])}`, 2600);
    }, 1500);
  };
  /* 3 秒自动保存（追问 / 暂停 / 没内容时不自动） */
  const auto = !clar && !d.paused && P.action !== 'none';
  const commitRef = useRef(commit);
  useEffect(() => { commitRef.current = commit; });
  useEffect(() => { if (!auto) return; const t = setTimeout(() => commitRef.current(), 3000); return () => clearTimeout(t); }, [auto]);

  const engine = P.engine === 'rules' ? '本地规则解析' : `AI 解析 · 置信度 ${P.confidence.toFixed(2)}`;
  const ev0 = P.events.find(e => e.type === 'temp');
  let mid: React.ReactNode = null;
  if (clar) {
    mid = (
      <View testID="voice-clar" style={[s.clar, { backgroundColor: p.card, borderColor: p.ink }, hard(p, 4)]}>
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}><Icon name="sparkle" size={22} fill="#FF9EB1" /><Txt f="h" size={20}>{clar.question}</Txt></View>
        <Txt f="b8" size={12} color={p.sub} style={{ marginTop: 4, marginBottom: 12 }}>瓶喂没说奶量会影响统计，团团只追问这一次～</Txt>
        <View style={s.opts}>{clar.options.map(o => (
          <Pressable key={o} testID={`clar-${o}`} onPress={() => answer(o)} style={({ pressed }) => [s.opt, { backgroundColor: p.yellowS, borderColor: p.ink }, pressed ? { transform: [{ translateY: 3 }] } : hard(p, 3)]}><Txt f="b9" size={16}>{o}</Txt></Pressable>
        ))}</View>
        <Txt f="b8" size={12} color={p.sub} style={{ marginTop: 10 }}>也可以按住团子，再说一句「120 毫升」</Txt>
      </View>
    );
  } else if (P.action === 'update' && d.target) {
    const r = d.target.rec, u = P.update!, at = dayPrefix(r.time, now) + hhmm(new Date(r.time));
    mid = u.kind === 'feed_ml' ? <>
      <Split left={d.target.found ? `一句话修改 · 找到 ${at} 那次喂奶` : `没找到 ${u.fromMl ?? ''}ml，改最近一次（${at}）`} chip="action: update" />
      <Rc kind="feed" icon="bottle" title={`修改喂奶记录 · ${at}`} tags={[]} edit={null} testID="voice-upd"
        diff={<><Txt f="b9" size={15} style={{ opacity: 0.45, marginRight: 6, textDecorationLine: 'line-through' }}>{d.target.from ?? '?'}ml</Txt><Txt f="b9" size={15}>→ {u.toMl}ml</Txt></>} />
    </> : <>
      <Split left={`一句话修改 · 找到 ${at} 开始的睡眠`} chip="action: update" />
      <Rc kind="sleep" icon="sleep" title={`醒啦 · ${hhmm(new Date(u.at))}`} tags={[{ t: `${hhmm(new Date(r.time))} 入睡`, clock: true }, { t: `睡了 ${dur(Math.max(0, Math.round((+new Date(u.at) - +new Date(r.time)) / 60000)))}` }]} edit={null} testID="voice-upd" />
    </>;
  } else if (P.action !== 'none') {
    mid = <>
      <Split left={`拆出 ${P.events.length} 条记录`} chip={engine} />
      {P.events.map((e, i) => {
        const c = cardOf(e, now), v = e.values;
        return (
          <View key={i}>
            <Rc kind={e.type} icon={TYPE_IC[e.type]} title={c.t} tags={c.tags} onPress={() => edit(i)} testID={`voice-rc-${i}`} />
            {d.editing === i ? (
              <Editor>
                <Row label="时间"><Stepper testID="v-time" val={hhmm(new Date(e.time))} onMinus={() => adjT(i, -5)} onPlus={() => adjT(i, 5)} /></Row>
                {e.type === 'feed' ? <>
                  {v.sub === 'breast'
                    ? <Row label="时长"><Stepper testID="v-mins" val={`${v.mins ?? 15} 分钟`} minW={86} onMinus={() => setVal(i, 'mins', Math.max(1, (v.mins ?? 15) - 5))} onPlus={() => setVal(i, 'mins', Math.min(90, (v.mins ?? 15) + 5))} /></Row>
                    : <Row label="奶量"><Stepper testID="v-ml" val={`${v.ml || 0} ml`} onMinus={() => setVal(i, 'ml', Math.max(10, (v.ml || 0) - 10))} onPlus={() => setVal(i, 'ml', Math.min(300, (v.ml || 0) + 10))} /></Row>}
                  <Seg testID="v-sub" opts={(['formula', 'bm', 'breast'] as const).map(k => ({ k, t: SUBN[k] }))} value={(v.sub as 'formula') ?? 'formula'} onChange={k => setEv(i, x => ({ ...x, values: { ...x.values, sub: k, ml: k === 'breast' ? null : x.values.ml ?? 120, mins: k === 'breast' ? x.values.mins ?? 15 : undefined }, def: (x.def || []).filter(y => y !== 'sub') }))} />
                </> : null}
                {e.type === 'diaper' ? <Seg testID="v-dsub" opts={(['pee', 'poop', 'both'] as const).map(k => ({ k, t: SUBN[k] }))} value={(v.sub as 'pee') ?? 'pee'} onChange={k => setVal(i, 'sub', k, 'sub')} /> : null}
                {e.type === 'temp' ? <>
                  <Row label="体温"><Stepper testID="v-temp" val={`${v.v} ℃`} onMinus={() => setVal(i, 'v', Math.round(((v.v ?? 36.8) - 0.1) * 10) / 10)} onPlus={() => setVal(i, 'v', Math.round(((v.v ?? 36.8) + 0.1) * 10) / 10)} /></Row>
                  <Seg testID="v-site" opts={SITES.map(k => ({ k, t: k }))} value={v.site ?? '腋温'} onChange={k => setVal(i, 'site', k, 'site')} />
                </> : null}
                {e.type === 'water' ? <Row label="水量"><Stepper testID="v-wml" val={`${v.ml} ml`} onMinus={() => setVal(i, 'ml', Math.max(10, (v.ml ?? 30) - 10))} onPlus={() => setVal(i, 'ml', Math.min(300, (v.ml ?? 30) + 10))} /></Row> : null}
                {e.type === 'med' || e.type === 'symptom' ? <Inp testID="v-name" value={v.name ?? ''} onChangeText={t => setVal(i, 'name', t.slice(0, 20), 'name')} placeholder={e.type === 'med' ? '药名（按医生说的写）' : '什么情况（只记录，不判断）'} maxLength={20} /> : null}
                {e.type === 'med' ? <NoteS>药名和剂量可以在这里补充成你听医生说的；团团不会推荐剂量。</NoteS> : null}
                {e.type === 'water' ? <NoteS>只记录喝了多少，团团不给饮水量建议</NoteS> : null}
              </Editor>
            ) : null}
          </View>
        );
      })}
      {P.safety === 'fever' && ev0 ? <Risk title={`${ev0.values.v}℃ 已帮你记下`} items={['体温 ≥38℃，建议及时就医', '团团不判断病情，也不建议用药剂量，用药只记你说的', '如果精神差、呼吸急促、抽搐、持续高烧不退，或不吃不尿，请尽快就医']} /> : null}
      {P.safety === 'symptom' ? <Risk title="已帮你记下这条症状" items={['团团只记录，不判断原因，拿不准就问问医生', '如果嘴唇或眼睛肿、呼吸困难、反复呕吐、精神差，请立即就医或拨打 120']} /> : null}
      {P.safety === 'high' && ev0 ? <NoteS>{`${ev0.values.v}℃ 偏高（37.5℃ 以上会标「偏高」），多留意宝宝精神；到 38℃ 或精神差请及时就医`}</NoteS> : null}
    </>;
  }
  const advice = P.advice ? <Risk title="团团只负责记录" items={['用药剂量、喝多少水请听医生的，团团不给建议', '精神差、呼吸困难、抽搐时请立即就医或拨打 120']} /> : null;

  if (P.action === 'none') {
    return (
      <Sheet open onClose={() => close('已取消')} testID="voice-sheet">
        <Heard mood="shy" acc={acc} t="这句话里没找到要记的" sub={`「${d.text}」`} />
        <View style={{ marginTop: 14 }}>{advice}</View>
        <Actions><Btn label="算了" onPress={() => close()} testID="voice-cancel" /><Btn label="打字改一改" kind="pri" onPress={() => voice.h.openType('打一句要记的事', d.text)} testID="voice-retype" /></Actions>
        <Autosave>团团只记录喂奶、睡觉、尿布、体温、用药这些事</Autosave>
      </Sheet>
    );
  }
  return (
    <Sheet open onClose={() => close('已取消')} testID="voice-sheet">
      <Heard mood={clar ? 'shy' : 'happy'} acc={acc} t={clar ? '差一点点就记好啦' : '听到啦！'} sub={`「${d.text}」`} />
      {mid}
      {advice}
      {clar ? <Actions><Btn label="算了" onPress={() => close('已取消，没有保存半成品记录')} testID="voice-cancel" /></Actions> : <>
        <Actions>
          <Btn label="撤销" onPress={() => close('已撤销，这句话没有写入记录')} testID="voice-undo" />
          <SaveBtn onPress={commit} run={auto} paused={d.paused} />
        </Actions>
        <Autosave>{d.paused ? '已暂停自动保存，改好了点「记下来」' : '3 秒后自动保存 · 点卡片可以改'}</Autosave>
      </>}
    </Sheet>
  );
}

/* ---------- 打字一句话（兜底） ---------- */
function TypeSheet() {
  const acc = useLvAcc(); const v = useVoice();
  const [text, setText] = useState(v.typeText);
  const ex = '十点喝了 120 毫升奶，拉了一次';
  return (
    <Sheet open onClose={() => voice.set({ phase: 'idle' })} testID="type-sheet">
      <Heard mood="shy" acc={acc} t="打一句话也行" sub={v.typeReason ?? '像说话一样写一句，团团帮你拆成记录'} />
      <View style={{ marginTop: 14 }}>
        <Inp testID="type-input" value={text} onChangeText={setText} placeholder={`比如：${ex}`} maxLength={100} autoFocus onSubmitEditing={() => typeSubmit(text)} returnKeyType="send" />
      </View>
      <Actions>
        <Btn label="算了" onPress={() => voice.set({ phase: 'idle' })} testID="type-cancel" />
        <Btn label={v.busy ? '团团在整理…' : '交给团团'} icon="sparkle" kind="pri" disabled={v.busy || !text.trim()} onPress={() => typeSubmit(text)} testID="type-go" />
      </Actions>
      <Autosave>只记录，不诊断、不给剂量和喂水量建议</Autosave>
    </Sheet>
  );
}

const s = StyleSheet.create({
  ov: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 100, overflow: 'hidden' },
  top: { position: 'absolute', top: 84, left: 0, right: 0, alignItems: 'center' },
  topS: { opacity: 0.75, marginTop: 4 },
  dots: { flexDirection: 'row', gap: 4, marginLeft: 6 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  stage: { position: 'absolute', top: 180, left: '50%', marginLeft: -115, width: 230, height: 230 },
  ringp: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: 115, borderWidth: 3, borderColor: 'rgba(255,255,255,.8)' },
  stageT: { position: 'absolute', top: 10, left: 10 },
  wave: { position: 'absolute', top: 438, left: 0, right: 0, height: 56, flexDirection: 'row', gap: 5, alignItems: 'center', justifyContent: 'center' },
  bar: { width: 6, borderRadius: 6 },
  live: { position: 'absolute', left: 24, right: 24, top: 516, minHeight: 76, borderWidth: 3, borderRadius: 24, paddingVertical: 14, paddingHorizontal: 16 },
  cur: { width: 3, height: 19, backgroundColor: '#E5738A', marginLeft: 2 },
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 131, alignItems: 'center' },
  hint: { paddingVertical: 6, paddingHorizontal: 14, borderRadius: 99 },
  btn: { height: 54, borderRadius: 99, borderWidth: 3, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, overflow: 'hidden' },
  fill: { position: 'absolute', left: 0, top: 0, bottom: 0, backgroundColor: 'rgba(255,255,255,.45)' },
  clar: { borderWidth: 2.5, borderRadius: 24, padding: 14, marginTop: 14 },
  opts: { flexDirection: 'row', gap: 8 },
  opt: { flex: 1, height: 48, borderRadius: 18, borderWidth: 2.5, alignItems: 'center', justifyContent: 'center' },
});
