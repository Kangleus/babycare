/* 云端账号与家庭界面：沿用原型 .full 整页（登录 / 创建家庭 / 加入家庭）和 .sheet（邀请家人）的样式 */
import { useEffect, useState } from 'react';
import { Platform, Share, StyleSheet, View } from 'react-native';
import { Actions, Autosave, Btn, Fl, FullCard, FullHero, FullPage, GoBtn, Heard, Inp, NoteS, Seg } from './ui';
import { Txt } from './txt';
import { useApp } from '@/state/app-state';
import { useLvAcc } from '@/state/hooks';
import { cloud, useCloud } from '@/state/cloud';
import { isDemo, RELATIONS } from '@/data/sync';
import { hard } from '@/theme/tokens';

const errColor = '#C9452F';
const Rel = ({ v, on }: { v: string; on: (v: string) => void }) => (
  <Seg testID="rel" opts={RELATIONS.map(r => ({ k: r, t: r }))} value={v as (typeof RELATIONS)[number]} onChange={on} />
);
function Banner({ t, sub, tone = 'info', testID }: { t: string; sub?: string; tone?: 'info' | 'err' | 'ok'; testID?: string }) {
  const { p } = useApp();
  return (
    <View testID={testID} style={[s.banner, { backgroundColor: tone === 'ok' ? p.greenS : p.card, borderColor: p.ink }, hard(p, 3)]}>
      <Txt f="b9" size={13} color={tone === 'err' ? errColor : p.ink}>{t}</Txt>
      {sub ? <Txt f="b8" size={11.5} color={p.sub} style={{ marginTop: 2, lineHeight: 17 }}>{sub}</Txt> : null}
    </View>
  );
}

/* —— 登录 / 注册（邮箱 + 密码） —— */
export function LoginPage({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const { p } = useApp();
  const [mode, setMode] = useState<'in' | 'up'>('in');
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [sent, setSent] = useState('');
  const okEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const go = async () => {
    if (!okEmail) { setErr('邮箱格式不对'); return; }
    if (pw.length < 6) { setErr('密码至少 6 位'); return; }
    setBusy(true); setErr(''); setSent('');
    try {
      if (mode === 'in') { await cloud.signIn(email, pw); onDone(); }
      else if ((await cloud.signUp(email, pw)) === 'ok') onDone();
      else { setSent(email.trim()); setMode('in'); }
    } catch (e) { setErr((e as Error).message); }
    setBusy(false);
  };
  return (
    <FullPage bg={p.blue} title="登录 / 注册" onClose={onClose} testID="login-page">
      {sent ? <Banner testID="login-sent" tone="ok" t={`验证邮件已发到 ${sent}`} sub="点开邮件里的链接完成验证，再回来用邮箱和密码登录" />
        : <Banner t="登录后可以和家人一起记" sub="不登录也能完整使用；登录后本机记录会同步到云端" />}
      <FullHero mood={busy ? 'listen' : 'idle'} acc={['cap']} line={mode === 'in' ? '欢迎回来！' : '用邮箱注册一个账号'} />
      <Seg testID="login-mode" style={{ justifyContent: 'center', marginBottom: 14 }} opts={[{ k: 'in', t: '登录' }, { k: 'up', t: '注册' }]} value={mode} onChange={m => { setMode(m); setErr(''); }} />
      <FullCard>
        <Fl>邮箱</Fl>
        <Inp testID="login-email" value={email} onChangeText={setEmail} placeholder="name@example.com" keyboardType="email-address" autoCapitalize="none" autoCorrect={false} autoComplete="email" textContentType="emailAddress" />
        <Fl style={{ marginTop: 14 }}>密码</Fl>
        <Inp testID="login-password" value={pw} onChangeText={setPw} placeholder="至少 6 位" secureTextEntry autoCapitalize="none" autoComplete={mode === 'in' ? 'password' : 'new-password'} textContentType={mode === 'in' ? 'password' : 'newPassword'} onSubmitEditing={go} />
        {err ? <Txt testID="login-err" f="b9" size={12.5} color={errColor} style={{ marginTop: 10, lineHeight: 18 }}>{err}</Txt> : null}
        <NoteS>{mode === 'up' ? '注册后会收到一封验证邮件，点开链接后就能登录。暂不支持手机号登录。' : '忘记密码？暂时请联系我们重置（找回密码功能稍后开放）'}</NoteS>
      </FullCard>
      <GoBtn testID="login-go" label={busy ? '请稍候…' : mode === 'in' ? '登录' : '注册'} icon="lock" disabled={busy} onPress={go} />
    </FullPage>
  );
}

/* —— 登录后还没有家庭：创建我们家 / 有邀请码去加入 —— */
export function FamilySetupPage({ onClose, onJoin }: { onClose: () => void; onJoin: () => void }) {
  const { p, records } = useApp();
  const c = useCloud();
  const [rel, setRel] = useState('妈妈');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const real = records.filter(r => !isDemo(r.id)).length;
  const create = async () => { setBusy(true); setErr(''); try { await cloud.createFamily(rel); } catch (e) { setErr((e as Error).message); } setBusy(false); };
  if (c.link) {
    return (
      <FullPage bg={p.green} title="和家人一起记" onClose={onClose} testID="family-page">
        <Banner testID="family-ok" tone="ok" t={`已连上「${c.link.familyName}」`} sub={`你在家里是「${c.link.displayName}」· 记录会自动同步`} />
        <FullHero mood="happy" acc={['flower']} line="下一步：邀请家人一起记吧" />
        <GoBtn testID="family-done" label="好的" onPress={onClose} />
      </FullPage>
    );
  }
  return (
    <FullPage bg={p.green} title="和家人一起记" onClose={onClose} testID="family-page">
      <Banner t={c.email ? `已登录 ${c.email}` : '正在登录…'} sub={c.status === 'noFamily' ? '你还没有加入任何家庭' : '正在查找你的家庭…'} />
      <FullHero mood="shy" acc={['flower']} line="创建一个家，或者用邀请码加入" />
      <FullCard>
        <Fl>你是宝宝的？</Fl>
        <Rel v={rel} on={setRel} />
        <NoteS>{real ? `本机的 ${real} 条记录会上传到新家庭（演示数据不会上传）` : '演示数据不会上传到云端'}</NoteS>
        {err ? <Txt f="b9" size={12.5} color={errColor} style={{ marginTop: 8 }}>{err}</Txt> : null}
      </FullCard>
      <GoBtn testID="family-create" label={busy ? '请稍候…' : '创建我们家'} icon="family" disabled={busy || c.status !== 'noFamily'} onPress={create} />
      <GoBtn testID="family-join" label="我有邀请码" icon="send" onPress={onJoin} />
    </FullPage>
  );
}

/* —— 加入家庭：输入 6 位邀请码 —— */
export function JoinPage({ onClose }: { onClose: () => void }) {
  const { p, showToast } = useApp();
  const c = useCloud();
  const [code, setCode] = useState('');
  const [rel, setRel] = useState('爸爸');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const clean = code.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
  const join = async () => {
    if (clean.length !== 6) { setErr('邀请码是 6 位字母和数字'); return; }
    setBusy(true); setErr('');
    try { await cloud.acceptInvite(clean, rel); showToast('加入成功！家人的记录马上就到'); onClose(); } catch (e) { setErr((e as Error).message); }
    setBusy(false);
  };
  return (
    <FullPage bg={p.orange} title="加入家庭" onClose={onClose} testID="join-page">
      <Banner t="向家人要一个 6 位邀请码" sub="家人在「我的 → 邀请家人」里生成，48 小时内有效，只能用一次" />
      <FullHero mood="listen" acc={['cap']} line={c.link ? `加入后会离开「${c.link.familyName}」的同步` : '输入邀请码，一起记宝宝'} />
      <FullCard>
        <Fl>邀请码</Fl>
        <Inp testID="join-code" value={clean} onChangeText={setCode} placeholder="例如 7K2QMB" autoCapitalize="characters" autoCorrect={false} maxLength={8} style={{ fontSize: 22, letterSpacing: 6 }} />
        <Fl style={{ marginTop: 14 }}>你是宝宝的？</Fl>
        <Rel v={rel} on={setRel} />
        {err ? <Txt testID="join-err" f="b9" size={12.5} color={errColor} style={{ marginTop: 10 }}>{err}</Txt> : null}
      </FullCard>
      <GoBtn testID="join-go" label={busy ? '请稍候…' : '加入家庭'} icon="family" disabled={busy} onPress={join} />
    </FullPage>
  );
}

/* —— 邀请家人（sheet 内容）：生成 6 位码 + 有效期 + 分享文字 —— */
export function InviteBody({ onClose }: { onClose: () => void }) {
  const { p, baby, showToast } = useApp();
  const acc = useLvAcc();
  const [inv, setInv] = useState<{ code: string; expiresAt: string } | null>(null);
  const [err, setErr] = useState('');
  const [n, setN] = useState(0);
  useEffect(() => {
    let alive = true;
    cloud.createInvite().then(v => { if (alive) { setInv(v); setErr(''); } }, e => { if (alive) setErr((e as Error).message); });
    return () => { alive = false; };
  }, [n]);
  const exp = inv ? new Date(inv.expiresAt) : null;
  const expTxt = exp ? `${exp.getMonth() + 1}月${exp.getDate()}日 ${String(exp.getHours()).padStart(2, '0')}:${String(exp.getMinutes()).padStart(2, '0')}` : '';
  const text = inv ? `我在「团子育儿本」记录${baby?.name ?? '宝宝'}的吃喝拉撒睡，邀请你一起记～\n打开团子育儿本 → 我的 → 加入家庭，输入邀请码：${inv.code}\n（${expTxt} 前有效，只能用一次）` : '';
  const share = async () => {
    try {
      if (Platform.OS === 'web') {
        const nav = navigator as Navigator & { share?: (d: { text: string }) => Promise<void> };
        if (nav.share) await nav.share({ text }); else { await nav.clipboard.writeText(text); showToast('邀请文字已复制，发给家人吧'); }
      } else await Share.share({ message: text });
    } catch { /* 用户取消分享 */ }
  };
  return (
    <>
      <Heard mood="happy" acc={acc} t="邀请家人" sub="把邀请码发给爸爸、奶奶，一起记" />
      <View testID="invite-card" style={[s.dash, { backgroundColor: p.bg2, borderColor: p.line, alignItems: 'center' }]}>
        {err ? <Txt f="b9" size={13} color={errColor}>{err}</Txt> : (
          <>
            <Txt f="b8" size={12} color={p.sub}>邀请码</Txt>
            <View style={s.codeRow}>
              {(inv?.code ?? '······').split('').map((ch, i) => (
                <View key={i} style={[s.codeBox, { backgroundColor: p.card, borderColor: p.ink }, hard(p, 3)]}><Txt testID={`invite-c${i}`} f="h" size={24}>{ch}</Txt></View>
              ))}
            </View>
            <Txt testID="invite-exp" f="b8" size={11.5} color={p.sub}>{inv ? `${expTxt} 前有效（48 小时）· 只能用一次` : '正在生成…'}</Txt>
          </>
        )}
      </View>
      {inv ? <View style={[s.dash, { backgroundColor: p.card, borderColor: p.line }]}><Txt testID="invite-text" f="b7" size={12} style={{ lineHeight: 18 }}>{text}</Txt></View> : null}
      <Actions>
        <Btn label="关闭" onPress={onClose} testID="invite-ok" />
        <Btn label="换一个" onPress={() => { setInv(null); setN(x => x + 1); }} testID="invite-new" />
        <Btn label="分享邀请" icon="share" kind="pri" disabled={!inv} onPress={share} testID="invite-share" />
      </Actions>
      <Autosave>家人加入后，每条记录都会显示是谁记的</Autosave>
    </>
  );
}

const s = StyleSheet.create({
  banner: { marginTop: 14, borderWidth: 2.5, borderStyle: 'dashed', borderRadius: 18, paddingVertical: 9, paddingHorizontal: 12 },
  dash: { marginTop: 14, borderWidth: 2, borderStyle: 'dashed', borderRadius: 18, padding: 12 },
  codeRow: { flexDirection: 'row', gap: 7, marginVertical: 10 },
  codeBox: { width: 40, height: 50, borderRadius: 14, borderWidth: 2.5, alignItems: 'center', justifyContent: 'center' },
});
