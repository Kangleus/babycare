import { useEffect, useState } from 'react';
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
import { OnboardingFlow, FirstBabyStep } from '@/components/onboarding';
import { FamilySetupPage, JoinPage } from '@/components/cloud-ui';
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
        <RingWatcher />
        <RingBanner />
        <RecordSheet />
        <TrendSheet />
        <SummarySheet />
        <VoiceLayer />
        <Cele />
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

function Shell() {
  const { ready, demo, baby } = useApp();
  const c = useCloud();
  const [join, setJoin] = useState(false);
  useEffect(() => { if (ready) SplashScreen.hideAsync(); }, [ready]);

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

  /* 没登录：欢迎 → 注册 / 登录 → 验证 / 忘记密码 → 设置新密码 */
  if (!c.userId) {
    return (
      <View style={{ flex: 1 }}>
        <OnboardingFlow />
        <StatusBarMock />
        <NightTint />
        <Toast />
      </View>
    );
  }

  /* 登录了但还没加入家庭 */
  if (!c.link) {
    if (c.status !== 'noFamily') return <Linking />;
    return join
      ? <JoinPage onClose={() => setJoin(false)} />
      : <FamilySetupPage carryLocal={false} onClose={() => { void cloud.signOut(); }} onJoin={() => setJoin(true)} />;
  }

  /* 有家庭但还没有宝宝资料 */
  if (!baby) return <FirstBabyStep onJoin={() => setJoin(true)} />;

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
