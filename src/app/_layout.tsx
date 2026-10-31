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
import { StatusBarMock, Toast, TopFade } from '@/components/chrome';
import { SamplePill } from '@/components/sample';
import { usePathname } from 'expo-router';
import { injectMascotCss } from '@/lib/mascot-css';

injectMascotCss();

SplashScreen.preventAutoHideAsync();

function Shell() {
  const { p, night } = useApp();
  const path = usePathname();
  return (
    <View style={{ flex: 1, backgroundColor: p.bg }}>
      <StatusBar style={night ? 'light' : 'dark'} />
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
        {path === '/' ? <SamplePill /> : null}
        <TabBar />
        <Toast />
      </Tabs>
    </View>
  );
}

export default function RootLayout() {
  const [loaded] = useFonts({ Nunito_400Regular, Nunito_600SemiBold, Nunito_700Bold, Nunito_800ExtraBold, Nunito_900Black, ZCOOLKuaiLe_400Regular });
  useEffect(() => { if (loaded) SplashScreen.hideAsync(); }, [loaded]);
  if (!loaded) return null;
  return (
    <SafeAreaProvider>
      <AppStateProvider>
        <Shell />
      </AppStateProvider>
    </SafeAreaProvider>
  );
}
