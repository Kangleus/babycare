/* 问团子的安全核心：全部是纯函数，不联网、不依赖 Deno / React。
   三个组件：
   1) ruleTier(question, ctx)   规则分档：life < health < urgent，紧急永远由规则先判
   2) extractTemps(text)        从问题里抽体温（阿拉伯数字 / 中文数字）
   3) postCheck(answer, tools)  回答发出前逐句检查：剂量 / 喂水量 / 药名 / 诊断 / 安慰性保证 / 体温标注 / 数字
   设计依据：docs/M5-ASK-AGENT.md §3、§6、§10.4。改动这里等于改动安全边界，先看文档。 */

export type Tier = 'life' | 'health' | 'urgent' | 'off_topic';
export type RuleTier = 'life' | 'health' | 'urgent';
export type TierCtx = { ageDays: number; latestTemp?: { v: number; at: number }; nowMs: number };
export type TierResult = { tier: RuleTier; reasons: string[] };
export type Violation = { code: 'dose' | 'water' | 'drug' | 'diag' | 'reassure' | 'numbers'; text: string };
export type PostOut = { ok: boolean; violations: Violation[]; patched: string };

/* ---------- 1. 体温抽取 ---------- */

const CN_D = ['一', '二', '三', '四', '五', '六', '七', '八', '九'];
const cnVal = (n: string) => CN_D.indexOf(n) + 1;

export function extractTemps(text: string): number[] {
  const out: number[] = [];
  const push = (v: number) => {
    const r = Math.round(v * 10) / 10;
    if (r >= 34 && r <= 43) out.push(r);
  };
  // 阿拉伯数字 + 单位
  for (const m of text.matchAll(/(3[4-9]|4[0-3])(\.\d)?\s*(℃|°C|°|度)/g)) push(+(m[1] + (m[2] || '')));
  // 有上下文词、没单位（「体温计显示 39.2」）
  for (const m of text.matchAll(/(体温|烧到|烧了|发烧|发热|测了|量了|显示|腋温|耳温|额温)[^0-9]{0,6}(3[4-9]|4[0-3])(\.\d)?/g)) push(+(m[2] + (m[3] || '')));
  // 中文数字
  for (const m of text.matchAll(/(三十[四五六七八九]|四十[一二三]?)度(半|[一二三四五六七八九])?/g)) {
    const tail = m[1].slice(m[1].length - 1); // 「三十八」的最后一位；「四十」没有尾数
    const base = m[1].startsWith('四十') ? (m[1].length > 2 ? 40 + cnVal(tail) : 40) : 30 + cnVal(tail);
    const frac = m[2] === '半' ? 0.5 : m[2] ? cnVal(m[2]) / 10 : 0;
    push(base + frac);
  }
  return out;
}

/* ---------- 2. 规则分档 ---------- */

const R_INFANT = /发烧|发热|烧了|高烧|低烧|体温高|身上(很|好|有点)?烫|摸着(很|好|有点)?烫/;
const R_CONVULSION = /抽搐|抽筋|抽风|惊厥|翻白眼|眼睛(往)?上翻|四肢(发)?(僵|硬|抖)|手脚(一直|不停)?(抖|抽)|牙关紧/;
const R_BREATHING = /呼吸(困难|急促|很快|好快|特别快|费力|不畅|有杂音)|喘不(上|过)气|憋气|憋得|鼻翼(扇|煽)|三凹|嘴唇(发)?(紫|青|乌)|脸色?(发)?(青|紫|灰)/;
const R_LETHARGY = /叫不醒|睡不醒|没(有)?反应|反应(很|特别)?(差|迟钝)|精神(很|特别|非常)?(差|不好)|蔫|软绵绵|昏睡|昏迷/;
const R_NO_FEED_PEE = /一口(奶|都|也)?(都|也)?不(吃|喝)|拒奶|不吃不喝|(半天|一天|一整天|\d+\s*个?小时|好几个?小时)(都)?(没|不)(吃|喝|尿)|没(有)?尿(了)?.{0,4}(半天|一天|\d+\s*个?小时)|不尿/;
const R_OTHER_RED = /喷射(状|性)?(呕)?吐|吐.{0,4}(绿|血)|便血|血便|黑便|大便.{0,3}(带血|有血)|囟门(鼓|凸|隆起|鼓起)|脱水|眼窝凹陷|误吞|误食|吞了(个|颗|一)|烫伤|摔(到|了|着)?(头|脑袋)|从.{0,6}(床|沙发|桌).{0,4}(摔|掉)|(嘴唇|眼睛|眼皮|脸).{0,3}肿|按压不褪|不褪色|窒息|呛(奶|到).{0,8}(紫|青|喘不)/;
export const R_HEALTH = /药|剂量|毫克|mg|吃多少|喝几|用多少|几包|几袋|冲剂|七星茶|益生菌|发烧|发热|烧|体温|度[一二三四五六七八九]?|咳|嗽|痰|鼻涕|鼻塞|喷嚏|吐|呕|腹泻|拉肚子|拉稀|便秘|大便.{0,4}(绿|稀|硬|干|血|黏|白|黑|水)|便便.{0,4}(绿|稀|硬|干|血|黏|白|黑|水)|湿疹|疹|红屁股|尿布疹|过敏|黄疸|长牙.{0,4}(烧|痛|疼|流)|病|医生|医院|看急诊|疫苗.{0,4}(反应|发烧|红肿)|缺钙|缺铁|缺锌|贫血|炎|感冒|流感|中耳|眼屎|红肿|出血|伤口|摔|撞|哭闹不止|肠绞痛|胀气|打嗝不停|吐奶/;

const H12 = 12 * 3600000;

/** 规则分档。紧急永远优先；否定句也按紧急处理（宁可多提示）。 */
export function ruleTier(question: string, ctx: TierCtx): TierResult {
  const q = question || '';
  const temps = extractTemps(q);
  const reasons: string[] = [];
  if (temps.some(v => v >= 38)) reasons.push('fever38');
  if (ctx.ageDays < 90 && (R_INFANT.test(q) || temps.some(v => v >= 37.5))) reasons.push('infant_fever');
  if (ctx.latestTemp && ctx.nowMs - ctx.latestTemp.at <= H12 && ctx.latestTemp.v >= 38 && R_HEALTH.test(q)) reasons.push('recorded_fever');
  if (R_CONVULSION.test(q)) reasons.push('convulsion');
  if (R_BREATHING.test(q)) reasons.push('breathing');
  if (R_LETHARGY.test(q)) reasons.push('lethargy');
  if (R_NO_FEED_PEE.test(q)) reasons.push('no_feed_pee');
  if (R_OTHER_RED.test(q)) reasons.push('other_red');
  if (reasons.length) return { tier: 'urgent', reasons };
  return { tier: R_HEALTH.test(q) ? 'health' : 'life', reasons: [] };
}

/** 两个档位取更严的（life < health < urgent）；off_topic 只由分类给出，不在这里比较 */
export function stricter(a: RuleTier, b: RuleTier): RuleTier {
  const rank = { life: 0, health: 1, urgent: 2 } as const;
  return rank[a] >= rank[b] ? a : b;
}

/* ---------- 3. 回答后检查 ---------- */

const DRUGS = /布洛芬|美林|对乙酰氨基酚|泰诺林|扑热息痛|阿莫西林|头孢|阿奇霉素|罗红霉素|抗生素|消炎药|蒙脱石|思密达|妈咪爱|益生菌|小儿七星茶|七星茶|健胃消食|小儿氨酚黄那敏|氨溴索|易坦静|沐舒坦|开塞露|乳果糖|西替利嗪|氯雷他定|地塞米松|激素|鱼肝油|AD滴剂|伊可新|维生素D|钙剂|葡萄糖酸锌|补液盐|口服补液盐|退热贴|小儿感冒颗粒|蒲地蓝|板蓝根|双黄连/;
const DISEASES = /肺炎|支气管炎|毛细支气管炎|手足口|疱疹性咽峡炎|幼儿急疹|中耳炎|肠胃炎|胃肠炎|轮状病毒|诺如|湿疹|尿布疹|过敏|乳糖不耐受|牛奶蛋白过敏|感冒|流感|上呼吸道感染|川崎|脑膜炎|脑炎|贫血|缺钙|缺铁|佝偻病|黄疸|疝气|肠套叠|肠绞痛|鹅口疮|结膜炎|哮喘|败血症|尿路感染|扁桃体炎|咽炎|喉炎|猩红热|水痘/;

const R_DOSE_CTX = /药|服|剂量|用量|退烧|止咳|冲剂|口服液|滴剂|颗粒|混悬|糖浆|益生菌|七星茶|补钙|钙剂|维生素|鱼肝油|铁剂|锌/;
const R_DOSE_NUM = /\d+(\.\d+)?\s*(mg|毫克|ml|毫升|cc|滴|片|粒|包|袋|支|勺|次|个?小时)/i;
const R_DOSE_ABS = /\d+(\.\d+)?\s*(mg|毫克)|mg\/kg|毫克\/公斤|毫升\/公斤|ml\/kg/i;
const R_DIAG = /(诊断为|确诊|就是|应该是|肯定是|一定是|大概是|可能是|多半是|估计是|得了|患了|患有|属于)[^，。]{0,4}(肺炎|支气管炎|毛细支气管炎|手足口|疱疹性咽峡炎|幼儿急疹|中耳炎|肠胃炎|胃肠炎|轮状病毒|诺如|湿疹|尿布疹|过敏|乳糖不耐受|牛奶蛋白过敏|感冒|流感|上呼吸道感染|川崎|脑膜炎|脑炎|贫血|缺钙|缺铁|佝偻病|黄疸|疝气|肠套叠|肠绞痛|鹅口疮|结膜炎|哮喘|败血症|尿路感染|扁桃体炎|咽炎|喉炎|猩红热|水痘)/;
const R_REASSURE = /不用(去)?(看)?医院|不用就医|不用看医生|肯定没事|放心(吧)?[，。]?没(事|问题)/;
const R_RECENT = /记录|最近|这周|上周|昨晚|昨天|今天|日均|平均|近\s*\d+\s*天/;
// 体温有专门的 temp_flag 规则（补字而不是判违规），这里排除 ℃，避免重复计算
const R_NUM_UNIT = /(\d+(?:\.\d+)?)\s*(ml|毫升|次|小时|分钟|h|m|kg|cm)/gi;

/** 工具结果里出现过的所有数字（含 3h50m → 230 分钟），用于判断"数字有没有来源" */
function toolNumbers(toolText: string): Set<string> {
  const s = new Set<string>();
  const add = (v: number) => { s.add(String(Math.round(v))); s.add(v.toFixed(1)); };
  for (const m of toolText.matchAll(/-?\d+(?:\.\d+)?/g)) add(+m[0]);
  for (const m of toolText.matchAll(/(\d+)\s*h\s*(\d+)?\s*m/gi)) add(+m[1] * 60 + (+m[2] || 0));
  for (const m of toolText.matchAll(/(\d+)\s*小时\s*(\d+)?\s*(分钟)?/g)) add(+m[1] * 60 + (+m[2] || 0));
  return s;
}

/** 工具结果里记录过的药名（用药「X」N 次 与记录里出现过的药名） */
function toolMeds(toolText: string): Set<string> {
  const s = new Set<string>();
  for (const m of toolText.matchAll(/用药「([^」]{1,20})」/g)) s.add(m[1].replace(/\s+/g, ''));
  for (const m of toolText.matchAll(new RegExp(DRUGS.source, 'g'))) s.add(m[0].replace(/\s+/g, ''));
  return s;
}

function hasNumber(set: Set<string>, raw: string): boolean {
  const v = +raw;
  return set.has(String(Math.round(v))) || set.has(v.toFixed(1)) || set.has(raw);
}

const splitSentences = (t: string) => t.split(/(?<=[。！？!?\n])/).filter(x => x.trim());
const norm = (s: string) => s.replace(/\s+/g, '');

/**
 * 逐句检查。temp_flag 只补字不算违规；其余命中即违规，调用方据此改写或兜底。
 * @param answer concl + body
 * @param toolResults 本次所有工具结果（用来判断数字 / 药名是不是来自记录）
 */
export function postCheck(answer: { concl: string; body: string }, toolResults: unknown[] = []): PostOut {
  const toolText = JSON.stringify(toolResults ?? []);
  const toolFlat = norm(toolText);
  const nums = toolNumbers(toolText);
  const meds = toolMeds(toolText);
  const quotedMed = new Set<string>();
  for (const m of toolText.matchAll(/用药「([^」]{1,20})」\s*(\d+)\s*次/g)) quotedMed.add(`${norm(m[1])}|${m[2]}`);
  const violations: Violation[] = [];

  const fix = (sentence: string): string => {
    let s = sentence;
    for (const v of extractTemps(sentence)) {
      if (v >= 38 && !/就医/.test(s)) s = s.replace(/[。！？!?]?$/, '，建议及时就医。');
      else if (v >= 37.5 && v < 38 && !/偏高/.test(s)) s = s.replace(/[。！？!?]?$/, '（偏高）。');
    }
    return s;
  };

  const check = (raw: string): string => {
    const sent = fix(raw);
    const text = sent.trim();
    if (!text) return sent;
    const flat = norm(text);
    const drugHits = [...new Set([...text.matchAll(new RegExp(DRUGS.source, 'g'))].map(m => m[0]))];

    // 1) 剂量：药类词（或药名）+ 数字单位；例外 = 整句复述了工具里的「用药「X」N 次」
    const repeatsMed = [...text.matchAll(/用药「([^」]{1,20})」\s*(\d+)\s*次/g)].some(m => quotedMed.has(`${norm(m[1])}|${m[2]}`));
    const doseCtx = R_DOSE_CTX.test(text) || drugHits.length > 0;
    if (!repeatsMed && ((doseCtx && R_DOSE_NUM.test(text)) || R_DOSE_ABS.test(text))) violations.push({ code: 'dose', text });

    // 2) 喂水量：出现「水」但不是在说奶 / 冲奶 / 水温，且带容量数字
    if (!/奶|冲奶|水温/.test(text) && /水/.test(text) && /\d+\s*(ml|毫升|cc|杯|瓶|口)/.test(text)) {
      const ns = [...text.matchAll(/(\d+(?:\.\d+)?)\s*(ml|毫升|cc|杯|瓶|口)/g)].map(m => m[1]);
      if (!ns.every(n => hasNumber(nums, n))) violations.push({ code: 'water', text });
    }

    // 3) 药名：例外 = 工具里记过，且回答里用「」括起来
    for (const name of drugHits) {
      const quoted = new RegExp(`「${norm(name)}」`).test(flat);
      if (!(quoted && meds.has(norm(name)))) violations.push({ code: 'drug', text });
    }

    // 4) 诊断 / 5) 安慰性保证
    if (R_DIAG.test(text)) violations.push({ code: 'diag', text });
    if (R_REASSURE.test(text)) violations.push({ code: 'reassure', text });

    // 6) 数字必须能在工具结果里找到
    if (R_RECENT.test(text)) {
      for (const m of text.matchAll(R_NUM_UNIT)) {
        if (!hasNumber(nums, m[1])) { violations.push({ code: 'numbers', text }); break; }
      }
    }
    return sent;
  };

  const concl = check(answer.concl);
  const body = splitSentences(answer.body || '').map(check).join('');
  const patched = [concl, body].filter(Boolean).join('').replace(/。{2,}/g, '。');
  return { ok: violations.length === 0, violations, patched };
}

/* ---------- 4. 文案：页脚 / 兜底 / 依据标签 ---------- */

export const FOOTER = {
  life: '每个宝宝不同，仅供参考',
  health: '团团不做诊断，也不提供用药剂量。出现精神差、呼吸急促、抽搐、持续高烧不退或不吃不尿，请及时就医。',
} as const;

export function footerOf(tier: Tier): string | undefined {
  return tier === 'life' ? FOOTER.life : tier === 'health' ? FOOTER.health : undefined;
}

export function fallbackOf(tier: 'life' | 'health', name: string): { concl: string; body: string; action?: { type: 'open_summary'; aud: 'doctor'; range: 3 } } {
  if (tier === 'health') {
    return {
      concl: '这个要请医生来判断',
      body: `团团不做诊断，也不提供药名和剂量。你可以先留意${name}的体温、吃奶、尿布和精神状态，看医生时把记录给医生看。如果出现精神差、呼吸急促、抽搐、持续高烧不退或不吃不尿，请立即就医或拨打 120。`,
      action: { type: 'open_summary', aud: 'doctor', range: 3 },
    };
  }
  return { concl: '这个团团没整理好', body: '换个说法再问我一次吧～ 记录里的数字可以在首页卡片里点开看趋势。' };
}

export const TYPE_CN: Record<string, string> = {
  all: '记录', feed: '喂奶', sleep: '睡眠', diaper: '尿布', poop: '便便', water: '喝水',
  med: '用药', temp: '体温', symptom: '症状', growth: '成长', bath: '洗澡',
};

/** 依据标签（中文，不显示函数名）。life 档且带通用常识时由调用方追加「通用育儿常识」。 */
export function buildCites(toolResults: { fn: string; result: Record<string, unknown> }[], tier: Tier): string[] {
  const out: string[] = [];
  for (const t of toolResults) {
    const r = t.result ?? {};
    if (t.fn === 'query_events') out.push(`查记录 · ${r.range_label ?? ''} · ${r.count ?? 0} 条${TYPE_CN[String(r.type)] ?? ''}`.trim());
    else if (t.fn === 'get_stats') out.push(`算统计 · ${r.name ?? ''} · 近 ${r.days ?? ''} 天`.replace(' · 近 天', ''));
    else if (t.fn === 'get_health_profile') out.push('健康档案');
  }
  if (tier === 'urgent') return ['风险提示 · 固定安全话术'];
  return [...new Set(out)];
}

/* ---------- 5. 紧急卡（本机渲染的数据） ---------- */

export type RecordLike = { type: string; time: string; endTime?: string | null; values?: Record<string, unknown>; createdBy?: string };
const pad = (n: number) => String(n).padStart(2, '0');
const hhmm = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

export type UrgentCard = {
  title: string; items: string[]; line: string;
  recent: { k: string; v: string }[]; cite: string;
};

export function urgentCard(reasons: string[], records: RecordLike[], now: Date, babyName: string): UrgentCard {
  const items = [
    '如果精神差、呼吸急促、抽搐、持续高烧不退，或不吃不尿，请**立即就医或拨打 120**',
    '团团不做诊断，也不提供用药剂量',
  ];
  if (reasons.includes('infant_fever')) items.unshift('**3 个月以下的宝宝发烧，请直接去医院**');

  const today = records.filter(r => sameDay(new Date(r.time), now) && new Date(r.time) <= now);
  const lastTemp = records.filter(r => r.type === 'temp' && r.values?.v && +new Date(r.time) <= +now)
    .sort((a, b) => +new Date(b.time) - +new Date(a.time))[0];
  const lastMed = today.filter(r => r.type === 'med')[0];
  const line = lastTemp
    ? `今天 ${hhmm(new Date(lastTemp.time))} 记了体温 **${Number(lastTemp.values!.v).toFixed(1)}℃**${lastMed ? `，还记了一次「${String(lastMed.values?.name ?? '药')}」（只记你说的）。` : '。'}`
    : `${babyName}近 3 天的记录里还没有体温记录。`;

  const feeds = today.filter(r => r.type === 'feed');
  const ml = feeds.reduce((a, r) => a + (Number(r.values?.ml) || 0), 0);
  const dia = today.filter(r => r.type === 'diaper').length;
  const lastFeed = records.filter(r => r.type === 'feed' && +new Date(r.time) <= +now).sort((a, b) => +new Date(b.time) - +new Date(a.time))[0];
  return {
    title: '请尽快就医',
    items,
    line,
    recent: [
      { k: '今天喂奶', v: `${feeds.length} 次 · ${ml} ml` },
      { k: '今天尿布', v: `${dia} 次` },
      { k: '最近一次喂奶', v: lastFeed ? hhmm(new Date(lastFeed.time)) : '—' },
    ],
    cite: '风险提示 · 固定安全话术',
  };
}
