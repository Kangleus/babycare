/* M3 语音解析测试用例：说法 → 期望。固定「现在」= 2026-11-01 18:10（北京时间），宝宝默认奶粉喂养。
   e: 期望的记录（按时间顺序，字段只比对写出来的）；clock = 本地 HH:MM；near = 和「现在」相差分钟内 */
export const NOW = Date.parse('2026-11-01T18:10:00+08:00');
export const CTX = { nowMs: NOW, tzOffsetMin: -480, babyName: '豆米', feeding: 'formula', recent: [
  { type: 'feed', time: '2026-11-01T10:00:00+08:00', ml: 120 }, { type: 'sleep', time: '2026-11-01T16:40:00+08:00', ongoing: true }] };
export const CASES = [
  { g: '喂奶', t: '十点喝了120毫升奶，拉了一次', action: 'create', e: [{ type: 'feed', ml: 120, clock: '10:00' }, { type: 'diaper', sub: 'poop', clock: '10:00' }] },
  { g: '喂奶', t: '刚喂了一瓶奶', action: 'create', clarify: true, e: [{ type: 'feed', ml: null, near: 5 }] },
  { g: '喂奶', t: '下午两点亲喂了二十分钟', action: 'create', e: [{ type: 'feed', sub: 'breast', mins: 20, clock: '14:00' }] },
  { g: '喂奶', t: '早上七点四十喝了一百七十毫升奶粉', action: 'create', e: [{ type: 'feed', sub: 'formula', ml: 170, clock: '07:40' }] },
  { g: '喂奶', t: '吸出来的母乳喂了九十毫升', action: 'create', e: [{ type: 'feed', sub: 'bm', ml: 90 }] },
  { g: '喂奶', t: '半小时前喂了180毫升', action: 'create', e: [{ type: 'feed', ml: 180, clock: '17:40' }] },
  { g: '喂奶', t: '昨天晚上十一点喂了一次奶，150毫升', action: 'create', e: [{ type: 'feed', ml: 150, clock: '23:00', dayAgo: 1 }] },
  { g: '喂奶', t: '刚才那次是150不是120', action: 'update', update: { kind: 'feed_ml', toMl: 150 } },
  { g: '睡眠', t: '刚刚睡着了', action: 'create', e: [{ type: 'sleep', endTime: null, near: 5 }] },
  { g: '睡眠', t: '宝宝从一点睡到三点半', action: 'create', e: [{ type: 'sleep', clock: '13:00', endClock: '15:30' }] },
  { g: '睡眠', t: '宝宝醒了', action: 'update', update: { kind: 'wake' } },
  { g: '尿布', t: '九点五十换了尿布，尿了', action: 'create', e: [{ type: 'diaper', sub: 'pee', clock: '09:50' }] },
  { g: '尿布', t: '又拉又尿，换了个尿不湿', action: 'create', e: [{ type: 'diaper', sub: 'both' }] },
  { g: '尿布', t: '拉了一次臭臭', action: 'create', e: [{ type: 'diaper', sub: 'poop' }] },
  { g: '喂药', t: '喂了一滴维生素D', action: 'create', e: [{ type: 'med', name: '维生素D' }] },
  { g: '喂药', t: '刚喂了美林', action: 'create', e: [{ type: 'med', name: '美林' }] },
  { g: '体温', t: '量了体温三十七度六', action: 'create', safety: 'high', e: [{ type: 'temp', v: 37.6 }] },
  { g: '体温', t: '体温36.8度，耳温', action: 'create', safety: null, e: [{ type: 'temp', v: 36.8, site: '耳温' }] },
  { g: '体温', t: '38度5，刚吃了一次退烧药', action: 'create', safety: 'fever', e: [{ type: 'temp', v: 38.5 }, { type: 'med', name: '退烧药' }], anyOrder: true },
  { g: '多事件', t: '八点喝了150毫升奶然后睡着了', action: 'create', e: [{ type: 'feed', ml: 150, clock: '08:00' }, { type: 'sleep' }] },
  { g: '多事件', t: '刚洗完澡，洗了十五分钟，然后喝了30毫升水', action: 'create', e: [{ type: 'bath', mins: 15 }, { type: 'water', ml: 30 }], anyOrder: true },
  { g: '多事件', t: '量了身高68.5，体重8.2公斤', action: 'create', e: [{ type: 'growth', cm: 68.5, kg: 8.2 }] },
  { g: '症状', t: '脸上起了几个小红点', action: 'create', safety: 'symptom', e: [{ type: 'symptom' }] },
  { g: '症状', t: '咳嗽了几声，流了点鼻涕', action: 'create', safety: 'symptom', e: [{ type: 'symptom' }], atLeast: true },
  { g: '安全', t: '宝宝发烧39度要吃多少美林', action: 'create', advice: true, safety: 'fever', e: [{ type: 'temp', v: 39 }], noType: ['med'] },
  { g: '安全', t: '该给宝宝喂多少水', action: 'none', advice: true },
  { g: '无关', t: '今天天气真好', action: 'none' },
  { g: '无关', t: '你好团团', action: 'none' },
  { g: '无关', t: '帮我买一罐奶粉', action: 'none' },
  { g: '无关', t: '明天要上班好累啊', action: 'none' },
];

/* 留出集：规则兜底调好之后才写的新说法，不再针对它们改规则，用来看规则的真实泛化 */
export const HOLDOUT = [
  { g: '喂奶', t: '三点钟吃了一百四十毫升', action: 'create', e: [{ type: 'feed', ml: 140, clock: '15:00' }] },
  { g: '喂奶', t: '刚吃完奶，喝了大概一百毫升', action: 'create', e: [{ type: 'feed', ml: 100, near: 5 }] },
  { g: '喂奶', t: '左边亲喂了十分钟', action: 'create', e: [{ type: 'feed', sub: 'breast', mins: 10 }] },
  { g: '睡眠', t: '五点十分哄睡了', action: 'create', e: [{ type: 'sleep', clock: '17:10' }] },
  { g: '睡眠', t: '豆米睡醒了', action: 'update', update: { kind: 'wake' } },
  { g: '尿布', t: '换了个尿不湿，有便便', action: 'create', e: [{ type: 'diaper', sub: 'poop' }] },
  { g: '尿布', t: '刚刚嘘嘘了', action: 'create', e: [{ type: 'diaper', sub: 'pee' }] },
  { g: '喂药', t: '中午吃了益生菌', action: 'create', e: [{ type: 'med', name: '益生菌', clock: '12:00' }] },
  { g: '体温', t: '额温三十八度二', action: 'create', safety: 'fever', e: [{ type: 'temp', v: 38.2, site: '额温' }] },
  { g: '体温', t: '体温正常，36度9', action: 'create', safety: null, e: [{ type: 'temp', v: 36.9 }] },
  { g: '多事件', t: '七点喝了160毫升奶，换了尿布，尿了', action: 'create', e: [{ type: 'feed', ml: 160, clock: '07:00' }, { type: 'diaper', sub: 'pee' }], anyOrder: true },
  { g: '症状', t: '宝宝吐奶了', action: 'create', safety: 'symptom', e: [{ type: 'symptom' }], atLeast: true },
  { g: '安全', t: '退烧药一次吃几毫升', action: 'none', advice: true },
  { g: '无关', t: '团团你真可爱', action: 'none' },
  { g: '无关', t: '提醒我给奶瓶消毒', action: 'none' },
];

const hm = iso => { const d = new Date(Date.parse(iso) + 8 * 3600000); return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`; };
const dayIdx = iso => Math.round((Date.parse('2026-11-01T00:00:00+08:00') - (Math.floor((Date.parse(iso) + 8 * 3600000) / 86400000) * 86400000 - 8 * 3600000)) / 86400000);
function evOk(x, w) {
  if (!x || x.type !== w.type) return `type ${x?.type}≠${w.type}`;
  const v = x.values;
  for (const k of ['sub', 'ml', 'mins', 'v', 'site', 'cm', 'kg']) if (k in w && (v[k] ?? null) !== w[k]) return `${k} ${v[k]}≠${w[k]}`;
  if (w.name && !(v.name || '').replace(/\s/g, '').toLowerCase().includes(w.name.toLowerCase())) return `name ${v.name}`;
  if (w.clock && hm(x.time) !== w.clock) return `time ${hm(x.time)}≠${w.clock}`;
  if ('dayAgo' in w && dayIdx(x.time) !== w.dayAgo) return `day ${dayIdx(x.time)}`;
  if (w.near !== undefined && Math.abs(Date.parse(x.time) - NOW) > w.near * 60000) return `time ${hm(x.time)} not now`;
  if ('endTime' in w && (x.endTime ?? null) !== w.endTime) return `end ${x.endTime}`;
  if (w.endClock && (!x.endTime || hm(x.endTime) !== w.endClock)) return `end ${x.endTime && hm(x.endTime)}≠${w.endClock}`;
  return null;
}
/** 返回 null = 通过，否则是原因 */
export function judge(c, p) {
  if (p.action !== c.action) return `action ${p.action}≠${c.action}`;
  if ('advice' in c && p.advice !== c.advice) return `advice ${p.advice}`;
  if ('safety' in c && p.safety !== c.safety) return `safety ${p.safety}≠${c.safety}`;
  if (c.clarify && !p.clarify) return 'no clarify';
  if (c.update) { if (!p.update || p.update.kind !== c.update.kind) return `update ${p.update?.kind}`; if (c.update.toMl && p.update.toMl !== c.update.toMl) return `toMl ${p.update.toMl}`; return null; }
  if (c.noType && p.events.some(e => c.noType.includes(e.type))) return `unexpected ${c.noType}`;
  const ev = c.e || [];
  if (c.atLeast) { if (!ev.every(w => p.events.some(x => !evOk(x, w)))) return 'missing'; return null; }
  if (p.events.length !== ev.length) return `n ${p.events.length}≠${ev.length} [${p.events.map(e => e.type).join(',')}]`;
  if (c.anyOrder) { for (const w of ev) if (!p.events.some(x => !evOk(x, w))) return `missing ${w.type}`; return null; }
  for (let i = 0; i < ev.length; i++) { const r = evOk(p.events[i], ev[i]); if (r) return `#${i} ${r}`; }
  return null;
}
