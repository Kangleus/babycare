import { useEffect } from 'react';
import { View } from 'react-native';
import { TabList, TabSlot, Tabs, TabTrigger } from 'expo-router/ui';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useFonts, Nunito_400Regular, Nunito_600SemiBold, Nunito_700Bold, Nunito_800ExtraBold, Nunito_900Black } from '@expo-google-fonts/nunito';
import { ZCOOLKuaiLe_400Regular } from '@expo-google-fonts/zcool-kuaile';
import { AppStateProvider, useApp } from '@/state/app-state';
import { TabBar } from '@/components/tabbar';
import { Cele, NightStars, NightTint, StatusBarMock, Toast, TopFade } from '@/components/chrome';
import { SamplesPop } from '@/components/sample';
import { RecordSheet } from '@/components/record-sheet';
import { TrendSheet } from '@/components/trend';
import { Onboarding } from '@/components/onboarding';
import { usePathname } from 'expo-router';
import { injectMascotCss } from '@/lib/mascot-css';
import { RingBanner, RingWatcher } from '@/components/health/ring';

injectMascotCss();

SplashScreen.preventAutoHideAsync();

function Shell() {
  const { p, night, ready, settings } = useApp();
  const path = usePathname();
  useEffect(() => { if (ready) SplashScreen.hideAsync(); }, [ready]);
  if (!ready) return <View style={{ flex: 1, backgroundColor: p.bg }} />;
  if (!settings.onboarded) {
    return (
      <View style={{ flex: 1, backgroundColor: p.bg }}>
        <StatusBar style={night ? 'light' : 'dark'} />
        <Onboarding />
        <StatusBarMock />
        <Toast />
      </View>
    );
  }
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
        <Cele />
        <NightTint />
        <Toast />
      </Tabs>
    </View>
  );
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
