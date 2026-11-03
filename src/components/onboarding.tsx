/* 首次使用流程（正式版：先登录再用 + 只读示例）
   页面样式对照 docs/prototype/index.html#onboarding 逐页实现：
   1 欢迎 / 2 注册 / 2a 登录 / 2b 密码错 / 2c 验证邮件 / 2d 找回密码 / 2e 已发送 / 2f 设新密码
   原型里虚线的「原型演示」提示框（demoNote）和「一键填入演示账号」按钮**不做进 App**。
   设计依据：docs/ONBOARDING-FLOW.md */
import { ReactNode, useEffect, useRef, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useApp } from '@/state/app-state';
import { cloud } from '@/data/sync';
import { supabase } from '@/data/supabase';
import { hard } from '@/theme/tokens';
import { Icon, Tuan } from '@/lib/svg';
import type { IconName } from '@/lib/art';
import { CBox, Fl, FullCard, FullPage, GoBtn, Inp, NoteS } from './ui';
import { InkReset, Txt } from './txt';

/* ⚠️ 草案占位文本：上线前需由法务定稿替换 */
export const POLICY_DRAFT = [
  '【草案 · 占位文本 · 尚未经法务审核，不具法律效力】',
  '1. 我们收集什么：你主动记录的宝宝信息（昵称、生日、性别）和喂奶、睡眠、尿布、体温、用药等记录。',
  '2. 存在哪里：账号、家庭成员和记录保存在云端数据库（Supabase，新加坡区域），用于家人之间共享；未登录时不会上传任何数据。',
  '3. 语音与 AI：语音转成文字后不保存原始录音；「问团子」会把你的问题和相关记录发送给阿里云百炼处理，用于生成回答，不用于广告和模型训练。',
  '4. 健康相关：团子育儿本只记录你说的内容，不做诊断、不推荐用药剂量；身体不适请及时就医。',
  '5. 你的权利：可以随时导出数据、注销账号；注销后服务端的账号、家庭成员身份以及你独自创建的宝宝资料和记录会被删除。',
  '6. 联系我们：正式版本会在此处提供联系方式。',
];
export const POLICY_VERSION = 'draft-2026-11-02';

/* ---------- 通用小组件 ---------- */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** 顶部 banner（原型 .ob-banner）：默认白底 / ok 绿底 / err 红底；虚线描边一律是 --ink；标题前可带 16px 图标 */
export function Banner({ tone, icon, t, sub, testID }: { tone?: 'ok' | 'err'; icon?: IconName; t: string; sub?: ReactNode; testID?: string }) {
  const { p, night } = useApp();
  const bg = tone === 'ok' ? p.greenS : tone === 'err' ? (night ? '#4a2a24' : '#FFE6E0') : p.card;
  const tc = tone === 'err' ? (night ? '#ff9d8a' : '#C9452F') : p.ink;
  return (
    <InkReset value={null}>
      <View testID={testID} style={[s.banner, { backgroundColor: bg, borderColor: p.ink }, hard(p, 3)]}>
        <View style={s.bannerT}>
          {icon ? <Icon name={icon} size={16} color={tc} /> : null}
          <Txt f="b9" size={13} color={tc} style={{ flexShrink: 1 }}>{t}</Txt>
        </View>
        {sub ? <Txt f="b8" size={11.5} color={p.sub} style={{ marginTop: 2, lineHeight: 17.25 }}>{sub}</Txt> : null}
      </View>
    </InkReset>
  );
}

/** .segbig：大号分段切换（登录 / 注册） */
function SegBig<T extends string>({ opts, value, onChange, testID }: { opts: { k: T; t: string }[]; value: T; onChange: (k: T) => void; testID?: string }) {
  const { p } = useApp();
  return (
    <View style={[s.segbig, { backgroundColor: p.card, borderColor: p.ink, shadowColor: p.shadow }]}>
      {opts.map(o => {
        const on = o.k === value;
        return (
          <Pressable key={o.k} testID={testID ? `${testID}-${o.k}` : undefined} onPress={() => onChange(o.k)}
            style={[s.segbigBtn, on && { backgroundColor: p.yellow, borderWidth: 2, borderColor: p.ink }]}>
            <Txt f="b9" size={14}>{o.t}</Txt>
          </Pressable>
        );
      })}
    </View>
  );
}

/** .ob-step：带编号徽章的一步（原型：黄色方块 b + 说明，虚线分隔） */
function ObStep({ n, t, first, testID }: { n: number; t: string; first?: boolean; testID?: string }) {
  const { p } = useApp();
  return (
    <View testID={testID} style={[s.step, first ? null : { borderTopWidth: 2, borderStyle: 'dashed', borderTopColor: p.line }]}>
      <View style={[s.stepB, { backgroundColor: p.yellow, borderColor: p.ink }]}><Txt f="b9" size={12.5}>{n}</Txt></View>
      <Txt f="b9" size={13} style={{ flex: 1, lineHeight: 19 }}>{t}</Txt>
    </View>
  );
}

/** .ob-mail：邮箱药丸（黄底、可折行） */
function ObMail({ mail }: { mail: string }) {
  const { p } = useApp();
  return (
    <View style={{ alignItems: 'center' }}>
      <View style={{ backgroundColor: p.yellowS, borderRadius: 10, paddingHorizontal: 6, paddingVertical: 1 }}>
        <Txt f="b9" size={15} style={{ wordBreak: 'break-all', lineHeight: 20 } as object}>{mail}</Txt>
      </View>
    </View>
  );
}

/** .ob-resend：居中的小号链接 */
export function ObLink({ t, onPress, testID, style }: { t: string; onPress: () => void; testID?: string; style?: object }) {
  return (
    <Pressable testID={testID} onPress={onPress} style={[{ alignSelf: 'center', marginTop: 14 }, style]}>
      <Txt f="b9" size={12.5} style={{ textDecorationLine: 'underline', opacity: 0.8 }}>{t}</Txt>
    </Pressable>
  );
}

/** .ob-err：字段下方红字 */
export function ErrLine({ msg }: { msg?: string }) {
  const { night } = useApp();
  if (!msg) return null;
  return (
    <View style={{ flexDirection: 'row', gap: 5, alignItems: 'center', marginTop: 7, marginHorizontal: 4 }}>
      <Icon name="warn" size={13} color={night ? '#ff9d8a' : '#C9452F'} />
      <Txt f="b9" size={12} color={night ? '#ff9d8a' : '#C9452F'}>{msg}</Txt>
    </View>
  );
}

/* ---------- 1 欢迎页 ---------- */

const FEATS: { bg: 'pink' | 'yellow' | 'blue' | 'green'; ic: IconName; t: string; s: string }[] = [
  { bg: 'pink', ic: 'mic', t: '语音一句话', s: '半夜单手，说一句就记好' },
  { bg: 'yellow', ic: 'clock', t: '作息预测', s: '下一顿、下次小睡心里有数' },
  { bg: 'blue', ic: 'chat', t: '问团子', s: '翻宝宝自己的记录来回答' },
  { bg: 'green', ic: 'family', t: '家人一起记', s: '爸妈奶奶记录自动同步' },
];

export function Welcome({ onStart, onDemo }: { onStart: () => void; onDemo: () => void }) {
  const { p, night, toggleNight } = useApp();
  /* 尺寸对照原型 .full（padding 62/20/40）、.ob-top(42)、.ob-hero(210, margin -6/-10)、
     .btn.go(60)、.ob-link、.ob-mini；CTA 那一整块用弹性留白顶到屏幕底部（原型 .ob-grow）。 */
  return (
    <View style={{ flex: 1, backgroundColor: p.yellow }} testID="ob-welcome">
      <ScrollView contentContainerStyle={{ flexGrow: 1, paddingTop: 62, paddingHorizontal: 20, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
        <View style={s.obTop}>
          <Pressable testID="ob-night" accessibilityLabel="夜间模式" onPress={toggleNight}
            style={({ pressed }) => [s.iconbtn, { backgroundColor: p.card, borderColor: p.ink }, pressed ? { transform: [{ translateY: 3 }] } : hard(p, 3)]}>
            <Icon name={night ? 'sun' : 'moon'} size={22} color={p.ink} />
          </Pressable>
        </View>
        <View style={{ width: 210, height: 210, alignSelf: 'center', marginTop: -6, marginBottom: -10 }}>
          <Tuan mood="happy" acc={[night ? 'cap' : 'sprout']} size={210} cls="nod" />
        </View>
        <Txt f="h" size={38} style={{ textAlign: 'center', lineHeight: 40 }}>团子育儿本</Txt>
        <Txt f="b9" size={15} style={{ textAlign: 'center', marginTop: 8, lineHeight: 23 }}>一句话记下宝宝的吃睡拉，团团帮你算</Txt>
        <View style={s.feats}>
          {FEATS.map(f => (
            <View key={f.t} style={[s.feat, { backgroundColor: p.card, borderColor: p.ink, shadowColor: p.shadow }]}>
              <View style={[s.featIc, { backgroundColor: p[f.bg], borderColor: p.ink }]}><Icon name={f.ic} size={22} color={p.ink} /></View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Txt f="b9" size={13.5} style={{ lineHeight: 17 }}>{f.t}</Txt>
                <Txt f="b8" size={10.5} color={p.sub} style={{ marginTop: 2, lineHeight: 14 }}>{f.s}</Txt>
              </View>
            </View>
          ))}
        </View>
        <View style={{ flex: 1, minHeight: 12 }} />
        <GoBtn testID="ob-start" label="开始使用" icon="sparkle" onPress={onStart} />
        <Pressable testID="ob-demo" onPress={onDemo} style={{ marginTop: 16, alignSelf: 'center' }}>
          <Txt f="b9" size={14} style={{ textDecorationLine: 'underline' }}>先看看示例</Txt>
        </Pressable>
        <Txt f="b8" size={11.5} color={p.ink} style={{ textAlign: 'center', marginTop: 10, lineHeight: 18, opacity: 0.72 }}>
          示例是虚构的宝宝「豆米」，只能看，不会保存任何数据
        </Txt>
      </ScrollView>
    </View>
  );
}

/* ---------- 2 / 2a / 2b 注册 · 登录 ---------- */

export type Notice = { tone?: 'ok' | 'err'; icon?: IconName; t: string; sub?: string };

export function AuthPage({ onBack, onVerify, onForgot, initialMode = 'up', prefillEmail = '', notice }: {
  onBack: () => void; onVerify: (email: string) => void; onForgot: (email: string) => void;
  initialMode?: 'up' | 'in'; prefillEmail?: string; notice?: Notice | null;
}) {
  const { p, showToast } = useApp();
  const [mode, setMode] = useState<'up' | 'in'>(initialMode);
  const [email, setEmail] = useState(prefillEmail);
  const [pw, setPw] = useState('');
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<{ email?: string; pw?: string }>({});
  const [banner, setBanner] = useState<Notice | null>(null);

  const submit = async () => {
    if (busy) return;
    const up = mode === 'up';
    const e: { email?: string; pw?: string } = {};
    if (!EMAIL_RE.test(email.trim())) e.email = email.trim() ? '邮箱格式不对，像 name@example.com 这样' : '先填一下邮箱';
    if (pw.length < 6) e.pw = pw ? '密码至少 6 位' : '先填一下密码';
    setErr(e);
    if (e.email || e.pw) { showToast((e.email || e.pw)!); return; }
    if (up && !agree) { showToast('请先勾选同意《隐私政策》和《用户协议》'); return; }
    setBanner(null); setBusy(true);
    try {
      if (up) {
        const r = await cloud.signUp(email.trim(), pw, { consentAt: new Date().toISOString(), policyVersion: POLICY_VERSION });
        setBusy(false);
        if (r === 'confirm') onVerify(email.trim());
        /* r === 'ok'：项目关闭了邮箱验证，已经直接登录，外层的 gate 会切到下一步 */
      } else {
        await cloud.signIn(email.trim(), pw);
        setBusy(false); showToast('登录成功');
      }
    } catch (ex) {
      setBusy(false);
      const msg = (ex as Error).message;
      if (!up && msg === '邮箱或密码不对') {
        /* 不区分「账号不存在」和「密码错」（防止探测哪些邮箱注册过） */
        setBanner({ tone: 'err', icon: 'warn', t: '邮箱或密码不对', sub: '再试一次，或者点「忘记密码？」用邮箱重置' });
        setErr({ pw: ' ' });
      } else if (!up && msg.startsWith('邮箱还没验证')) {
        setBanner({ tone: 'err', icon: 'warn', t: '邮箱还没验证', sub: '去邮箱点一下链接，再回来登录' });
      } else {
        setBanner({ tone: 'err', icon: 'warn', t: msg });
      }
      showToast(msg);
    }
  };

  const up = mode === 'up';
  return (
    <FullPage bg={p.blue} title={up ? '注册' : '登录'} onClose={onBack} ob testID="ob-auth">
      {banner ? <Banner {...banner} testID="ob-auth-banner" /> : notice ? <Banner {...notice} testID="ob-auth-notice" /> : null}
      <View style={s.hs}><Tuan mood={busy ? 'listen' : up ? 'happy' : 'idle'} acc={up ? ['flower'] : ['cap']} size={150} /></View>
      <Txt f="b9" size={14} style={{ textAlign: 'center', marginBottom: 12 }}>{up ? '用邮箱注册，全家一起记' : '欢迎回来！'}</Txt>
      <SegBig testID="ob-mode" opts={[{ k: 'in', t: '登录' }, { k: 'up', t: '注册' }]} value={mode} onChange={m => { setMode(m); setErr({}); setBanner(null); }} />
      <FullCard>
        <Fl>邮箱</Fl>
        <Inp h={38} bg={p.bg} err={!!err.email} testID="ob-email" value={email} onChangeText={setEmail} placeholder="name@example.com" keyboardType="email-address" autoCapitalize="none" autoCorrect={false} autoComplete="email" textContentType="emailAddress" onSubmitEditing={submit} />
        <ErrLine msg={err.email} />
        <Fl style={{ marginTop: 14 }}>{up ? '设置密码' : '密码'}</Fl>
        <Inp h={38} bg={p.bg} err={!!err.pw} testID="ob-pw" value={pw} onChangeText={setPw} placeholder="至少 6 位" secureTextEntry autoCapitalize="none" autoComplete={up ? 'new-password' : 'password'} textContentType={up ? 'newPassword' : 'password'} onSubmitEditing={submit} />
        <ErrLine msg={err.pw?.trim() ? err.pw : undefined} />
        {up ? (
          <>
            <Pressable testID="ob-agree-row" onPress={() => setAgree(!agree)} style={s.agreeRow}>
              <CBox testID="ob-agree" on={agree} onPress={() => setAgree(!agree)} />
              <Txt f="b8" size={12.5} style={{ flex: 1, lineHeight: 18 }}>我已阅读并同意《隐私政策》和《用户协议》</Txt>
            </Pressable>
            <NoteS>注册后会收到一封验证邮件，点开链接就能登录</NoteS>
          </>
        ) : (
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 }}>
            <Txt f="b8" size={11.5} color={p.sub}>登录后记录自动同步给家人</Txt>
            <Pressable testID="ob-forgot" onPress={() => onForgot(email.trim())}>
              <Txt f="b9" size={12.5} color={p.sub} style={{ textDecorationLine: 'underline' }}>忘记密码？</Txt>
            </Pressable>
          </View>
        )}
      </FullCard>
      <GoBtn testID="ob-submit" label={busy ? '请稍候…' : up ? '注册' : '登录'} icon={up ? 'sparkle' : 'user'} disabled={busy} off={up && !agree} onPress={submit} />
    </FullPage>
  );
}

/* ---------- 2c 验证邮件已发送 ---------- */

export function VerifyPage({ email, onGoLogin, onBack }: { email: string; onGoLogin: () => void; onBack: () => void }) {
  const { p, showToast } = useApp();
  const [cd, setCd] = useState(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => () => { if (timer.current) clearInterval(timer.current); }, []);
  const resend = async () => {
    if (cd > 0) return;
    try {
      await cloud.resendVerify(email);
      showToast('验证邮件重新发出啦');
      setCd(60);
      timer.current = setInterval(() => setCd(c => { if (c <= 1 && timer.current) clearInterval(timer.current); return c - 1; }), 1000);
    } catch (e) { showToast((e as Error).message); }
  };
  return (
    <FullPage bg={p.green} title="验证邮箱" onClose={onBack} ob testID="ob-verify">
      <View style={s.hs}><Tuan mood="happy" acc={['book']} size={150} /></View>
      <View style={{ alignItems: 'center', marginBottom: 12 }}>
        <Txt f="b9" size={14} style={{ textAlign: 'center', lineHeight: 20 }}>验证邮件已发到</Txt>
        <ObMail mail={email} />
      </View>
      <FullCard>
        <ObStep n={1} t="打开邮箱，找到「团子育儿本」发来的邮件" first testID="ob-step-1" />
        <ObStep n={2} t="点邮件里的「验证邮箱」链接" testID="ob-step-2" />
        <ObStep n={3} t="回到这里，用邮箱和密码登录" testID="ob-step-3" />
        <NoteS>没找到？看看垃圾邮件箱，或者等 1 分钟再重新发送</NoteS>
      </FullCard>
      <GoBtn testID="ob-verified" label="我已验证，去登录" icon="check" onPress={onGoLogin} />
      <ObLink testID="ob-resend" t={cd > 0 ? `${cd} 秒后可以重新发送` : '没收到？重新发送'} onPress={resend} />
      <ObLink testID="ob-email-back" t="邮箱填错了，换一个" onPress={onBack} style={{ marginTop: 6 }} />
    </FullPage>
  );
}

/* ---------- 2d 找回密码 / 2e 已发送 ---------- */

export function ForgotPage({ onBack, initialEmail = '' }: { onBack: () => void; initialEmail?: string }) {
  const { p } = useApp();
  const [email, setEmail] = useState(initialEmail);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const send = async () => {
    if (!EMAIL_RE.test(email.trim())) { setErr('邮箱格式不对，像 name@example.com 这样'); return; }
    setErr(''); setBusy(true);
    try { await cloud.resetPassword(email.trim()); }
    catch { /* 反枚举：无论邮箱是否存在、是否发送失败，都显示已发送 */ }
    setBusy(false); setSent(true);
  };
  if (sent) {
    return (
      <FullPage bg={p.blue} title="找回密码" onClose={onBack} ob testID="ob-forgot-sent">
        <Banner tone="ok" icon="check" t="重置邮件已发送" sub={<>发到 <Txt f="b9" size={11.5} color={p.sub}>{email.trim()}</Txt>，点邮件里的链接设置新密码，1 小时内有效</>} testID="ob-sent-mail" />
        <View style={s.hs}><Tuan mood="happy" acc={['book']} size={150} /></View>
        <Txt f="b9" size={14} style={{ textAlign: 'center', marginBottom: 12 }}>去邮箱看看吧～</Txt>
        <FullCard>
          <ObStep n={1} t="打开邮件，点「重置密码」" first testID="ob-step-1" />
          <ObStep n={2} t="App 会自动打开「设置新密码」" testID="ob-step-2" />
          <ObStep n={3} t="设好后用新密码登录" testID="ob-step-3" />
        </FullCard>
        <GoBtn testID="ob-back-login" label="回到登录" icon="user" onPress={onBack} />
      </FullPage>
    );
  }
  return (
    <FullPage bg={p.blue} title="找回密码" onClose={onBack} ob testID="ob-forgot">
      <View style={s.hs}><Tuan mood="worry" acc={['cap']} size={150} /></View>
      <Txt f="b9" size={14} style={{ textAlign: 'center', marginBottom: 12 }}>别着急，用注册邮箱重置一下</Txt>
      <FullCard>
        <Fl>注册时用的邮箱</Fl>
        <Inp h={38} bg={p.bg} testID="ob-forgot-email" value={email} onChangeText={setEmail} placeholder="name@example.com" keyboardType="email-address" autoCapitalize="none" autoCorrect={false} onSubmitEditing={send} />
        <ErrLine msg={err} />
        <NoteS>我们会发一封重置邮件，点里面的链接就能设置新密码</NoteS>
      </FullCard>
      <GoBtn testID="ob-forgot-send" label={busy ? '请稍候…' : '发送重置邮件'} icon="send" disabled={busy} onPress={send} />
    </FullPage>
  );
}

/* ---------- 2f 设置新密码 ---------- */

export function SetPwPage({ from, onDone }: { from: 'recovery' | 'me'; onDone: (ok: boolean) => void }) {
  const { p, showToast } = useApp();
  const me = from === 'me';
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [err, setErr] = useState<{ pw?: string; pw2?: string }>({});
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (busy) return;
    if (pw.length < 6) { setErr({ pw: pw ? '密码至少 6 位' : '先填一下新密码' }); return; }
    if (pw !== pw2) { setErr({ pw2: '两次输入的不一样' }); return; }
    setErr({}); setBusy(true);
    try { await cloud.updatePassword(pw); setBusy(false); if (me) showToast('密码改好啦'); onDone(true); }
    catch (e) { setBusy(false); setErr({ pw2: (e as Error).message }); }
  };
  return (
    <FullPage bg={p.blue} title={me ? '修改密码' : '设置新密码'} onClose={() => onDone(false)} ob testID="ob-setpw">
      <View style={s.hs}><Tuan mood="idle" acc={['cap']} size={150} /></View>
      <Txt f="b9" size={14} style={s.line}>{me ? '换一个新密码，下次用它登录' : '设置一个新密码，记牢哦'}</Txt>
      <FullCard>
        <Fl>新密码</Fl>
        <Inp h={38} bg={p.bg} err={!!err.pw} testID="ob-pw-new" value={pw} onChangeText={setPw} placeholder="至少 6 位" secureTextEntry autoCapitalize="none" autoComplete="new-password" />
        <ErrLine msg={err.pw} />
        <Fl style={{ marginTop: 14 }}>再输一次</Fl>
        <Inp h={38} bg={p.bg} err={!!err.pw2} testID="ob-pw-new2" value={pw2} onChangeText={setPw2} placeholder="和上面一样" secureTextEntry autoCapitalize="none" autoComplete="new-password" onSubmitEditing={save} />
        <ErrLine msg={err.pw2} />
        {me ? <NoteS>改好后，其他设备需要用新密码重新登录</NoteS> : null}
      </FullCard>
      <GoBtn testID="ob-pw-save" label={busy ? '请稍候…' : '保存新密码'} icon="check" disabled={busy} onPress={save} />
    </FullPage>
  );
}

/* ---------- 从重置邮件回来（PASSWORD_RECOVERY） ----------
   Web 上 supabase 会在初始化时解析地址里的 #access_token=…&type=recovery 并登录，
   所以要在模块加载时（hash 还没被清掉）先记下来；原生深链靠 onAuthStateChange。 */
const recovery = {
  on: Platform.OS === 'web' && typeof window !== 'undefined' && /type=recovery/.test(window.location?.hash ?? ''),
  ls: new Set<() => void>(),
};
supabase.auth.onAuthStateChange(ev => { if (ev === 'PASSWORD_RECOVERY') { recovery.on = true; recovery.ls.forEach(f => f()); } });
export function useRecovery() {
  const [on, setOn] = useState(recovery.on);
  useEffect(() => { const f = () => setOn(true); recovery.ls.add(f); return () => { recovery.ls.delete(f); }; }, []);
  return [on, () => { recovery.on = false; setOn(false); }] as const;
}
/** 下次打开欢迎流程时直接停在哪一页（设置好新密码后回登录页 + 绿色 banner） */
let nextStart: { mode: 'up' | 'in'; email: string; notice: Notice | null } | null = null;
export const setNextStart = (v: typeof nextStart) => { nextStart = v; };

/* ---------- 流程状态机 ---------- */

type Scr = 'welcome' | 'auth' | 'verify' | 'forgot';
type Mode = 'up' | 'in';

export function OnboardingFlow() {
  const { enterDemo, showToast } = useApp();
  const [start] = useState(() => { const v = nextStart; nextStart = null; return v; });
  const [scr, setScr] = useState<Scr>(start ? 'auth' : 'welcome');
  const [mode, setMode] = useState<Mode>(start?.mode ?? 'up');
  const [email, setEmail] = useState(start?.email ?? '');
  const [banner, setBanner] = useState<Notice | null>(start?.notice ?? null);

  const goAuth = (m: Mode, pre = '', n: Notice | null = null) => { setMode(m); setEmail(pre); setBanner(n); setScr('auth'); };

  if (scr === 'welcome') {
    return <Welcome onStart={() => goAuth('up')} onDemo={() => { enterDemo(); showToast('这是示例宝宝豆米 · 只能看不能改'); }} />;
  }
  if (scr === 'auth') {
    return (
      <AuthPage initialMode={mode} prefillEmail={email} notice={banner}
        onBack={() => setScr('welcome')}
        onVerify={m => { setEmail(m); setScr('verify'); }}
        onForgot={m => { setEmail(m); setScr('forgot'); }} />
    );
  }
  if (scr === 'verify') {
    return <VerifyPage email={email} onBack={() => goAuth('up', email)} onGoLogin={() => goAuth('in', email, { tone: 'ok', icon: 'check', t: '验证好了就登录吧', sub: '用刚才注册的邮箱和密码' })} />;
  }
  return <ForgotPage initialEmail={email} onBack={() => goAuth('in', email)} />;
}

const s = StyleSheet.create({
  iconbtn: { width: 42, height: 42, borderRadius: 15, borderWidth: 2.5, alignItems: 'center', justifyContent: 'center' },
  obTop: { flexDirection: 'row', justifyContent: 'flex-end', height: 42 },
  feats: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 18 },
  feat: { width: 170, flexDirection: 'row', gap: 8, alignItems: 'center', borderWidth: 2.5, borderRadius: 22, padding: 10, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 1, shadowRadius: 0, elevation: 3 },
  featIc: { width: 36, height: 36, borderRadius: 13, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  banner: { borderWidth: 2.5, borderStyle: 'dashed', borderRadius: 18, paddingVertical: 9, paddingHorizontal: 12, marginTop: 2, marginBottom: 14 },
  bannerT: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  segbig: { flexDirection: 'row', borderWidth: 2.5, borderRadius: 99, padding: 4, marginBottom: 14, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 1, shadowRadius: 0, elevation: 3 },
  segbigBtn: { flex: 1, height: 38, borderRadius: 99, alignItems: 'center', justifyContent: 'center' },
  hs: { width: 150, height: 150, alignSelf: 'center', marginBottom: -6 },
  line: { textAlign: 'center', marginBottom: 12 },
  step: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9 },
  stepB: { width: 26, height: 26, borderRadius: 9, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  agreeRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12 },
  avs: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  av: { width: '31%', alignItems: 'center', gap: 2, paddingVertical: 8, borderRadius: 18, borderWidth: 2 },
  avIn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
});
