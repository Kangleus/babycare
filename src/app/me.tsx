/* 我的 —— 原型 renderMe()（.profile .growcard .list .li .fam .free .toggle）+ M2 本地版：宝宝资料编辑、家庭成员、设置 */
import { useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import Constants from 'expo-constants';
import Svg, { Defs, Pattern, Rect } from 'react-native-svg';
import { Page, PTitle } from '@/components/page';
import { AVATARS, BabyAvatar } from '@/components/home';
import { ConfirmSheet, ConfirmOpts } from '@/components/confirm';
import { POLICY_DRAFT, ProfileForm } from '@/components/onboarding';
import { Actions, Autosave, Btn, Free, FullCard, FullHero, FullPage, GoBtn, Heard, HGroup, Inp, Li, List, NoteS, Fl, Sheet, Toggle } from '@/components/ui';
import { Txt } from '@/components/txt';
import { Tuan } from '@/lib/svg';
import { useApp, LVN } from '@/state/app-state';
import { useLvAcc } from '@/state/hooks';
import { ageText } from '@/lib/time';
import { hard } from '@/theme/tokens';

const VERSION = Constants.expoConfig?.version ?? '1.0.0';
type Sub = null | 'profile' | 'login' | 'invite' | 'policy' | 'about';

export default function Me() {
  const app = useApp();
  const { p, baby, now, lvl, xp, xpMax, night, toggleNight, members, records, saveBaby, resetDemo, clearAll, showToast } = app;
  const acc = useLvAcc();
  const [sub, setSub] = useState<Sub>(null);
  const [confirm, setConfirm] = useState<ConfirmOpts | null>(null);
  if (!baby) return null;
  const ROLE = { admin: '管理员', recorder: '可记录', viewer: '只读' };
  const askReset = () => setConfirm({ t: '重置演示数据？', sub: `会用演示记录替换${baby.name}现在的全部记录`, ok: '重置', note: '宝宝资料和首页卡片设置会保留', onOk: async () => { await resetDemo(); showToast('演示数据已恢复'); } });
  const askClear = () => setConfirm({ t: '清空全部数据？', sub: '宝宝资料、所有记录和设置都会从这台设备删除', ok: '继续', note: '第 1 步 / 共 2 步', onOk: () => setTimeout(() => setConfirm({ t: '真的要清空吗？', sub: `${records.length} 条记录删掉后无法恢复`, ok: '清空', mood: 'shy', note: '第 2 步 / 共 2 步 · 清空后回到首次启动', onOk: async () => { await clearAll(); } }), 350) });
  return (
    <>
      <Page>
        <PTitle title="我的" />
        <Pressable testID="me-profile" onPress={() => setSub('profile')} style={({ pressed }) => [s.profile, { backgroundColor: p.pinkS, borderColor: p.ink }, pressed ? { transform: [{ translateY: 3 }] } : hard(p, 5)]}>
          <View pointerEvents="none" style={[s.blob, { width: 140, height: 140, right: -40, top: -50 }]} />
          <View style={[s.avatar, { backgroundColor: p.card, borderColor: p.ink }]}><BabyAvatar k={baby.avatar} size={58} /></View>
          <View style={{ flex: 1 }}>
            <Txt f="h" size={26} testID="me-name">{baby.name}</Txt>
            <Txt f="b8" size={12} color={p.sub} style={{ marginTop: 3, lineHeight: 18 }}>{baby.gender === 'girl' ? '女宝' : '男宝'} · {baby.birthday} 出生 · {ageText(baby.birthday, now, false)}{'\n'}头像：{AVATARS.find(a => a.k === baby.avatar)?.n} · 点这里编辑</Txt>
          </View>
        </Pressable>
        <View style={[s.grow, { backgroundColor: p.greenS, borderColor: p.ink }, hard(p, 4)]}>
          <Tuan mood="happy" acc={acc} size={64} />
          <View style={{ flex: 1 }}>
            <Txt f="h" size={19}>团团 <Txt f="b9" size={16}>Lv.{lvl}</Txt> · {LVN[lvl]}</Txt>
            <View style={[s.pbar, { backgroundColor: p.card, borderColor: p.ink }]}>
              <View style={[s.pfill, { width: `${(xp / xpMax) * 100}%`, borderColor: p.ink }]}>
                <Svg style={StyleSheet.absoluteFill}><Defs><Pattern id="pb" width="28.3" height="28.3" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><Rect width="14.15" height="28.3" fill={p.yellow} /><Rect x="14.15" width="14.15" height="28.3" fill="#FFE08A" /></Pattern></Defs><Rect width="100%" height="100%" fill="url(#pb)" /></Svg>
              </View>
            </View>
            <Txt f="b8" size={11.5} color={p.sub}>再记 {xpMax - xp} 条{lvl < 5 ? `升到 Lv.${lvl + 1}` : ''} · 每记一条成长值 +1</Txt>
          </View>
        </View>

        <HGroup t="家庭成员" mini="云端同步开通后可邀请" />
        <List>
          {members.map(m => (
            <Li key={m.id} testID="member-local" iconBg={p.pink} iconNode={<Txt f="h" size={15}>{m.name.slice(0, 1)}</Txt>} t={`${m.name}${m.isLocal ? '（我）' : ''}`} sub={`${ROLE[m.role]} · 记录会显示「${m.name}记」`} right={<Free t="本机" bg={p.yellow} />} />
          ))}
          <Li testID="invite" icon="family" iconBg={p.blue} t="邀请家人" sub="爸爸、奶奶一起记 · 需要云端同步" right={<Free t="云端同步开通后可用" bg={p.bg2} dashed />} onPress={() => setSub('invite')} last />
        </List>

        <HGroup t="账号" />
        <List>
          <Li testID="login" icon="user" iconBg={p.orange} t="登录 / 注册" sub="未登录 · 数据只存在这台设备" right={<Free t="未接入" bg={p.bg2} dashed />} onPress={() => setSub('login')} last />
        </List>

        <HGroup t="设置" />
        <List>
          <Li icon="moon" iconBg="#9C8BE0" t="夜间模式" sub="暖光低亮，团团戴睡帽陪你守夜" right={<Toggle testID="night-toggle" on={night} onPress={toggleNight} />} />
          <Li testID="reset-demo" icon="star" iconBg={p.yellow} t="重置演示数据" sub="恢复豆米的演示记录" onPress={askReset} />
          <Li testID="clear-all" icon="warn" iconBg={p.coral} t="清空全部数据" sub="删除本机的宝宝资料和所有记录" onPress={askClear} />
          <Li testID="policy" icon="shield" iconBg={p.blue} t="隐私政策与用户协议" sub="草案 · 待法务审核" onPress={() => setSub('policy')} />
          <Li testID="about" icon="doc" iconBg={p.green} t="关于一句记" sub={`v${VERSION} · 本地版`} onPress={() => setSub('about')} last />
        </List>
        <Txt f="b7" size={11} color={p.sub} style={{ textAlign: 'center', marginTop: 18, lineHeight: 17.6 }}>一句记 v{VERSION} · 本地版（未接入云端）{'\n'}共 {records.length} 条记录，全部保存在这台设备</Txt>
      </Page>

      <Modal visible={sub === 'profile'} animationType="slide" onRequestClose={() => setSub(null)}>
        <FullPage bg={p.pink} title="宝宝资料" onClose={() => setSub(null)} testID="profile-edit">
          <FullHero mood="happy" acc={['flower']} />
          <ProfileForm init={baby} submitLabel="保存" onSubmit={async b => { await saveBaby(b); setSub(null); showToast('宝宝资料已保存'); }} />
        </FullPage>
      </Modal>

      <Modal visible={sub === 'login'} animationType="slide" onRequestClose={() => setSub(null)}>
        <FullPage bg={p.blue} title="登录 / 注册" onClose={() => setSub(null)} testID="login-page">
          <View style={[s.banner, { backgroundColor: p.card, borderColor: p.ink }, hard(p, 3)]}>
            <Txt f="b9" size={13} color="#C9452F">未接入 · 云端同步开通后可用</Txt>
            <Txt f="b8" size={11.5} color={p.sub} style={{ marginTop: 2 }}>现在不登录也能完整使用，数据只存在这台设备</Txt>
          </View>
          <FullHero mood="idle" acc={['cap']} line="登录后可以和家人一起记（即将开放）" />
          <FullCard>
            <Fl>手机号</Fl>
            <Inp testID="login-phone" editable={false} placeholder="即将开放" />
            <Fl style={{ marginTop: 14 }}>验证码</Fl>
            <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
              <View style={{ flex: 1 }}><Inp editable={false} placeholder="即将开放" /></View>
              <View style={[s.code, { backgroundColor: p.bg2, borderColor: p.ink }]}><Txt f="b9" size={12} color={p.sub}>获取验证码</Txt></View>
            </View>
            <NoteS>登录功能还没有连接服务器，这里只是界面预览，不会发送任何验证码</NoteS>
          </FullCard>
          <GoBtn testID="login-go" label="登录（未接入）" icon="lock" disabled onPress={() => {}} />
        </FullPage>
      </Modal>

      <Sheet open={sub === 'invite'} onClose={() => setSub(null)} testID="invite-sheet">
        <Heard mood="shy" acc={acc} t="邀请家人" sub="云端同步开通后可用" />
        <View style={[s.dash, { backgroundColor: p.bg2, borderColor: p.line }]}>
          <Txt f="b8" size={12.5} style={{ lineHeight: 19 }}>邀请需要把记录同步到云端，这个功能还没开通。开通后可以：</Txt>
          {['生成邀请卡片发给爸爸、奶奶', '设置「管理员 / 可记录 / 只读」权限', '每条记录显示是谁记的'].map(t => <Txt key={t} f="b7" size={12} color={p.sub} style={{ marginTop: 4 }}>· {t}</Txt>)}
        </View>
        <Actions><Btn label="知道了" kind="pri" onPress={() => setSub(null)} testID="invite-ok" /></Actions>
        <Autosave>现在所有记录都会显示「妈妈记」</Autosave>
      </Sheet>

      <Sheet open={sub === 'policy'} onClose={() => setSub(null)} testID="policy-sheet">
        <Heard mood="idle" acc={['book']} t="隐私政策 & 用户协议" sub={app.settings.consentAt ? `已于 ${app.settings.consentAt.slice(0, 10)} 同意` : undefined} />
        <View style={[s.dash, { backgroundColor: p.bg2, borderColor: p.line }]}>
          {POLICY_DRAFT.map((t, i) => <Txt key={i} f={i ? 'b7' : 'b9'} size={12} color={i ? p.ink : '#C9452F'} style={{ lineHeight: 18, marginTop: i ? 6 : 0 }}>{t}</Txt>)}
        </View>
        <Actions><Btn label="关闭" onPress={() => setSub(null)} /></Actions>
      </Sheet>

      <Sheet open={sub === 'about'} onClose={() => setSub(null)} testID="about-sheet">
        <Heard mood="happy" acc={acc} t="关于一句记" sub={`版本 v${VERSION} · 本地版`} />
        <View style={[s.dash, { backgroundColor: p.bg2, borderColor: p.line }]}>
          {[['存储', '只存在这台设备（未接入云端）'], ['记录', `${records.length} 条`], ['成长', `团团 Lv.${lvl} · ${xp}/${xpMax}`], ['说明', '不做诊断、不推荐剂量 · 仅供参考']].map(([k, v]) => (
            <View key={k} style={s.kv}><Txt f="b8" size={12.5} color={p.sub} style={{ width: 64 }}>{k}</Txt><Txt f="b8" size={12.5} style={{ flex: 1 }}>{v}</Txt></View>
          ))}
        </View>
        <Actions><Btn label="关闭" onPress={() => setSub(null)} /></Actions>
      </Sheet>

      <ConfirmSheet c={confirm} onClose={() => setConfirm(null)} />
    </>
  );
}

const s = StyleSheet.create({
  profile: { flexDirection: 'row', gap: 14, alignItems: 'center', borderWidth: 3, borderRadius: 28, padding: 16, marginTop: 12, overflow: 'hidden' },
  blob: { position: 'absolute', borderRadius: 999, backgroundColor: 'rgba(255,255,255,.28)' },
  avatar: { width: 66, height: 66, borderRadius: 24, borderWidth: 3, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  grow: { flexDirection: 'row', gap: 12, alignItems: 'center', borderWidth: 2.5, borderRadius: 26, paddingVertical: 12, paddingHorizontal: 14, marginTop: 14 },
  pbar: { height: 16, borderRadius: 99, borderWidth: 3, overflow: 'hidden', marginTop: 7, marginBottom: 4 },
  pfill: { position: 'absolute', left: 0, top: 0, bottom: 0, borderRightWidth: 3, borderRadius: 99, overflow: 'hidden' },
  banner: { marginTop: 14, borderWidth: 2.5, borderStyle: 'dashed', borderRadius: 18, paddingVertical: 9, paddingHorizontal: 12 },
  code: { height: 44, borderWidth: 2, borderStyle: 'dashed', borderRadius: 99, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center' },
  dash: { marginTop: 14, borderWidth: 2, borderStyle: 'dashed', borderRadius: 18, padding: 12 },
  kv: { flexDirection: 'row', paddingVertical: 6 },
});
