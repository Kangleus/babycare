/* 首次使用流程 · 第 3–4 步（登录之后、还没有家庭）
   3 选择页（新建宝宝 / 我有邀请码）· 3a 输入邀请码 · 3b 加入成功 · 4 宝宝资料
   样式逐项对照 docs/prototype/index.html #onboarding 的 .ob-choice / .ob-code / .ob-baby / .ob-av / .hpills。
   原型里虚线的「原型演示」提示框和「填入 7K2QMB」按钮不做进 App。设计依据：docs/ONBOARDING-FLOW.md */
import { useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useApp } from '@/state/app-state';
import { cloud, useCloud } from '@/state/cloud';
import { RELATIONS } from '@/data/sync';
import { uid } from '@/data/repo';
import type { AvatarKey, Baby, FeedSub, Gender } from '@/data/types';
import { ageText, parseYmd, startOfDay } from '@/lib/time';
import { hard } from '@/theme/tokens';
import { Icon, Tuan } from '@/lib/svg';
import { AVATARS, BabyAvatar } from './home';
import { Banner, ErrLine } from './onboarding';
import { Fl, FullCard, FullPage, GoBtn, Inp, NoteS, Seg } from './ui';
import { fam, InkReset, Txt } from './txt';

export const FEEDS: { k: FeedSub; t: string }[] = [{ k: 'formula', t: '奶粉' }, { k: 'bm', t: '瓶喂母乳' }, { k: 'breast', t: '亲喂' }];
export const meNameOf = (role: string, other: string) => (role === '其他' ? other.trim() || '家人' : role);

/** .ob-hs + .ob-line */
function Hero({ mood, acc, line, cls, mt }: { mood: Parameters<typeof Tuan>[0]['mood']; acc: string[]; line: string; cls?: string; mt?: number }) {
  return (
    <>
      <View style={[s.hs, mt ? { marginTop: mt } : null]}><Tuan mood={mood} acc={acc} size={150} cls={cls} /></View>
      <Txt f="b9" size={14} style={s.line}>{line}</Txt>
    </>
  );
}
/** .ob-mini */
function Mini({ children, mt = 10 }: { children: string; mt?: number }) {
  return <Txt f="b8" size={11.5} style={[s.mini, { marginTop: mt }]}>{children}</Txt>;
}

/** 「你是宝宝的？」：7 个称呼 + 「其他」时的输入框（≤6 字） */
function RolePicker({ role, other, onRole, onOther, err, testID }: { role: string; other: string; onRole: (r: string) => void; onOther: (v: string) => void; err?: string; testID: string }) {
  const { p } = useApp();
  return (
    <>
      <Seg testID={testID} opts={RELATIONS.map(r => ({ k: r, t: r }))} value={role as (typeof RELATIONS)[number]} onChange={onRole} />
      {role === '其他' ? (
        <View style={{ marginTop: 10 }}>
          <Inp h={38} bg={p.bg} err={!!err} testID={`${testID}-other`} value={other} onChangeText={v => onOther(v.slice(0, 6))} maxLength={6} placeholder="怎么称呼你？比如：姑姑、小姨" />
          <ErrLine msg={err} />
        </View>
      ) : null}
    </>
  );
}

/* ---------- 3 选择页 ---------- */

function Choice({ k, tagK, icon, t, sub, tag, onPress, testID }: { k: string; tagK: string; icon: React.ReactNode; t: string; sub: string; tag: string; onPress: () => void; testID: string }) {
  const { p } = useApp();
  return (
    <InkReset value={null}>
      <Pressable testID={testID} onPress={onPress} style={({ pressed }) => [s.choice, { backgroundColor: p.card, borderColor: p.ink }, pressed ? { transform: [{ translateY: 4 }], ...hard(p, 1) } : hard(p, 5)]}>
        <View style={[s.choiceM, { backgroundColor: k, borderColor: p.ink }]}>{icon}</View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Txt f="h" size={22} style={{ lineHeight: 24.2 }}>{t}</Txt>
          <Txt f="b8" size={12} color={p.sub} style={{ marginTop: 4, lineHeight: 17.4 }}>{sub}</Txt>
          <View style={[s.tg2, { backgroundColor: tagK, borderColor: p.ink }]}><Txt f="b9" size={10.5}>{tag}</Txt></View>
        </View>
        <Icon name="chev" size={18} color={p.ink} />
      </Pressable>
    </InkReset>
  );
}

export function ChoosePage({ onCreate, onJoin, onSignOut }: { onCreate: () => void; onJoin: () => void; onSignOut: () => void }) {
  const { p } = useApp();
  const c = useCloud();
  return (
    <FullPage ob bg={p.green} title="欢迎加入" onClose={onSignOut} testID="ob-choose">
      <Banner tone="ok" icon="check" t={`已登录 ${c.email ?? ''}`} sub="还没有加入任何家庭，选一个开始吧" testID="ob-choose-banner" />
      <Hero mood="shy" acc={['flower']} line="你是家里第一个用团子的吗？" />
      <Choice testID="ob-choose-new" k={p.pinkS} tagK={p.yellow} icon={<Icon name="baby" size={62} />} t="新建宝宝" sub="我是家里第一个，来添加宝宝资料" tag="创建我们家" onPress={onCreate} />
      <Choice testID="ob-choose-join" k={p.orangeS} tagK={p.orange} icon={<View style={{ marginTop: 8 }}><Tuan mood="happy" acc={['flower']} size={74} /></View>} t="我有邀请码" sub="家人已经在用了，输入 6 位码加入" tag="加入家庭" onPress={onJoin} />
      <Mini mt={18}>邀请码在家人的「我的 › 邀请家人」里生成</Mini>
    </FullPage>
  );
}

/* ---------- 3a 输入邀请码 ---------- */

function CodeBoxes({ code, err, onChange, onSubmit }: { code: string; err: boolean; onChange: (c: string) => void; onSubmit: () => void }) {
  const { p } = useApp();
  const ref = useRef<React.ComponentRef<typeof TextInput>>(null);
  return (
    <Pressable onPress={() => ref.current?.focus()} style={s.code}>
      {Array.from({ length: 6 }, (_, i) => {
        const cur = i === code.length;
        return (
          <View key={i} testID={`ob-code-${i}`} style={[s.codeBox, { backgroundColor: cur ? p.yellowS : p.card, borderColor: err ? '#C9452F' : p.ink }, hard(p, 3),
            cur && ({ outlineWidth: 3, outlineStyle: 'dashed', outlineColor: '#FF7A92', outlineOffset: 2, transform: [{ translateY: -2 }] } as object)]}>
            <Txt f="h" size={27}>{code[i] ?? ''}</Txt>
          </View>
        );
      })}
      <TextInput ref={ref} testID="ob-code-in" value={code} maxLength={8} autoCapitalize="characters" autoCorrect={false} autoComplete="off" spellCheck={false}
        accessibilityLabel="邀请码" onSubmitEditing={onSubmit}
        onChangeText={v => onChange(v.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))}
        style={[StyleSheet.absoluteFill, { opacity: 0, fontSize: 16, width: '100%' }, Platform.OS === 'web' && ({ cursor: 'text', outlineStyle: 'none' } as object)]} />
    </Pressable>
  );
}

export function JoinPage({ onBack, onJoined }: { onBack: () => void; onJoined: (me: string) => void }) {
  const { p, showToast } = useApp();
  const [code, setCode] = useState('');
  const [role, setRole] = useState('爸爸');
  const [other, setOther] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const me = meNameOf(role, other);
  const join = async () => {
    if (busy) return;
    if (code.length !== 6) { setErr('邀请码是 6 位字母和数字'); showToast('邀请码是 6 位字母和数字'); return; }
    setErr(''); setBusy(true);
    try { await cloud.acceptInvite(code, me); setBusy(false); onJoined(me); }
    catch (e) { setBusy(false); const m = (e as Error).message; setErr(m); showToast(m); }
  };
  return (
    <FullPage ob bg={p.orange} title="加入家庭" onClose={onBack} testID="ob-join">
      {err
        ? <Banner tone="err" icon="warn" t={err} sub="请家人在「我的 › 邀请家人」里点「换一个」，把新码发给你" testID="ob-join-err" />
        : <Banner t="向家人要一个 6 位邀请码" sub="48 小时内有效，只能用一次" />}
      <Hero mood="listen" acc={['cap']} cls="listen" line="输入邀请码，一起记宝宝" />
      <FullCard>
        <Fl>邀请码</Fl>
        <CodeBoxes code={code} err={!!err} onChange={c => { setCode(c); if (err) setErr(''); }} onSubmit={join} />
        <Fl style={{ marginTop: 14 }}>你是宝宝的？</Fl>
        <RolePicker testID="ob-join-role" role={role} other={other} onRole={setRole} onOther={setOther} />
        <NoteS>家人看到的记录会显示「{me}记」</NoteS>
      </FullCard>
      <GoBtn testID="ob-join-go" label={busy ? '请稍候…' : '加入家庭'} icon="family" off={code.length < 6} onPress={join} />
    </FullPage>
  );
}

/* ---------- 3b 加入成功 ---------- */

export function JoinOkPage({ me, onGo }: { me: string; onGo: () => void }) {
  const { p, baby, records, members, now } = useApp();
  const name = baby?.name ?? '宝宝';
  const COL = [p.pink, p.orange, p.green, p.yellow];
  let k = 0;
  const pills = members.map(m => ({ ch: m.name.slice(0, 1), t: m.isLocal ? `${m.name}（我）· ${m.role === 'admin' ? '管理员' : '可记录'}` : `${m.name} · ${m.role === 'admin' ? '管理员' : '可记录'}`, bg: m.isLocal ? p.blue : COL[k++ % COL.length], me: m.isLocal }));
  return (
    <FullPage ob bg={p.green} title="" testID="ob-join-ok">
      <Hero mood="happy" acc={['flower']} cls="jump" mt={6} line={`欢迎加入「${name}家」！`} />
      <FullCard>
        <View style={[s.obBaby, { backgroundColor: p.pinkS, borderColor: p.ink }, hard(p, 3)]}>
          <View style={[s.obAv, { backgroundColor: p.card, borderColor: p.ink }]}><BabyAvatar k={baby?.avatar} size={46} /></View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Txt f="h" size={22} style={{ lineHeight: 24.2 }} testID="ob-join-ok-name">{name}</Txt>
            <Txt f="b8" size={11.5} color={p.sub} style={{ marginTop: 2 }} testID="ob-join-ok-sub">{baby ? `${baby.gender === 'girl' ? '女宝' : '男宝'} · ${ageText(baby.birthday, now, false)} · 已有 ${records.length} 条记录` : '正在同步…'}</Txt>
          </View>
        </View>
        <Fl style={{ marginTop: 14 }}>家里的人</Fl>
        <View style={s.pills} testID="ob-join-ok-members">
          {pills.map((x, i) => (
            <View key={i} style={[s.pill, { backgroundColor: p.card, borderColor: p.ink }]}>
              <View style={[s.pillB, { backgroundColor: x.bg, borderColor: p.ink }]}><Txt f="h" size={11}>{x.ch}</Txt></View>
              <Txt f="b9" size={11.5}>{x.t}</Txt>
            </View>
          ))}
        </View>
        <NoteS>你在家里是「{me}」· 记录会自动同步，每条都会显示是谁记的</NoteS>
      </FullCard>
      <GoBtn testID="ob-join-ok-go" label={`去看看${name}`} icon="home" onPress={onGo} />
    </FullPage>
  );
}

/* ---------- 4 宝宝资料（首次 = 空表单；「我的」里编辑也用它，不带「你是宝宝的？」） ---------- */

export const EMPTY_BABY = (): Baby => ({ id: `b-${uid()}`, name: '', birthday: '', gender: 'girl', avatar: 'baby', feeding: 'formula' });
type BabyErr = { name?: string; bd?: string; role?: string };

/** 生日文本框：只收数字，自动补成 YYYY-MM-DD */
const fmtBd = (v: string) => {
  const d = v.replace(/[^0-9]/g, '').slice(0, 8);
  return d.length > 6 ? `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6)}` : d.length > 4 ? `${d.slice(0, 4)}-${d.slice(4)}` : d;
};

export function BabyForm({ init, withRole, submitLabel, onSubmit, testID }: {
  init: Baby; withRole?: boolean; submitLabel: string; testID?: string;
  onSubmit: (b: Baby, displayName: string) => Promise<void> | void;
}) {
  const { p, now, showToast } = useApp();
  const [b, setB] = useState<Baby>(init);
  const [role, setRole] = useState('妈妈');
  const [other, setOther] = useState('');
  const [err, setErr] = useState<BabyErr>({});
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof Baby>(k: K, v: Baby[K]) => { setB(x => ({ ...x, [k]: v })); if (k === 'name' && err.name) setErr(e => ({ ...e, name: undefined })); if (k === 'birthday' && err.bd) setErr(e => ({ ...e, bd: undefined })); };
  const d = parseYmd(b.birthday);
  const age = d && d <= now ? ageText(b.birthday, now, false) : '';
  const me = meNameOf(role, other);
  const submit = async () => {
    if (busy) return;
    const e: BabyErr = {};
    if (!b.name.trim()) e.name = '给宝宝起个昵称吧';
    if (!b.birthday) e.bd = '选一下宝宝的生日';
    else if (!d) e.bd = '生日格式像 2026-03-28 这样';
    else if (d > startOfDay(now)) e.bd = '生日不能晚于今天';
    if (withRole && role === '其他' && !other.trim()) e.role = '填一下家人怎么称呼你';
    setErr(e);
    const first = e.name || e.bd || e.role;
    if (first) { showToast(first); return; }
    setBusy(true);
    try { await onSubmit({ ...b, name: b.name.trim().slice(0, 12), birthday: b.birthday.trim() }, me); }
    catch (ex) { showToast((ex as Error).message || '出错了，请稍后再试'); }
    setBusy(false);
  };
  return (
    <View testID={testID}>
      <FullCard>
        <Fl>宝宝昵称</Fl>
        <Inp h={38} bg={p.bg} err={!!err.name} testID="pf-name" value={b.name} onChangeText={v => set('name', v.slice(0, 12))} maxLength={12} placeholder="比如：糯米、小葡萄" />
        <ErrLine msg={err.name} />
        <Fl style={{ marginTop: 14 }}>生日</Fl>
        <Inp h={38} bg={p.bg} err={!!err.bd} testID="pf-bd" value={b.birthday} onChangeText={v => set('birthday', fmtBd(v))} maxLength={10} inputMode="numeric" placeholder="年-月-日，比如 2026-03-28" style={fam('b8')} />
        {err.bd ? <ErrLine msg={err.bd} /> : <NoteS>{age ? `今天 ${age}` : '选一下宝宝的出生日期'}</NoteS>}
        <Fl style={{ marginTop: 14 }}>性别</Fl>
        <Seg testID="pf-gender" opts={[{ k: 'girl', t: '女宝' }, { k: 'boy', t: '男宝' }]} value={b.gender} onChange={k => set('gender', k as Gender)} />
        <Fl style={{ marginTop: 14 }}>头像</Fl>
        <View style={s.avs}>
          {AVATARS.map(a => {
            const on = a.k === b.avatar;
            return (
              <Pressable key={a.k} testID={`pf-av-${a.k}`} onPress={() => set('avatar', a.k as AvatarKey)}
                style={[s.av, { backgroundColor: on ? p.pinkS : p.bg, borderColor: p.ink }, on && { transform: [{ translateY: -1 }], ...hard(p, 3) }]}>
                <View style={s.avW}>{a.k === 'baby' ? <Icon name="baby" size={40} /> : <View style={{ marginTop: 4 }}><Tuan mood="happy" acc={[a.k]} size={48} /></View>}</View>
                <Txt f="b9" size={10.5} color={on ? p.ink : p.sub}>{a.n}</Txt>
              </Pressable>
            );
          })}
        </View>
        <Fl style={{ marginTop: 14 }}>喂养方式</Fl>
        <Seg testID="pf-feed" opts={FEEDS} value={b.feeding} onChange={k => set('feeding', k as FeedSub)} />
        <NoteS>记喂奶时默认用这个，随时可以改</NoteS>
      </FullCard>
      {withRole ? (
        <FullCard style={{ marginTop: 14 }}>
          <Fl>你是宝宝的？</Fl>
          <RolePicker testID="pf-role" role={role} other={other} onRole={setRole} onOther={v => { setOther(v); if (err.role) setErr(e => ({ ...e, role: undefined })); }} err={err.role} />
          <NoteS>家人看到的记录会显示「{me}记」</NoteS>
        </FullCard>
      ) : null}
      <GoBtn testID="pf-submit" label={busy ? '请稍候…' : submitLabel} icon="check" disabled={busy} onPress={submit} />
    </View>
  );
}

export function ProfilePage({ onBack }: { onBack: () => void }) {
  const { p, finishOnboarding, showToast } = useApp();
  const [init] = useState(EMPTY_BABY);
  return (
    <FullPage ob bg={p.pink} title="宝宝资料" onClose={onBack} testID="ob-profile">
      <Hero mood="happy" acc={['flower']} line="先认识一下宝宝吧～" />
      <BabyForm init={init} withRole submitLabel="开始记录" onSubmit={async (b, me) => { await finishOnboarding(b, me); showToast(`欢迎！${b.name}的家建好啦`); }} />
      <Mini>宝宝资料只给你邀请的家人看，随时可以在「我的」里改</Mini>
    </FullPage>
  );
}

/* ---------- 第 3–4 步的状态机（登录了但还没有家庭；加入成功后停在 3b 等用户点「去看看」） ---------- */

export function FamilyFlow({ joined, onJoined, onEnter }: { joined: string | null; onJoined: (me: string) => void; onEnter: () => void }) {
  const { showToast } = useApp();
  const [scr, setScr] = useState<'choose' | 'join' | 'profile'>('choose');
  if (joined) return <JoinOkPage me={joined} onGo={() => { onEnter(); showToast('家人的记录已经同步过来啦'); }} />;
  if (scr === 'join') return <JoinPage onBack={() => setScr('choose')} onJoined={onJoined} />;
  if (scr === 'profile') return <ProfilePage onBack={() => setScr('choose')} />;
  return <ChoosePage onCreate={() => setScr('profile')} onJoin={() => setScr('join')} onSignOut={() => { void cloud.signOut(); showToast('已退出登录'); }} />;
}


const s = StyleSheet.create({
  hs: { width: 150, height: 150, alignSelf: 'center', marginBottom: -6 },
  line: { textAlign: 'center', marginBottom: 12 },
  mini: { textAlign: 'center', lineHeight: 18.4, opacity: 0.72 },
  choice: { flexDirection: 'row', gap: 12, alignItems: 'center', borderWidth: 3, borderRadius: 28, paddingTop: 14, paddingRight: 12, paddingBottom: 14, paddingLeft: 14, marginTop: 14 },
  choiceM: { width: 78, height: 78, borderRadius: 24, borderWidth: 2.5, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  tg2: { alignSelf: 'flex-start', marginTop: 6, borderWidth: 1.5, borderRadius: 99, paddingVertical: 1, paddingHorizontal: 8 },
  code: { flexDirection: 'row', gap: 7, justifyContent: 'center', marginTop: 4, marginBottom: 6 },
  codeBox: { width: 44, height: 56, borderRadius: 14, borderWidth: 2.5, alignItems: 'center', justifyContent: 'center' },
  obBaby: { flexDirection: 'row', gap: 12, alignItems: 'center', borderWidth: 2.5, borderRadius: 22, paddingVertical: 10, paddingHorizontal: 12 },
  obAv: { width: 54, height: 54, borderRadius: 19, borderWidth: 3, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 2, borderRadius: 99, paddingVertical: 3, paddingHorizontal: 9 },
  pillB: { width: 20, height: 20, borderRadius: 10, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  avs: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  av: { width: '31.4%', flexGrow: 1, alignItems: 'center', gap: 2, paddingTop: 7, paddingBottom: 6, borderRadius: 18, borderWidth: 2 },
  avW: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
});
