/* 问团子：对话 / 小图表 / 紧急卡 / 记录列表 / 依据标签 / 建议问题 / 输入框。
   样式照原型 docs/prototype/index.html 的 .ai-h .chat .msg .bb .concl .minichart .cite
   .fb .risk .recent .mini-btn .typing .askbar .chips .inp（373–414、1168–1203）。
   对话只存在内存里：切 Tab 保留（模块级 STORE），App 重启即清空。 */
import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, ScrollViewInstance, StyleSheet, Text, TextInput, View } from 'react-native';
import { Icon, Tuan } from '@/lib/svg';
import { useApp } from '@/state/app-state';
import { askLocalUrgent, askReady, askRemote, localUrgentCard, type AskAnswer, type AskMsg } from '@/lib/ask-api';
import { DAY, parseYmd } from '@/lib/time';
import { hard } from '@/theme/tokens';
import { useTopPad } from './chrome';
import { Txt } from './txt';

const nextId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

const SUB = '#8C7A66', RED = '#C9452F', RISK_BG = '#FFE6E0', RISK_LINE = '#E26D5A';
const DAYS = ['一', '二', '三', '四', '五', '六', '日'];

export function AskPage({ onSummary }: { onSummary: (aud?: 'doctor' | 'granny') => void }) {
  const app = useApp();
  const { p, baby, records, now, showToast } = app;
  const top = useTopPad();
  const msgs = app.askMsgs;
  const setMsgs = app.setAskMsgs;
  const push = (m: AskMsg) => setMsgs([...msgs, m]);
  const replaceTyping = (m: AskMsg) => setMsgs([...msgs.filter(x => !(x.who === 'bot' && x.kind === 'typing')), m]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const sref = useRef<ScrollViewInstance | null>(null);

  useEffect(() => { const t = setTimeout(() => sref.current?.scrollToEnd({ animated: true }), 60); return () => clearTimeout(t); }, [msgs]);

  if (!baby) return null;
  const ageDays = parseYmd(baby.birthday) ? Math.max(0, Math.floor((+now - +parseYmd(baby.birthday)!) / DAY)) : 0;
  const latestTemp = records.filter(r => r.type === 'temp' && r.values.v != null && +now - +new Date(r.time) < DAY)
    .sort((a, b) => +new Date(b.time) - +new Date(a.time))[0];

  const history = () => {
    const out: { q: string; a: string }[] = [];
    for (let i = 0; i < msgs.length; i++) {
      const m = msgs[i];
      if (m.who === 'me') {
        const nxt = msgs.slice(i + 1).find(x => x.who === 'bot');
        if (nxt && nxt.who === 'bot' && nxt.kind === 'answer') out.push({ q: m.text, a: `${nxt.a.concl}。${nxt.a.body}` });
      }
    }
    return out.slice(-3);
  };

  const send = async (raw: string) => {
    const q = raw.trim();
    if (!q || sending) return;
    setText('');
    push({ id: nextId(), who: 'me', text: q });
    /* 本机紧急判断：不联网、不计次 */
    const local = askLocalUrgent(q, records, now, baby.name, ageDays,
      latestTemp ? { v: Number(latestTemp.values.v), at: +new Date(latestTemp.time) } : undefined);
    if (local) { push({ id: nextId(), who: 'bot', kind: 'urgent', card: local.card }); return; }
    if (!askReady(baby.id)) { push({ id: nextId(), who: 'bot', kind: 'login' }); return; }
    push({ id: nextId(), who: 'bot', kind: 'typing' });
    setSending(true);
    const r = await askRemote(q, baby.id, history());
    setSending(false);
    if (r.ok) {
      if (r.tier === 'urgent') {
        replaceTyping({ id: nextId(), who: 'bot', kind: 'urgent', card: localUrgentCard(r.urgent?.reasons ?? ['llm_urgent'], records, now, baby.name) });
      } else if (r.answer) {
        replaceTyping({ id: nextId(), who: 'bot', kind: 'answer', a: r.answer, fb: true });
      } else {
        replaceTyping({ id: nextId(), who: 'bot', kind: 'error', message: '团团没答上来，再问一次试试' });
      }
      return;
    }
    if (r.code === 'signed_out') { replaceTyping({ id: nextId(), who: 'bot', kind: 'login' }); return; }
    if (r.code === 'quota') {
      replaceTyping({
        id: nextId(), who: 'bot', kind: 'answer',
        a: { concl: '今天问得有点多啦，明天再聊', body: '今天家里已经问了 20 次。紧急情况不受限制，团团照样会提醒你就医。', cites: [], mood: 'idle' },
      });
      return;
    }
    replaceTyping({ id: nextId(), who: 'bot', kind: 'error', message: r.message, retry: q });
  };

  const QS = [
    { q: `他最近是不是睡少了？`, warn: false },
    { q: '这周奶量正常吗？', warn: false },
    { q: '昨晚夜醒了几次？', warn: false },
    { q: '宝宝发烧 38.5℃ 怎么办？', warn: true },
  ].map(x => ({ ...x, q: x.q.replace(/^他/, baby.gender === 'girl' ? '她' : '他') }));

  return (
    <View style={{ flex: 1 }} testID="ask-page">
      <ScrollView ref={sref} style={{ flex: 1 }} contentContainerStyle={{ paddingTop: top, paddingHorizontal: 18, paddingBottom: 240 }} showsVerticalScrollIndicator={false}>
        {/* .ai-h：头像 + 标题 + 副标 + 一键摘要 */}
        <View style={s.aih}>
          <View style={[s.av, { backgroundColor: p.blueS, borderColor: p.ink }, hard(p, 3)]}><Tuan mood="idle" acc={['book']} size={52} /></View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Txt f="h" size={24}>问团子</Txt>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 }}>
              <View style={s.dot} />
              <Txt f="b8" size={11.5} color={p.sub}>只看{baby.name}的记录回答</Txt>
            </View>
          </View>
          <Pressable testID="summary-open" onPress={() => onSummary()}
            style={({ pressed }) => [s.pill, { backgroundColor: p.pink, borderColor: p.ink, shadowColor: p.shadow }, pressed ? { transform: [{ translateY: 3 }] } : hard(p, 3)]}>
            <Icon name="doc" size={16} color={p.ink} /><Txt f="b9" size={12.5}>一键摘要</Txt>
          </Pressable>
        </View>

        <View style={s.chat}>
          {msgs.length === 0 ? (
            <BotBubble mood="idle">
              <Text style={[s.concl, { color: p.ink }]}>我是团团！</Text>
              <Text style={[s.body, { color: p.ink }]}>
                我会先翻翻<Text style={{ fontWeight: '900' }}>{baby.name}自己的记录</Text>再回答你。数字都是代码算出来的，记录里没有的我会直说，不会瞎编哦。
              </Text>
            </BotBubble>
          ) : null}
          {msgs.map(m => <Bubble key={m.id} m={m} onRetry={q => send(q)} onAskAction={aud => onSummary(aud)} onToast={showToast} />)}
        </View>
      </ScrollView>

      {/* .askbar：建议问题 + 输入框 */}
      <View style={[s.askbar, { backgroundColor: p.bg }]}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chips}>
          {QS.map((c, i) => (
            <Pressable key={i} testID={`ask-chip-${i}`} disabled={sending} onPress={() => send(c.q)}
              style={({ pressed }) => [s.chip, { backgroundColor: c.warn ? RISK_BG : p.card, borderColor: p.ink },
                pressed ? { transform: [{ translateY: 3 }] } : hard(p, 3), sending && { opacity: 0.5 }]}>
              <Txt f="b9" size={12.5}>{c.q}</Txt>
            </Pressable>
          ))}
        </ScrollView>
        <View style={[s.inp, { backgroundColor: p.card, borderColor: p.ink }]}>
          <TextInput testID="ask-input" value={text} onChangeText={setText} editable={!sending}
            placeholder={`问问${baby.name}的吃睡情况…`} placeholderTextColor={p.sub}
            style={[s.input, { color: p.ink }]} maxLength={200}
            onSubmitEditing={() => send(text)} returnKeyType="send" />
          <Pressable testID="ask-send" disabled={sending || !text.trim()} onPress={() => send(text)}
            style={[s.send, { backgroundColor: p.yellow, borderColor: p.ink }, (sending || !text.trim()) && { opacity: 0.45 }]}>
            <Icon name="send" size={18} color={p.ink} />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

/* ---------- 气泡 ---------- */

function BotBubble({ mood, children, testID }: { mood: 'idle' | 'happy' | 'worry'; children: React.ReactNode; testID?: string }) {
  const { p } = useApp();
  return (
    <View style={s.msgBot} testID={testID}>
      <View style={[s.botAv, { backgroundColor: p.blueS, borderColor: p.ink }]}><Tuan mood={mood} acc={['book']} size={34} /></View>
      <View style={[s.bb, { backgroundColor: p.card, borderColor: p.ink, shadowColor: p.shadow }]}>{children}</View>
    </View>
  );
}

function Bubble({ m, onRetry, onAskAction, onToast }: { m: AskMsg; onRetry: (q: string) => void; onAskAction: (aud?: 'doctor' | 'granny') => void; onToast: (t: string) => void }) {
  const { p, night, baby } = useApp();
  if (m.who === 'me') {
    return (
      <View testID="ask-msg-me" style={[s.me, { backgroundColor: p.yellow, borderColor: p.ink, shadowColor: p.shadow }]}>
        <Text style={[s.meText, { color: p.ink }]}>{m.text}</Text>
      </View>
    );
  }
  if (m.kind === 'typing') {
    return (
      <BotBubble mood="idle" testID="ask-typing">
        <View style={{ flexDirection: 'row', gap: 4, paddingVertical: 6 }}>
          {[0, 1, 2].map(i => <View key={i} style={[s.typingDot, { backgroundColor: p.sub }]} />)}
        </View>
      </BotBubble>
    );
  }
  if (m.kind === 'urgent') {
    const card = m.card;
    return (
      <BotBubble mood="worry" testID="ask-risk">
        <View style={[s.risk, { backgroundColor: night ? '#4a2a24' : RISK_BG, borderColor: RISK_LINE }]}>
          <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
            <Icon name="warn" size={18} color={night ? '#ff9d8a' : RED} />
            <Text style={[s.riskT, { color: night ? '#ff9d8a' : RED }]}>{card.title}</Text>
          </View>
          {card.items.map((it, i) => <Text key={i} style={[s.riskLi, { color: p.ink }]}>• {plain(it)}</Text>)}
        </View>
        <Text style={[s.body, { color: p.ink }]}>{plain(card.line)}</Text>
        <Text style={[s.body, { color: p.ink, marginTop: 6 }]}>我整理了最近的吃睡情况，就诊时可以直接给医生看：</Text>
        <View style={[s.recent, { backgroundColor: p.bg2 }]}>
          {card.recent.map((r, i) => (
            <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2 }}>
              <Text style={[s.recentT, { color: p.ink }]}>{r.k}</Text>
              <Text style={[s.recentT, { color: p.ink }]}>{r.v}</Text>
            </View>
          ))}
        </View>
        <Pressable testID="ask-risk-summary" onPress={() => onAskAction('doctor')}
          style={({ pressed }) => [s.miniBtn, { backgroundColor: p.pink, borderColor: p.ink, shadowColor: p.shadow }, pressed && { transform: [{ translateY: 2 }] }]}>
          <Icon name="doc" size={15} color={p.ink} /><Txt f="b9" size={12}>生成给医生的摘要</Txt>
        </Pressable>
        <Cites list={[card.cite]} />
      </BotBubble>
    );
  }
  if (m.kind === 'login') {
    return (
      <BotBubble mood="idle">
        <Text style={[s.concl, { color: p.ink }]}>登录后团团才能翻记录</Text>
        <Text style={[s.body, { color: p.ink }]}>
          问团子要读{baby?.name ?? '宝宝'}在云端的记录，登录并加入家庭后就能用。紧急情况不用登录，团团也会提醒你就医。
        </Text>
      </BotBubble>
    );
  }
  if (m.kind === 'error') {
    return (
      <BotBubble mood="worry">
        <Text style={[s.concl, { color: p.ink }]}>团团暂时没连上</Text>
        <Text style={[s.body, { color: p.ink }]}>{m.message}</Text>
        {m.retry ? (
          <Pressable testID="ask-retry" onPress={() => onRetry(m.retry!)}
            style={({ pressed }) => [s.miniBtn, { backgroundColor: p.yellow, borderColor: p.ink, shadowColor: p.shadow }, pressed && { transform: [{ translateY: 2 }] }]}>
            <Icon name="send" size={15} color={p.ink} /><Txt f="b9" size={12}>再问一次</Txt>
          </Pressable>
        ) : null}
      </BotBubble>
    );
  }

  /* 正常回答 */
  const a = m.a;
  return (
    <BotBubble mood={a.mood ?? 'idle'} testID="ask-msg-bot">
      <Text testID="ask-concl" style={[s.concl, { color: p.ink }]}>{a.concl}</Text>
      <Bold text={a.body} style={[s.body, { color: p.ink }]} />
      {a.chart && a.chart.points.length ? <MiniChart chart={a.chart} /> : null}
      {a.events?.length ? (
        <View testID="ask-recent" style={[s.recent, { backgroundColor: p.bg2 }]}>
          {a.events.map((e, i) => (
            <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2, gap: 8 }}>
              <Text style={[s.recentT, { color: p.ink, flex: 1 }]}>{e.left}</Text>
              <Text style={[s.recentT, { color: SUB }]}>{e.right}</Text>
            </View>
          ))}
        </View>
      ) : null}
      {a.footer ? <Text testID="ask-footer" style={[s.footer, { color: p.sub }]}>{a.footer}</Text> : null}
      {a.action ? (
        <Pressable testID="ask-action" onPress={() => { onAskAction(a.action!.aud); onToast('已打开一键摘要'); }}
          style={({ pressed }) => [s.miniBtn, { backgroundColor: p.pink, borderColor: p.ink, shadowColor: p.shadow }, pressed && { transform: [{ translateY: 2 }] }]}>
          <Icon name="doc" size={15} color={p.ink} /><Txt f="b9" size={12}>生成{a.action.aud === 'granny' ? '给奶奶' : '给医生'}的摘要</Txt>
        </Pressable>
      ) : null}
      {a.cites.length ? <Cites list={a.cites} /> : null}
      {m.fb ? (
        <View style={{ flexDirection: 'row', gap: 6, marginTop: 8 }}>
          <Pressable testID="ask-fb-up" onPress={() => onToast('谢谢反馈～')} style={[s.fb, { borderColor: p.line }]}><Txt f="b9" size={11} color={p.sub}>有用</Txt></Pressable>
          <Pressable testID="ask-fb-down" onPress={() => onToast('记下了，会继续改进')} style={[s.fb, { borderColor: p.line }]}><Txt f="b9" size={11} color={p.sub}>没用</Txt></Pressable>
        </View>
      ) : null}
    </BotBubble>
  );
}

function Cites({ list }: { list: string[] }) {
  const { p } = useApp();
  return (
    <View testID="ask-cite" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 8 }}>
      {list.map((c, i) => (
        <View key={i} style={[s.cite, { backgroundColor: p.bg2, borderColor: p.line }]}><Txt f="b8" size={10.5} color={p.sub}>{c}</Txt></View>
      ))}
    </View>
  );
}

/* .minichart：最多 7 根柱，柱高 = 8 + (v - min*0.9) / (max - min*0.9) * 34 */
function MiniChart({ chart }: { chart: NonNullable<AskAnswer['chart']> }) {
  const { p } = useApp();
  const pts = chart.points.slice(-7);
  const vals = pts.map(x => x.value ?? 0);
  const mx = Math.max(...vals, 0.001);
  const mn = Math.min(...vals) * 0.9;
  const span = Math.max(0.001, mx - mn);
  return (
    <View testID="ask-chart" style={[s.chart, { backgroundColor: p.bg2 }]}>
      {pts.map((x, i) => (
        <View key={i} style={s.barCol}>
          <Text style={[s.barVal, { color: p.sub }]}>{x.value ?? '—'}</Text>
          <View style={[s.bar, { height: 8 + ((x.value ?? 0) - mn) / span * 34, backgroundColor: x.low ? p.pink : p.blue, borderColor: p.ink }]} />
          <Text style={[s.barLab, { color: p.sub }]}>{DAYS[i % 7]}</Text>
        </View>
      ))}
    </View>
  );
}

/* 只有 **加粗** 一种标记 */
function Bold({ text, style }: { text: string; style: object }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g).filter(Boolean);
  return (
    <Text style={style}>
      {parts.map((t, i) => t.startsWith('**') && t.endsWith('**')
        ? <Text key={i} style={{ fontWeight: '900' }}>{t.slice(2, -2)}</Text>
        : <Text key={i}>{t}</Text>)}
    </Text>
  );
}
const plain = (t: string) => t.replace(/\*\*/g, '');

const s = StyleSheet.create({
  aih: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  av: { width: 62, height: 62, borderRadius: 22, borderWidth: 3, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#5BC27E' },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 2.5, borderRadius: 99, paddingVertical: 7, paddingHorizontal: 12 },
  chat: { marginTop: 16, flexDirection: 'column', gap: 12 },
  me: { alignSelf: 'flex-end', maxWidth: '86%', borderWidth: 2.5, borderRadius: 22, borderBottomRightRadius: 6, paddingVertical: 10, paddingHorizontal: 14, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 1, shadowRadius: 0, elevation: 3 },
  meText: { fontWeight: '800', fontSize: 14 },
  msgBot: { alignSelf: 'flex-start', flexDirection: 'row', gap: 8, alignItems: 'flex-start', maxWidth: '94%' },
  botAv: { width: 38, height: 38, borderRadius: 14, borderWidth: 2, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  bb: { flexShrink: 1, minWidth: 0, borderWidth: 2.5, borderRadius: 22, borderTopLeftRadius: 6, paddingVertical: 11, paddingHorizontal: 13, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 1, shadowRadius: 0, elevation: 3 },
  concl: { fontSize: 18, marginBottom: 3, lineHeight: 23 },
  body: { fontSize: 13.5, lineHeight: 21.6, fontWeight: '600' },
  typingDot: { width: 8, height: 8, borderRadius: 4, opacity: 0.6 },
  risk: { borderWidth: 2.5, borderRadius: 18, paddingVertical: 10, paddingHorizontal: 12, marginBottom: 8 },
  riskT: { fontWeight: '900', fontSize: 14.5 },
  riskLi: { fontSize: 12.5, lineHeight: 20, marginTop: 4, paddingLeft: 2 },
  recent: { borderRadius: 14, paddingVertical: 8, paddingHorizontal: 10, marginTop: 6 },
  recentT: { fontSize: 12, fontWeight: '700' },
  footer: { fontSize: 11.5, fontWeight: '800', marginTop: 6 },
  miniBtn: { marginTop: 9, alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 2, borderRadius: 99, paddingVertical: 5, paddingHorizontal: 11, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 1, shadowRadius: 0, elevation: 2 },
  cite: { borderWidth: 1.5, borderRadius: 8, paddingVertical: 2, paddingHorizontal: 7 },
  fb: { borderWidth: 2, borderRadius: 99, paddingVertical: 3, paddingHorizontal: 9 },
  chart: { flexDirection: 'row', alignItems: 'flex-end', gap: 6, height: 92, marginTop: 10, marginBottom: 4, paddingTop: 8, paddingHorizontal: 8, borderRadius: 16 },
  barCol: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', height: '100%' },
  bar: { width: '100%', borderWidth: 2, borderRadius: 8, borderBottomLeftRadius: 4, borderBottomRightRadius: 4 },
  barVal: { fontSize: 9.5, fontWeight: '900', marginBottom: 2 },
  barLab: { fontSize: 9.5, fontWeight: '900', marginTop: 3 },
  askbar: { position: 'absolute', left: 0, right: 0, bottom: 96, paddingTop: 10, paddingHorizontal: 14, paddingBottom: 12 },
  chips: { gap: 7, paddingBottom: 8, paddingHorizontal: 2 },
  chip: { borderWidth: 2.5, borderRadius: 99, paddingVertical: 6, paddingHorizontal: 12, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 1, shadowRadius: 0, elevation: 3 },
  inp: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 2.5, borderRadius: 99, paddingTop: 5, paddingBottom: 5, paddingLeft: 16, paddingRight: 5 },
  input: { flex: 1, minWidth: 0, fontSize: 14, fontWeight: '700', paddingVertical: 6, outlineStyle: 'none' } as object,
  send: { width: 38, height: 38, borderRadius: 19, borderWidth: 2.5, alignItems: 'center', justifyContent: 'center' },
});
