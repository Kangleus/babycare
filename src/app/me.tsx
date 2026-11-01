/* 我的 —— 原型 renderMe()（.profile .growcard .list .li .fam .free .toggle）+ M2：宝宝资料编辑、家庭成员（云端）、账号、设置 */
import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import Constants from 'expo-constants';
import Svg, { Defs, Pattern, Rect } from 'react-native-svg';
import { Page, PTitle } from '@/components/page';
import { AVATARS, BabyAvatar } from '@/components/home';
import { ConfirmSheet, ConfirmOpts } from '@/components/confirm';
import { POLICY_DRAFT, ProfileForm } from '@/components/onboarding';
import { Actions, Btn, Free, FullHero, FullPage, Heard, HGroup, Li, List, Sheet, Toggle } from '@/components/ui';
import { FamilySetupPage, InviteBody, JoinPage, LoginPage } from '@/components/cloud-ui';
import { cloud, useCloud } from '@/state/cloud';
import { Txt } from '@/components/txt';
import { Tuan } from '@/lib/svg';
import { useApp, LVN } from '@/state/app-state';
import { useLvAcc } from '@/state/hooks';
import { ageText } from '@/lib/time';
import { hard } from '@/theme/tokens';

const VERSION = Constants.expoConfig?.version ?? '1.0.0';
type Sub = null | 'profile' | 'login' | 'family' | 'join' | 'invite' | 'policy' | 'about';

export default function Me() {
  const app = useApp();
  const { p, baby, now, lvl, xp, xpMax, night, toggleNight, members, records, saveBaby, resetDemo, clearAll, showToast, goHealth, reminders } = app;
  const acc = useLvAcc();
  const [sub, setSub] = useState<Sub>(null);
  const [confirm, setConfirm] = useState<ConfirmOpts | null>(null);
  const c = useCloud();
  /* 进到「我的」时刷新一次：成员、记录（家人刚加入也能马上看到） */
  useFocusEffect(useCallback(() => { cloud.kick(); }, []));
  if (!baby) return null;
  const linked = !!c.link, signedIn = !!c.userId;
  const SYNC = { synced: ['已同步', p.green], syncing: ['同步中', p.yellow], offline: [`离线 · ${c.pending} 条待传`, p.bg2], noFamily: ['未加入家庭', p.bg2], signedOut: ['未登录', p.bg2], off: ['未接入', p.bg2] } as const;
  const [syncT, syncBg] = SYNC[c.status];
  const askSignOut = () => setConfirm({ t: '退出登录？', sub: c.pending ? `还有 ${c.pending} 条记录没同步上去，退出后它们只留在这台设备` : '本机记录会保留，不登录也能继续用', ok: '退出', mood: 'shy', onOk: async () => { await cloud.signOut(); showToast('已退出登录'); } });
  const askDelete = () => setConfirm({ t: '注销账号？', sub: '会删除你的账号和成员身份；只有你一个人的家庭，连同宝宝资料和记录会一起删除', ok: '继续', note: '第 1 步 / 共 2 步 · 和家人共享的记录会保留给家人', onOk: () => setTimeout(() => setConfirm({ t: '真的要注销吗？', sub: `${c.email ?? ''} 注销后无法恢复，这台设备上的数据也会清空`, ok: '永久注销', mood: 'shy', note: '第 2 步 / 共 2 步', onOk: async () => { try { await cloud.deleteAccount(); await clearAll(); } catch (e) { showToast(`注销失败：${(e as Error).message}`, 3500); } } }), 350) });
  const needLogin = (next: Sub) => setSub(signedIn ? next : 'login');
  const ROLE = { admin: '管理员', recorder: '可记录', viewer: '只读' };
  const askReset = () => linked ? showToast('已连上云端家庭，不能用演示数据覆盖真实记录') : setConfirm({ t: '重置演示数据？', sub: `会用演示记录替换${baby.name}现在的全部记录`, ok: '重置', note: '宝宝资料和首页卡片设置会保留', onOk: async () => { await resetDemo(); showToast('演示数据已恢复'); } });
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

        <List>
          <Li testID="me-health" icon="medbook" iconBg={p.pink} t="健康档案" sub="体温 · 用药 · 就诊 · 疫苗体检" onPress={() => goHealth('top')} />
          <Li testID="me-rem" icon="clock" iconBg={p.lilac} t="提醒事项" sub="用药 · 复诊 · 疫苗 · 体检" right={<Free t={`${reminders.length} 项待办`} bg={p.yellow} />} onPress={() => goHealth('rem')} last />
        </List>

        <HGroup t="家庭成员" ok={linked && c.status === 'synced' ? '已同步' : undefined} mini={linked ? `${c.link!.familyName} · ${members.length} 人` : signedIn ? '登录后创建或加入家庭' : '登录后可邀请家人'} />
        <List>
          {members.map(m => (
            <Li key={m.id} testID={m.isLocal ? 'member-local' : 'member'} iconBg={m.isLocal ? p.pink : p.blue} iconNode={<Txt f="h" size={15}>{m.name.slice(0, 1)}</Txt>} t={`${m.name}${m.isLocal ? '（我）' : ''}`} sub={`${ROLE[m.role]} · 记录会显示「${m.name}记」`} right={<Free t={linked ? (m.role === 'admin' ? '管理员' : '家人') : '本机'} bg={m.isLocal ? p.yellow : p.greenS} />} />
          ))}
          {linked ? <>
            <Li testID="invite" icon="family" iconBg={p.blue} t="邀请家人" sub="生成 6 位邀请码 · 48 小时有效" onPress={() => setSub('invite')} />
            <Li testID="join" icon="send" iconBg={p.orange} t="加入其他家庭" sub="输入家人发来的邀请码" onPress={() => setSub('join')} last />
          </> : signedIn ? <>
            <Li testID="family-setup" icon="family" iconBg={p.blue} t="创建我们家" sub="本机记录会同步到云端，再邀请家人" onPress={() => setSub('family')} />
            <Li testID="join" icon="send" iconBg={p.orange} t="加入家庭" sub="输入家人发来的 6 位邀请码" onPress={() => setSub('join')} last />
          </> : <>
            <Li testID="invite" icon="family" iconBg={p.blue} t="邀请家人" sub="爸爸、奶奶一起记 · 需要先登录" right={<Free t="登录后可用" bg={p.bg2} dashed />} onPress={() => setSub('invite')} />
            <Li testID="join" icon="send" iconBg={p.orange} t="加入家庭" sub="有邀请码？登录后输入" onPress={() => needLogin('join')} last />
          </>}
        </List>

        <HGroup t="账号" />
        <List>
          {signedIn ? <>
            <Li testID="account" icon="user" iconBg={p.orange} t={c.email ?? '已登录'} sub={linked ? `${c.link!.displayName} · 记录自动同步到云端` : '已登录 · 还没加入家庭'} right={<Free t={syncT} bg={syncBg} dashed={c.status !== 'synced'} />} />
            <Li testID="sign-out" icon="x" iconBg={p.bg2} t="退出登录" sub="本机记录会保留" onPress={askSignOut} />
            <Li testID="delete-account" icon="warn" iconBg={p.coral} t="注销账号" sub="删除账号和你的云端数据（两步确认）" onPress={askDelete} last />
          </> : (
            <Li testID="login" icon="user" iconBg={p.orange} t="登录 / 注册" sub="未登录 · 数据只存在这台设备" right={<Free t={c.status === 'off' ? '未接入' : '邮箱登录'} bg={p.bg2} dashed />} onPress={() => setSub('login')} last />
          )}
        </List>

        <HGroup t="设置" />
        <List>
          <Li icon="moon" iconBg="#9C8BE0" t="夜间模式" sub="暖光低亮，团团戴睡帽陪你守夜" right={<Toggle testID="night-toggle" on={night} onPress={toggleNight} />} />
          <Li testID="reset-demo" icon="star" iconBg={p.yellow} t="重置演示数据" sub="恢复豆米的演示记录" onPress={askReset} />
          <Li testID="clear-all" icon="warn" iconBg={p.coral} t="清空全部数据" sub="删除本机的宝宝资料和所有记录" onPress={askClear} />
          <Li testID="policy" icon="shield" iconBg={p.blue} t="隐私政策与用户协议" sub="草案 · 待法务审核" onPress={() => setSub('policy')} />
          <Li testID="about" icon="doc" iconBg={p.green} t="关于团子育儿本" sub={`v${VERSION} · ${linked ? '云端同步' : '本地版'}`} onPress={() => setSub('about')} last />
        </List>
        <Txt f="b7" size={11} color={p.sub} style={{ textAlign: 'center', marginTop: 18, lineHeight: 17.6 }}>团子育儿本 v{VERSION} · {linked ? `云端同步 · ${syncT}` : signedIn ? '已登录 · 未加入家庭' : '本地版（未登录）'}{'\n'}共 {records.length} 条记录{linked ? '，和家人实时同步' : '，全部保存在这台设备'}</Txt>
      </Page>

      <Modal visible={sub === 'profile'} animationType="slide" onRequestClose={() => setSub(null)}>
        <FullPage bg={p.pink} title="宝宝资料" onClose={() => setSub(null)} testID="profile-edit">
          <FullHero mood="happy" acc={['flower']} />
          <ProfileForm init={baby} submitLabel="保存" onSubmit={async b => { await saveBaby(b); setSub(null); showToast('宝宝资料已保存'); }} />
        </FullPage>
      </Modal>

      <Modal visible={sub === 'login'} animationType="slide" onRequestClose={() => setSub(null)}>
        <LoginPage onClose={() => setSub(null)} onDone={() => { setSub('family'); showToast('登录成功'); }} />
      </Modal>

      <Modal visible={sub === 'family'} animationType="slide" onRequestClose={() => setSub(null)}>
        <FamilySetupPage onClose={() => setSub(null)} onJoin={() => setSub('join')} />
      </Modal>

      <Modal visible={sub === 'join'} animationType="slide" onRequestClose={() => setSub(null)}>
        <JoinPage onClose={() => setSub(null)} />
      </Modal>

      <Sheet open={sub === 'invite'} onClose={() => setSub(null)} testID="invite-sheet">
        {linked ? <InviteBody onClose={() => setSub(null)} /> : <>
          <Heard mood="shy" acc={acc} t="邀请家人" sub="登录并创建家庭后就能邀请" />
          <View style={[s.dash, { backgroundColor: p.bg2, borderColor: p.line }]}>
            <Txt f="b8" size={12.5} style={{ lineHeight: 19 }}>邀请需要把记录同步到云端。登录后可以：</Txt>
            {['生成 6 位邀请码发给爸爸、奶奶', '家人的新记录几秒内出现在你手机上', '每条记录显示是谁记的'].map(t => <Txt key={t} f="b7" size={12} color={p.sub} style={{ marginTop: 4 }}>· {t}</Txt>)}
          </View>
          <Actions><Btn label="以后再说" onPress={() => setSub(null)} testID="invite-ok" /><Btn label={signedIn ? '创建家庭' : '去登录'} kind="pri" onPress={() => setSub(signedIn ? 'family' : 'login')} testID="invite-login" /></Actions>
        </>}
      </Sheet>

      <Sheet open={sub === 'policy'} onClose={() => setSub(null)} testID="policy-sheet">
        <Heard mood="idle" acc={['book']} t="隐私政策 & 用户协议" sub={app.settings.consentAt ? `已于 ${app.settings.consentAt.slice(0, 10)} 同意` : undefined} />
        <View style={[s.dash, { backgroundColor: p.bg2, borderColor: p.line }]}>
          {POLICY_DRAFT.map((t, i) => <Txt key={i} f={i ? 'b7' : 'b9'} size={12} color={i ? p.ink : '#C9452F'} style={{ lineHeight: 18, marginTop: i ? 6 : 0 }}>{t}</Txt>)}
        </View>
        <Actions><Btn label="关闭" onPress={() => setSub(null)} /></Actions>
      </Sheet>

      <Sheet open={sub === 'about'} onClose={() => setSub(null)} testID="about-sheet">
        <Heard mood="happy" acc={acc} t="关于团子育儿本" sub={`版本 v${VERSION} · ${linked ? '云端同步' : '本地版'}`} />
        <View style={[s.dash, { backgroundColor: p.bg2, borderColor: p.line }]}>
          {[['存储', linked ? `本机 + 云端（${c.link!.familyName}）` : '只存在这台设备（未登录）'], ['记录', `${records.length} 条`], ['成长', `团团 Lv.${lvl} · ${xp}/${xpMax}`], ['说明', '不做诊断、不推荐剂量 · 仅供参考']].map(([k, v]) => (
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
  dash: { marginTop: 14, borderWidth: 2, borderStyle: 'dashed', borderRadius: 18, padding: 12 },
  kv: { flexDirection: 'row', paddingVertical: 6 },
});
