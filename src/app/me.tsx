/* 我的 —— 原型 #onboarding meHTML()（已登录 / 示例两种）+ renderMe() 的 .profile .growcard .list .li .free .toggle
   必须登录才能用：没有「本地版 / 清空全部数据 / 重置演示数据」；账号区只有 邮箱 / 修改密码 / 退出登录 / 注销账号。 */
import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { Modal, Platform, Pressable, Share, StyleSheet, View } from 'react-native';
import Constants from 'expo-constants';
import Svg, { Defs, Pattern, Rect } from 'react-native-svg';
import { Page, PTitle } from '@/components/page';
import { BabyAvatar } from '@/components/home';
import { ConfirmSheet, ConfirmOpts } from '@/components/confirm';
import { POLICY_DRAFT, SetPwPage } from '@/components/onboarding';
import { BabyForm, FEEDS } from '@/components/ob-family';
import { Actions, Btn, Free, FullHero, FullPage, Heard, HGroup, Li, List, Sheet, Toggle } from '@/components/ui';
import { cloud, useCloud } from '@/state/cloud';
import { Txt } from '@/components/txt';
import { Icon, Tuan } from '@/lib/svg';
import { useApp, LVN } from '@/state/app-state';
import { useLvAcc } from '@/state/hooks';
import { ageText } from '@/lib/time';
import { hard } from '@/theme/tokens';

const VERSION = Constants.expoConfig?.version ?? '1.0.0';
type Sub = null | 'profile' | 'pw' | 'policy';
const DANG = { day: '#C9452F', night: '#ff9d8a' };

/** 数据导出：CSV（记录）+ JSON（宝宝资料 + 记录 + 健康档案），不限次数 */
function useExport() {
  const { baby, records, health, showToast } = useApp();
  return async () => {
    const stamp = new Date().toISOString().slice(0, 10);
    const json = JSON.stringify({ app: '团子育儿本', exportedAt: new Date().toISOString(), baby, records, health }, null, 2);
    const q = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const csv = '\ufeff' + [['时间', '结束', '类型', '数值', '备注', '记录人', '来源'].join(','),
      ...records.map(r => [r.time, r.endTime ?? '', r.type, JSON.stringify(r.values), r.note ?? '', r.createdBy, r.src].map(q).join(','))].join('\n');
    try {
      if (Platform.OS === 'web') {
        const dl = (name: string, body: string, type: string) => {
          const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([body], { type })); a.download = name; a.click();
          setTimeout(() => URL.revokeObjectURL(a.href), 2000);
        };
        dl(`团子育儿本-${stamp}.csv`, csv, 'text/csv;charset=utf-8'); dl(`团子育儿本-${stamp}.json`, json, 'application/json');
      } else await Share.share({ message: json, title: `团子育儿本-${stamp}.json` });
      showToast(`已导出 CSV 和 JSON，共 ${records.length} 条记录`);
    } catch { /* 用户取消分享 */ }
  };
}

function Profile({ demo, onPress }: { demo?: boolean; onPress?: () => void }) {
  const { p, baby, now } = useApp();
  if (!baby) return null;
  const feed = (FEEDS.find(f => f.k === baby.feeding) ?? FEEDS[0]).t;
  return (
    <Pressable testID="me-profile" disabled={!onPress} onPress={onPress} style={({ pressed }) => [s.profile, { backgroundColor: p.pinkS, borderColor: p.ink }, pressed ? { transform: [{ translateY: 3 }] } : hard(p, 5)]}>
      <View pointerEvents="none" style={[s.blob, { width: 140, height: 140, right: -40, top: -50 }]} />
      <View style={[s.avatar, { backgroundColor: p.card, borderColor: p.ink }]}>{demo ? <Icon name="baby" size={58} /> : <BabyAvatar k={baby.avatar} size={58} />}</View>
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Txt f="h" size={26} testID="me-name">{baby.name}</Txt>
          {demo ? <View style={[s.tag, { backgroundColor: p.card, borderColor: p.ink }]}><Txt f="b9" size={10}>示例</Txt></View> : null}
        </View>
        <Txt f="b8" size={12} color={p.sub} style={{ marginTop: 3, lineHeight: 18 }}>{baby.gender === 'girl' ? '女宝' : '男宝'} · {baby.birthday} 出生 · {ageText(baby.birthday, now, false)}{'\n'}默认喂养：{feed}</Txt>
      </View>
    </Pressable>
  );
}

function Night() {
  const { night, toggleNight } = useApp();
  return <Li icon="moon" iconBg="#9C8BE0" t="夜间模式" sub="暖光低亮，团团戴睡帽陪你守夜" right={<Toggle testID="night-toggle" on={night} onPress={toggleNight} />} />;
}

/** 示例模式的「我的」：只读，引导去注册 */
function DemoMe() {
  const { p, goHealth, openSummary, exitDemo } = useApp();
  return (
    <Page>
      <PTitle title="我的" />
      <Profile demo />
      <Pressable testID="demo-cta" onPress={exitDemo} style={({ pressed }) => [s.cta, { backgroundColor: p.yellow, borderColor: p.ink }, pressed ? { transform: [{ translateY: 3 }] } : hard(p, 4)]}>
        <View style={{ width: 62, height: 62 }}><Tuan mood="happy" acc={['flower']} size={62} /></View>
        <View style={{ flex: 1 }}>
          <Txt f="h" size={20} color="#2a1f16">开始记我家宝宝</Txt>
          <Txt f="b8" size={11.5} color="#2a1f16" style={{ opacity: 0.8, marginTop: 2, lineHeight: 16 }}>注册一个账号，全家一起记{'\n'}示例数据不会带过去</Txt>
        </View>
        <Icon name="chev" size={18} color="#2a1f16" />
      </Pressable>
      <List>
        <Li testID="me-health" icon="medbook" iconBg={p.pink} t="健康档案" sub="看看示例里的体温、用药、疫苗体检" onPress={() => goHealth('top')} />
        <Li testID="me-summary" icon="doc" iconBg={p.yellow} t="一键摘要" sub="给医生 / 给奶奶的小便签" onPress={() => openSummary()} />
        <Night />
      </List>
      <Txt f="b7" size={11} color={p.sub} style={s.foot}>示例模式 · 所有数据为虚构演示数据，不会保存</Txt>
    </Page>
  );
}

export default function Me() {
  const app = useApp();
  const { p, night, baby, lvl, xp, xpMax, members, saveBaby, showToast, goHealth, reminders, openSummary, openInvite, demo } = app;
  const acc = useLvAcc();
  const [sub, setSub] = useState<Sub>(null);
  const [confirm, setConfirm] = useState<ConfirmOpts | null>(null);
  const c = useCloud();
  const doExport = useExport();
  /* 进到「我的」时刷新一次：成员、记录（家人刚加入也能马上看到） */
  useFocusEffect(useCallback(() => { if (!demo) cloud.kick(); }, [demo]));
  if (demo) return <DemoMe />;
  if (!baby) return null;
  const ROLE = { admin: '管理员', recorder: '可记录', viewer: '只读' };
  const askLogout = () => setConfirm({
    tip: true, t: '退出登录？', sub: '记录都保存在云端，下次用邮箱和密码登录就能看到', ok: '退出',
    onOk: async () => { await cloud.signOut(); showToast('已退出登录'); },
  });
  const askDelete = () => setConfirm({
    tip: true, t: '注销账号？', ok: '继续',
    sub: '会删除你的账号；如果家里只有你一个人，宝宝和所有记录也会一起删除；如果还有其他家人，记录保留给他们',
    note: '第 1 步 / 共 2 步 · 和家人共享的家庭会保留记录',
    onOk: () => setTimeout(() => setConfirm({
      tip: true, mood: 'worry', t: '真的要注销吗？', sub: '注销后无法恢复。建议先在「数据导出」里备份一份', note: '第 2 步 / 共 2 步', ok: '确认注销',
      onOk: async () => {
        try { await cloud.deleteAccount(); showToast('账号已注销，数据已删除'); }
        catch { showToast('注销没成功，请稍后再试', 3000); }
      },
    }), 250),
  });
  return (
    <>
      <Page>
        <PTitle title="我的" />
        <Profile onPress={() => setSub('profile')} />
        <View style={[s.grow, { backgroundColor: p.greenS, borderColor: p.ink }, hard(p, 4)]}>
          <Tuan mood="happy" acc={acc} size={64} />
          <View style={{ flex: 1 }}>
            <Txt f="h" size={19}>团团 <Txt f="b9" size={16}>Lv.{lvl}</Txt> · {LVN[lvl]}</Txt>
            <View style={[s.pbar, { backgroundColor: p.card, borderColor: p.ink }]}>
              <View style={[s.pfill, { width: `${(xp / xpMax) * 100}%`, borderColor: p.ink }]}>
                <Svg style={StyleSheet.absoluteFill}><Defs><Pattern id="pb" width="28.3" height="28.3" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><Rect width="14.15" height="28.3" fill={p.yellow} /><Rect x="14.15" width="14.15" height="28.3" fill="#FFE08A" /></Pattern></Defs><Rect width="100%" height="100%" fill="url(#pb)" /></Svg>
              </View>
            </View>
            <Txt f="b8" size={11.5} color={p.sub}>再记 {xpMax - xp} 条升到 Lv.{Math.min(5, lvl + 1)}</Txt>
          </View>
        </View>

        <List>
          <Li testID="me-health" icon="medbook" iconBg={p.pink} t="健康档案" sub="体温 · 用药 · 就诊 · 疫苗体检" onPress={() => goHealth('top')} />
          <Li testID="me-rem" icon="clock" iconBg={p.lilac} t="提醒事项" sub="用药 · 复诊 · 疫苗 · 体检" right={<Free t={`${reminders.length} 项待办`} bg={p.yellow} />} onPress={() => goHealth('rem')} />
          <Li testID="me-summary" icon="doc" iconBg={p.yellow} t="一键摘要" sub="给医生 / 给奶奶的小便签" onPress={() => openSummary()} last />
        </List>

        <HGroup t="家庭成员" ok={c.status === 'synced' ? '已同步' : undefined} mini={`${c.link?.familyName ?? '我们家'} · ${members.length} 人`} />
        <List>
          {members.map(m => (
            <Li key={m.id} testID={m.isLocal ? 'member-local' : 'member'} iconBg={m.role === 'admin' ? p.pink : m.isLocal ? p.blue : p.orange} iconNode={<Txt f="h" size={15}>{m.name.slice(0, 1)}</Txt>}
              t={`${m.name}${m.isLocal ? '（我）' : ''}`} sub={`${ROLE[m.role]} · 记录会显示「${m.name}记」`} />
          ))}
          <Li testID="invite" icon="family" iconBg={p.blue} t="邀请家人" sub="生成 6 位邀请码 · 48 小时有效" onPress={openInvite} last />
        </List>

        <List>
          <Li testID="export" icon="down" iconBg={p.green} t="数据导出" sub="CSV / JSON · 不限次数" right={<Free t="永久免费" />} onPress={doExport} />
          <Night />
          <Li testID="policy" icon="shield" iconBg={p.blue} t="隐私政策与用户协议" sub="录音不保存 · 不用于广告和训练" onPress={() => setSub('policy')} last />
        </List>

        <HGroup t="账号" />
        <List>
          <Li testID="account" icon="mail" iconBg={p.blueS} t={c.email ?? ''} sub="邮箱登录 · 已验证" right={<Free t="已登录" bg={p.green} />} />
          <Li testID="change-pw" icon="lockk" iconBg={p.yellowS} t="修改密码" sub="改完下次用新密码登录" onPress={() => setSub('pw')} />
          <Li testID="sign-out" icon="logout" iconBg={p.bg2} t="退出登录" sub="记录都在云端，换手机登录还在" onPress={askLogout} />
          <Li testID="delete-account" icon="trash" iconBg={p.pinkS} t="注销账号" tColor={night ? DANG.night : DANG.day} sub="删除账号；只有你一个人的家庭会一起删除" onPress={askDelete} last />
        </List>
        <Txt f="b7" size={11} color={p.sub} style={s.foot} testID="me-foot">团子育儿本 v{VERSION} · 已登录{'\n'}团团不做诊断，不推荐用药剂量</Txt>
      </Page>

      <Modal visible={sub === 'profile'} animationType="slide" onRequestClose={() => setSub(null)}>
        <FullPage ob bg={p.pink} title="宝宝资料" onClose={() => setSub(null)} testID="profile-edit">
          <FullHero mood="happy" acc={['flower']} />
          <BabyForm init={baby} submitLabel="保存" onSubmit={async b => { await saveBaby(b); setSub(null); showToast('宝宝资料已保存'); }} />
        </FullPage>
      </Modal>

      <Modal visible={sub === 'pw'} animationType="slide" onRequestClose={() => setSub(null)}>
        <SetPwPage from="me" onDone={() => setSub(null)} />
      </Modal>

      <Sheet open={sub === 'policy'} onClose={() => setSub(null)} testID="policy-sheet">
        <Heard mood="idle" acc={['book']} t="隐私政策与用户协议" sub={app.settings.consentAt ? `已于 ${app.settings.consentAt.slice(0, 10)} 同意` : '草案 · 待法务审核'} />
        <View style={[s.pol, { backgroundColor: p.bg2, borderColor: p.line }]}>
          {POLICY_DRAFT.map((t, i) => <Txt key={i} f={i ? 'b7' : 'b9'} size={12} color={i ? p.ink : '#C9452F'} style={{ lineHeight: 19.2, marginBottom: 6 }}>{t}</Txt>)}
        </View>
        <Actions><Btn label="我知道了" kind="pri" onPress={() => setSub(null)} /></Actions>
      </Sheet>

      <ConfirmSheet c={confirm} onClose={() => setConfirm(null)} />
    </>
  );
}

const s = StyleSheet.create({
  profile: { flexDirection: 'row', gap: 14, alignItems: 'center', borderWidth: 3, borderRadius: 28, padding: 16, marginTop: 12, overflow: 'hidden' },
  blob: { position: 'absolute', borderRadius: 999, backgroundColor: 'rgba(255,255,255,.28)' },
  avatar: { width: 66, height: 66, borderRadius: 24, borderWidth: 3, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  tag: { borderWidth: 1.5, borderStyle: 'dashed', borderRadius: 99, paddingVertical: 1, paddingHorizontal: 8 },
  cta: { flexDirection: 'row', gap: 12, alignItems: 'center', borderWidth: 3, borderRadius: 26, paddingVertical: 12, paddingHorizontal: 14, marginTop: 14 },
  grow: { flexDirection: 'row', gap: 12, alignItems: 'center', borderWidth: 2.5, borderRadius: 26, paddingVertical: 12, paddingHorizontal: 14, marginTop: 14 },
  pbar: { height: 16, borderRadius: 99, borderWidth: 3, overflow: 'hidden', marginTop: 7, marginBottom: 4 },
  pfill: { position: 'absolute', left: 0, top: 0, bottom: 0, borderRightWidth: 3, borderRadius: 99, overflow: 'hidden' },
  pol: { marginTop: 12, borderWidth: 2, borderStyle: 'dashed', borderRadius: 16, padding: 12, paddingBottom: 6 },
  foot: { textAlign: 'center', marginTop: 18, lineHeight: 17.6 },
});
