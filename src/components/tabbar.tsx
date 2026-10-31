/* 底部 Tab：今天 · 健康 · 团团(按住说话) · 问团子 · 我的 —— 原型 .tabbar/.tab/.mic */
import { useEffect, useMemo, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, View } from 'react-native';
import { TabTrigger, TabTriggerSlotProps } from 'expo-router/ui';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon, Tuan } from '@/lib/svg';
import type { IconName } from '@/lib/art';
import { useApp } from '@/state/app-state';
import { LVACC } from '@/data/mock';
import { hard } from '@/theme/tokens';
import { IS_WEB } from './chrome';
import { Txt } from './txt';

function TabBtn({ isFocused, label, icon, ...rest }: TabTriggerSlotProps & { label: string; icon: IconName }) {
  const { ref: _ref, ...props } = rest as typeof rest & { ref?: unknown };
  const { p } = useApp();
  const col = isFocused ? p.ink : p.sub;
  return (
    <Pressable {...props} style={s.tab}>
      <View style={[s.ti2, isFocused && { backgroundColor: p.yellow, transform: [{ translateY: -2 }] }]}><Icon name={icon} size={22} color={col} /></View>
      <Txt f="b8" size={11} color={col}>{label}</Txt>
    </Pressable>
  );
}

function Mic() {
  const { p, night, lvl, showToast } = useApp();
  const [spin] = useState(() => new Animated.Value(0));
  useEffect(() => {
    const a = Animated.loop(Animated.timing(spin, { toValue: 1, duration: 14000, easing: Easing.linear, useNativeDriver: !IS_WEB }));
    a.start(); return () => a.stop();
  }, [spin]);
  const rot = useMemo(() => spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }), [spin]);
  return (
    <View style={s.micCell}>
      <Pressable
        accessibilityLabel="按住说话"
        onLongPress={() => showToast('语音记录在 M3 接入，先用卡片「+」记一笔')}
        onPress={() => showToast('要按住团子说话哦～')}
        style={({ pressed }) => [s.mic, { backgroundColor: p.yellow, borderColor: p.ink }, pressed ? { transform: [{ translateY: 5 }, { scale: 0.94 }] } : hard(p, 5)]}>
        <Animated.View pointerEvents="none" style={[s.ring, { borderColor: p.pink, transform: [{ rotate: rot }] }]} />
        <View style={{ marginTop: 6 }} pointerEvents="none"><Tuan mood={night ? 'drowsy' : 'idle'} acc={night ? ['cap'] : LVACC[lvl]} size={78} /></View>
        <View style={s.lbl} pointerEvents="none"><Txt f="b9" size={10.5}>按住说话</Txt></View>
      </Pressable>
    </View>
  );
}

export function TabBar() {
  const { p } = useApp(); const i = useSafeAreaInsets();
  const pb = Math.max(22, i.bottom);
  return (
    <View style={[s.bar, { height: 74 + pb, paddingBottom: pb, backgroundColor: p.card, borderColor: p.ink }]}>
      <TabTrigger name="home" href="/" asChild><TabBtn label="今天" icon="home" /></TabTrigger>
      <TabTrigger name="health" href="/health" asChild><TabBtn label="健康" icon="hplus" /></TabTrigger>
      <Mic />
      <TabTrigger name="ai" href="/ai" asChild><TabBtn label="问团子" icon="chat" /></TabTrigger>
      <TabTrigger name="me" href="/me" asChild><TabBtn label="我的" icon="user" /></TabTrigger>
    </View>
  );
}

const s = StyleSheet.create({
  bar: { position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 70, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', borderTopWidth: 2.5, borderTopLeftRadius: 30, borderTopRightRadius: 30 },
  tab: { flex: 1, alignItems: 'center', gap: 3, paddingTop: 8 },
  ti2: { width: 44, height: 30, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  micCell: { width: 96, alignItems: 'center' },
  mic: { marginTop: -40, width: 88, height: 88, borderRadius: 44, borderWidth: 3, alignItems: 'center', justifyContent: 'center' },
  ring: { position: 'absolute', top: -9, left: -9, right: -9, bottom: -9, borderRadius: 50, borderWidth: 3, borderStyle: 'dashed', opacity: 0.8 },
  lbl: { position: 'absolute', bottom: -21, left: -30, right: -30, alignItems: 'center' },
});
