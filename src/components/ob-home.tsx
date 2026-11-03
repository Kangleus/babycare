/* 首次使用流程 · 第 5 步：新家庭的空首页 —— 原型 renderHomeFresh() / guide() / firstSheet() / invite()
   规则：记录不满 3 天时不显示预测（换成「记满 3 天」卡）；0 条记录时时间线是空状态 + 团团引导指向麦克风；
   「邀请家人」提示卡在只有自己一人、还没满 3 天时出现，可以关掉。 */
import { useEffect, useMemo, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import { usePathname } from 'expo-router';
import { useApp } from '@/state/app-state';
import { useLvAcc } from '@/state/hooks';
import { Icon, Tuan } from '@/lib/svg';
import type { IconName } from '@/lib/art';
import { hard } from '@/theme/tokens';
import { IS_WEB } from './chrome';
import { InviteBody } from './cloud-ui';
import { HCard } from './health/hui';
import { Actions, Btn, Heard, Sheet } from './ui';
import { numStyle, Txt } from './txt';

const ymd = (iso: string) => { const d = new Date(iso); return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`; };

/** 新家庭状态：记录覆盖的天数（<3 天不预测）、团团引导、邀请提示卡 */
export function useFresh() {
  const { records, settings, members, demo } = useApp();
  return useMemo(() => {
    const days = new Set(records.map(r => ymd(r.time))).size;
    return {
      days,
      fresh: !demo && days < 3,
      empty: !demo && records.length === 0,
      guide: !demo && records.length === 0 && !settings.guideDone,
      nudge: !demo && days < 3 && members.length < 2 && !settings.nudgeGone,
    };
  }, [records, settings.guideDone, settings.nudgeGone, members.length, demo]);
}

/** .pred.ob-pred：记满 3 天前的预测卡 */
export function FreshPred() {
  const { p, night, baby, events } = useApp();
  const { days } = useFresh();
  const c = night ? '#2a1f16' : p.ink, chipBg = night ? { backgroundColor: 'rgba(0,0,0,.18)' } : null;
  return (
    <View testID="pred-fresh" style={[s.pred, { backgroundColor: p.yellow, borderColor: p.ink }, hard(p, 5)]}>
      <View style={s.predCircle} />
      <View style={[s.lab, chipBg]}><Icon name="clock" size={14} color={c} /><Txt f="b8" size={11.5} color={c}>下一顿预测</Txt></View>
      <Txt f="h" size={27} color={c} style={s.big}>记满 <Text style={numStyle(34)}>3</Text> 天{'\n'}团团就会算</Txt>
      <Txt f="b8" size={13} color={c} style={{ opacity: 0.85 }}>{events.length || days ? '今天开了个好头，明天接着记' : '先记几次喂奶和睡觉吧'}</Txt>
      <View style={s.dots} testID="pred-fresh-dots">
        {[0, 1, 2].map(i => <View key={i} style={[s.dot, { borderColor: p.ink, backgroundColor: i < days ? p.green : night ? 'rgba(0,0,0,.18)' : 'rgba(255,255,255,.7)' }]} />)}
        <Txt f="b9" size={11.5} color={c}>{Math.min(days, 3)}/3 天</Txt>
      </View>
      <Txt f="b7" size={11} color={c} style={s.basis}>依据：{baby?.name}自己的喂奶间隔 · 仅供参考，按需喂养优先</Txt>
      <View style={s.mascot} pointerEvents="none"><Tuan mood={night ? 'drowsy' : 'idle'} acc={night ? ['clock', 'cap'] : ['clock']} size={122} /></View>
    </View>
  );
}

/** .growcard.ob-nudge */
export function InviteNudge() {
  const { p, openInvite, saveFlags, showToast } = useApp();
  return (
    <View testID="nudge" style={[s.nudge, { backgroundColor: p.pinkS, borderColor: p.ink }, hard(p, 4)]}>
      <View style={[s.nIc, { backgroundColor: p.pink, borderColor: p.ink }]}><Icon name="family" size={26} /></View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Txt f="h" size={18} style={{ lineHeight: 19.8 }}>邀请家人一起记</Txt>
        <Txt f="b8" size={11.5} color={p.sub} style={{ marginTop: 2 }}>爸爸、奶奶也能记，记录自动同步</Txt>
      </View>
      <Pressable testID="nudge-go" onPress={openInvite} style={({ pressed }) => [s.go2, { backgroundColor: p.card, borderColor: p.ink }, pressed ? { transform: [{ translateY: 2 }] } : hard(p, 2)]}>
        <Txt f="b9" size={12}>去邀请</Txt>
      </Pressable>
      <Pressable testID="nudge-x" accessibilityLabel="不再提示" hitSlop={8} onPress={() => { saveFlags({ nudgeGone: true }); showToast('好的，之后可以在「我的 › 邀请家人」里邀请'); }} style={s.nX}>
        <Icon name="x" size={12} color={p.sub} />
      </Pressable>
    </View>
  );
}

/** .ob-empty：时间线还没有记录 */
export function EmptyTimeline() {
  const { p } = useApp();
  return (
    <View testID="tl-empty" style={[s.empty, { backgroundColor: p.bg2, borderColor: p.line }]}>
      <View style={{ width: 66, height: 66 }}><Tuan mood="sleep" acc={['cap']} size={66} /></View>
      <View style={{ flex: 1 }}>
        <Txt f="b9" size={14.5} style={{ marginBottom: 1, lineHeight: 18 }}>还没有记录哦</Txt>
        <Txt f="b8" size={12} color={p.sub} style={{ lineHeight: 18 }}>按住下面的团团说一句话，{'\n'}或者点卡片上的「+」手动记一笔</Txt>
      </View>
    </View>
  );
}

/** #obGuide：空首页指向麦克风的气泡（只在「今天」页） */
export function CoachMark() {
  const { p, night, saveFlags } = useApp();
  const { guide } = useFresh();
  const path = usePathname();
  const [fl] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (!guide) return;
    const a = Animated.loop(Animated.sequence([
      Animated.timing(fl, { toValue: 1, duration: 1200, easing: Easing.inOut(Easing.ease), useNativeDriver: !IS_WEB }),
      Animated.timing(fl, { toValue: 0, duration: 1200, easing: Easing.inOut(Easing.ease), useNativeDriver: !IS_WEB }),
    ]));
    const t = setTimeout(() => a.start(), 600);
    return () => { clearTimeout(t); a.stop(); };
  }, [guide, fl]);
  if (!guide || path !== '/') return null;
  const ty = fl.interpolate({ inputRange: [0, 1], outputRange: [0, -5] });
  const hi = night ? p.pink : '#E5738A';
  return (
    <View pointerEvents="box-none" style={s.guideWrap}>
      <Animated.View testID="coach" style={[s.guide, { backgroundColor: p.card, borderColor: p.ink, transform: [{ translateY: ty }] }, hard(p, 4)]}>
        <Txt f="h" size={18} style={{ lineHeight: 22.5, textAlign: 'center' }}>按住我，说一句{'\n'}<Text style={{ color: hi }}>“刚喝了 120 毫升奶”</Text>试试</Txt>
        <Txt f="b8" size={11} color={p.sub} style={{ marginTop: 3, textAlign: 'center' }}>
          按住底部的团团 · <Text testID="coach-skip" onPress={() => saveFlags({ guideDone: true })} style={{ textDecorationLine: 'underline', ...(IS_WEB ? { cursor: 'pointer' } : null) } as object}>我先自己看看</Text>
        </Txt>
        <View style={[s.tail, { backgroundColor: p.card, borderColor: p.ink }]} />
      </Animated.View>
    </View>
  );
}

/** 引导打开时麦克风外面的粉色波纹（原型 body.ob-guide .mic:after） */
export function MicRipple() {
  const { p } = useApp();
  const { guide } = useFresh();
  const path = usePathname();
  const [v] = useState(() => new Animated.Value(0));
  const on = guide && path === '/';
  useEffect(() => {
    if (!on) return;
    const a = Animated.loop(Animated.timing(v, { toValue: 1, duration: 1800, easing: Easing.out(Easing.ease), useNativeDriver: !IS_WEB }));
    a.start(); return () => a.stop();
  }, [on, v]);
  if (!on) return null;
  return <Animated.View pointerEvents="none" testID="mic-ripple" style={[s.ripple, { borderColor: p.pink, opacity: v.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }), transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.55, 1.35] }) }] }]} />;
}

function FRow({ icon, done, t, sub, first }: { icon: IconName; done?: boolean; t: string; sub: string; first?: boolean }) {
  const { p } = useApp();
  return (
    <View style={[s.vx, !first && { borderTopWidth: 2, borderStyle: 'dashed', borderTopColor: p.line }]}>
      <View style={[s.vc, { borderColor: p.ink, backgroundColor: done ? p.green : p.bg2 }]}><Icon name={icon} size={14} /></View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Txt f="b9" size={13.5}>{t}</Txt>
        <Txt f="b7" size={11.5} color={p.sub} style={{ marginTop: 2, lineHeight: 16.7 }}>{sub}</Txt>
      </View>
    </View>
  );
}

/** 5a：第一条记录后的 sheet */
export function FirstSheet() {
  const { firstOpen, closeFirst, openInvite, baby } = useApp();
  const acc = useLvAcc();
  return (
    <Sheet open={firstOpen} onClose={closeFirst} testID="first-sheet">
      <Heard mood="happy" acc={acc} t="第一条记录完成！" sub={`${baby?.name ?? '宝宝'}的成长日记开始啦`} />
      <HCard style={{ marginTop: 14 }}>
        <FRow first done icon="check" t="说一句话就能记" sub="以后每次喂奶、睡觉、换尿布，按住团团说一句" />
        <FRow icon="clock" t="记满 3 天 · 解锁作息预测" sub="团团会算出下一顿、下次小睡大概几点" />
        <FRow icon="family" t="邀请家人 · 一起记" sub="爸爸、奶奶记的也会出现在时间线里" />
      </HCard>
      <Actions>
        <Btn label="继续记" onPress={closeFirst} testID="first-more" />
        <Btn label="邀请家人" icon="family" kind="pri" onPress={openInvite} testID="first-invite" />
      </Actions>
    </Sheet>
  );
}

/** 全局「邀请家人」sheet（首页提示卡 / 5a / 我的 都从这里开） */
export function InviteSheet() {
  const { inviteOpen, closeInvite } = useApp();
  return (
    <Sheet open={inviteOpen} onClose={closeInvite} testID="invite-sheet">
      {inviteOpen ? <InviteBody onClose={closeInvite} /> : null}
    </Sheet>
  );
}


const s = StyleSheet.create({
  pred: { position: 'relative', marginTop: 10, borderWidth: 3, borderRadius: 28, paddingTop: 12, paddingRight: 14, paddingBottom: 11, paddingLeft: 16, overflow: 'hidden' },
  predCircle: { position: 'absolute', right: -30, top: -40, width: 170, height: 170, borderRadius: 85, backgroundColor: 'rgba(255,255,255,.35)' },
  lab: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(255,255,255,.65)', borderRadius: 99, paddingVertical: 3, paddingHorizontal: 9 },
  big: { marginTop: 7.5, marginBottom: 1, lineHeight: 39.1 },
  dots: { flexDirection: 'row', gap: 6, alignItems: 'center', marginTop: 9 },
  dot: { width: 26, height: 10, borderRadius: 9, borderWidth: 2 },
  basis: { marginTop: 6, opacity: 0.75, maxWidth: '60%' },
  mascot: { position: 'absolute', right: 2, bottom: -4, width: 122, height: 122 },
  nudge: { flexDirection: 'row', gap: 12, alignItems: 'center', borderWidth: 2.5, borderRadius: 26, paddingVertical: 12, paddingHorizontal: 14, marginTop: 16 },
  nIc: { width: 46, height: 46, borderRadius: 16, borderWidth: 2.5, alignItems: 'center', justifyContent: 'center' },
  go2: { borderWidth: 2, borderRadius: 99, paddingVertical: 4, paddingHorizontal: 11, marginRight: 18 },
  nX: { position: 'absolute', right: 8, top: 8, width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  empty: { flexDirection: 'row', gap: 10, alignItems: 'center', borderWidth: 2.5, borderStyle: 'dashed', borderRadius: 22, paddingVertical: 10, paddingHorizontal: 12 },
  guideWrap: { position: 'absolute', left: 0, right: 0, bottom: 150, zIndex: 75, alignItems: 'center' },
  guide: { maxWidth: 330, borderWidth: 3, borderRadius: 22, paddingTop: 10, paddingHorizontal: 16, paddingBottom: 9 },
  tail: { position: 'absolute', left: '50%', bottom: -11, width: 16, height: 16, marginLeft: -8, borderRightWidth: 3, borderBottomWidth: 3, borderBottomRightRadius: 4, transform: [{ rotate: '45deg' }] },
  ripple: { position: 'absolute', top: -12, left: -12, right: -12, bottom: -12, borderRadius: 60, borderWidth: 3 },
  vx: { flexDirection: 'row', gap: 10, alignItems: 'center', paddingVertical: 8 },
  vc: { width: 28, height: 28, borderRadius: 14, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
});
