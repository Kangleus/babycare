import { ReactNode, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { TabList, TabSlot, Tabs, TabTrigger } from 'expo-router/ui';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useFonts, Nunito_400Regular, Nunito_600SemiBold, Nunito_700Bold, Nunito_800ExtraBold, Nunito_900Black } from '@expo-google-fonts/nunito';
import { ZCOOLKuaiLe_400Regular } from '@expo-google-fonts/zcool-kuaile';
import { AppStateProvider, useApp } from '@/state/app-state';
import { useCloud } from '@/state/cloud';
import { cloud } from '@/data/sync';
import { TabBar } from '@/components/tabbar';
import { Cele, NightStars, NightTint, StatusBarMock, Toast, TopFade } from '@/components/chrome';
import { SamplesPop } from '@/components/sample';
import { RecordSheet } from '@/components/record-sheet';
import { VoiceLayer } from '@/components/voice';
import { TrendSheet } from '@/components/trend';
import { OnboardingFlow, SetPwPage, setNextStart, useRecovery } from '@/components/onboarding';
import { BabyForm, EMPTY_BABY, FamilyFlow } from '@/components/ob-family';
import { CoachMark, FirstSheet, InviteSheet } from '@/components/ob-home';
import { FullPage } from '@/components/ui';
import { usePathname } from 'expo-router';
import { injectMascotCss } from '@/lib/mascot-css';
import { RingBanner, RingWatcher } from '@/components/health/ring';
import { SummarySheet } from '@/components/summary';
import { hard } from '@/theme/tokens';

injectMascotCss();

SplashScreen.preventAutoHideAsync();

/** 示例模式的顶部横幅：任何写操作都会被拦，点这里出去开始记自己的宝宝 */
function DemoBanner() {
  const { p, exitDemo } = useApp();
  return (
    <View testID="demo-banner" style={[st.demo, { backgroundColor: p.pinkS, borderBottomColor: p.ink }]}>
      <Text style={[st.demoT, { color: p.ink }]}>这是示例宝宝豆米 · 只能看不能改</Text>
      <Pressable testID="demo-start" onPress={exitDemo}
        style={({ pressed }) => [st.demoBtn, { backgroundColor: p.pink, borderColor: p.ink }, pressed ? { transform: [{ translateY: 2 }] } : hard(p, 2)]}>
        <Text style={[st.demoBtnT, { color: p.ink }]}>开始记我家宝宝</Text>
      </Pressable>
    </View>
  );
}

/** 主界面：底部 4 个 Tab + 各种弹层 */
function TabTree() {
  const { p, night } = useApp();
  const path = usePathname();
  return (
    <View style={{ flex: 1, backgroundColor: p.bg }}>
      <StatusBar style={night ? 'light' : 'dark'} />
      <NightStars />
      <Tabs style={{ flex: 1 }}>
        <TabSlot style={{ flex: 1 }} />
        {/* 隐藏的 TabList 只用于注册路由，真正的 Tab 栏是下面的自定义 TabBar */}
        <TabList style={{ display: 'none' }}>
          <TabTrigger name="home" href="/" />
          <TabTrigger name="health" href="/health" />
          <TabTrigger name="ai" href="/ai" />
          <TabTrigger name="me" href="/me" />
        </TabList>
        <TopFade />
        <StatusBarMock />
        {path === '/' ? <SamplesPop /> : null}
        <TabBar />
        <CoachMark />
        <RingWatcher />
        <RingBanner />
        <RecordSheet />
        <TrendSheet />
        <SummarySheet />
        <VoiceLayer />
        <Cele />
        <FirstSheet />
        <InviteSheet />
        <NightTint />
        <Toast />
      </Tabs>
    </View>
  );
}

/** 连接中（登录后正在查家庭） */
function Linking() {
  const { p } = useApp();
  return (
    <View style={{ flex: 1, backgroundColor: p.bg, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: p.sub, fontWeight: '800' }}>正在连接你的家…</Text>
    </View>
  );
}

/** 整页流程（欢迎 / 认证 / 选择 / 宝宝资料）外面那层：状态栏、夜间蒙版、toast */
function FlowChrome({ children }: { children: ReactNode }) {
  return (
    <View style={{ flex: 1 }}>
      {children}
      <StatusBarMock />
      <NightTint />
      <Toast />
    </View>
  );
}

/** 有家庭但还没有宝宝（极少见：比如加入的家庭里管理员还没建宝宝）：补一份宝宝资料 */
function BabyMissing() {
  const { p, saveBaby } = useApp();
  const [init] = useState(EMPTY_BABY);
  return (
    <FullPage ob bg={p.pink} title="宝宝资料" testID="ob-profile-missing">
      <View style={{ height: 12 }} />
      <BabyForm init={init} submitLabel="开始记录" onSubmit={b => saveBaby(b)} />
    </FullPage>
  );
}

function Shell() {
  const { ready, demo, baby, resetLocal } = useApp();
  const c = useCloud();
  /* 加入家庭成功后先停在 3b「加入成功」，用户点「去看看」才进首页 */
  const [joined, setJoined] = useState<string | null>(null);
  const [recovering, endRecovery] = useRecovery();
  useEffect(() => { if (ready) SplashScreen.hideAsync(); }, [ready]);
  /* 退出 / 注销 / 换账号：这台设备上的宝宝、记录、健康档案、设置全部清掉（只留夜间模式） */
  const prevUser = useRef<string | null>(null);
  useEffect(() => {
    if (prevUser.current && prevUser.current !== c.userId) { void resetLocal(); setJoined(null); }
    prevUser.current = c.userId;
  }, [c.userId, resetLocal]);

  if (!ready) return <View style={{ flex: 1, backgroundColor: '#FFF9EC' }} />;

  /* 示例模式：只读豆米，不建会话、不同步 */
  if (demo) {
    return (
      <View style={{ flex: 1 }}>
        <DemoBanner />
        <TabTree />
      </View>
    );
  }

  /* 点了重置邮件里的链接：先设新密码，设好后退出，回登录页用新密码登录 */
  if (recovering && c.userId) {
    const email = c.email ?? '';
    return (
      <FlowChrome>
        <SetPwPage from="recovery" onDone={ok => {
          setNextStart({ mode: 'in', email, notice: ok ? { tone: 'ok', icon: 'check', t: '新密码设置好了', sub: '用新密码登录吧' } : null });
          endRecovery(); void cloud.signOut();
        }} />
      </FlowChrome>
    );
  }

  /* 没登录：欢迎 → 注册 / 登录 → 验证 / 忘记密码 */
  if (!c.userId) return <FlowChrome><OnboardingFlow /></FlowChrome>;

  /* 登录了但还没加入家庭：选择 → 新建宝宝 / 邀请码；加入成功页 */
  if (!c.link || joined) {
    if (!c.link && !joined && c.status !== 'noFamily') return <Linking />;
    return <FlowChrome><FamilyFlow joined={joined} onJoined={setJoined} onEnter={() => setJoined(null)} /></FlowChrome>;
  }

  if (!baby) return <FlowChrome><BabyMissing /></FlowChrome>;

  return <TabTree />;
}

export default function RootLayout() {
  const [loaded] = useFonts({ Nunito_400Regular, Nunito_600SemiBold, Nunito_700Bold, Nunito_800ExtraBold, Nunito_900Black, ZCOOLKuaiLe_400Regular });
  if (!loaded) return null;
  return (
    <SafeAreaProvider>
      <AppStateProvider>
        <Shell />
      </AppStateProvider>
    </SafeAreaProvider>
  );
}

const st = StyleSheet.create({
  demo: { paddingTop: 52, paddingBottom: 10, paddingHorizontal: 14, borderBottomWidth: 3, flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  demoT: { flex: 1, minWidth: 150, fontWeight: '900', fontSize: 12.5 },
  demoBtn: { borderWidth: 2.5, borderRadius: 99, paddingVertical: 5, paddingHorizontal: 11, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 1, shadowRadius: 0, elevation: 2 },
  demoBtnT: { fontWeight: '900', fontSize: 12 },
});
