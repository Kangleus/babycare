/* 手机外框元素：状态栏（仅 Web 演示）、顶部渐隐、Toast */
import { useEffect, useState } from 'react';
import { Animated, Easing, Platform, StyleSheet, View } from 'react-native';
import { useReduceMotion } from '@/lib/mascot';
import Svg, { Circle, Defs, LinearGradient, RadialGradient, Rect, Stop, SvgXml } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '@/state/app-state';
import { Txt } from './txt';
import { Tuan } from '@/lib/svg';
import { useLvAcc } from '@/state/hooks';
import { hhmm } from '@/lib/time';

/* 原型 init() 里 #sbIcons 的信号 + 电池 */
const SIGNAL = `<svg width="18" height="12" viewBox="0 0 18 12"><rect x="0" y="8" width="3" height="4" rx="1" fill="currentColor"/><rect x="5" y="5.5" width="3" height="6.5" rx="1" fill="currentColor"/><rect x="10" y="3" width="3" height="9" rx="1" fill="currentColor"/><rect x="15" y="0" width="3" height="12" rx="1" fill="currentColor"/></svg>`;
const BATTERY = `<svg width="26" height="13" viewBox="0 0 26 13"><rect x=".8" y=".8" width="21" height="11.4" rx="3.5" fill="none" stroke="currentColor" stroke-width="1.5" opacity=".5"/><rect x="2.6" y="2.6" width="15" height="7.8" rx="2" fill="currentColor"/><rect x="23" y="4.3" width="2" height="4.4" rx="1" fill="currentColor" opacity=".5"/></svg>`;

export const IS_WEB = Platform.OS === 'web';
/* 页面顶部留白：原型 .page padding-top 76（含 50px 状态栏）。真机用安全区 + 26 */
export function useTopPad() { const i = useSafeAreaInsets(); return IS_WEB ? 76 : i.top + 26; }

export function StatusBarMock() {
  const { p, now } = useApp();
  if (!IS_WEB) return null;
  return (
    <View pointerEvents="none" style={s.status}>
      <Txt f="b8" size={15}>{hhmm(now)}</Txt>
      <View style={s.r}><SvgXml xml={SIGNAL} width={18} height={12} color={p.ink} /><SvgXml xml={BATTERY} width={26} height={13} color={p.ink} /></View>
    </View>
  );
}

/* .topfade：linear-gradient(to bottom, var(--bg) 72%, transparent) 高 62 */
export function TopFade() {
  const { p } = useApp(); const i = useSafeAreaInsets();
  const h = IS_WEB ? 62 : i.top + 12;
  return (
    <View pointerEvents="none" style={[s.fade, { height: h }]}>
      <Svg width="100%" height={h}>
        <Defs><LinearGradient id="tf" x1="0" y1="0" x2="0" y2="1"><Stop offset="0.72" stopColor={p.bg} stopOpacity={1} /><Stop offset="1" stopColor={p.bg} stopOpacity={0} /></LinearGradient></Defs>
        <Rect x="0" y="0" width="100%" height={h} fill="url(#tf)" />
      </Svg>
    </View>
  );
}

export function Toast() {
  const { p, toast } = useApp();
  if (!toast) return null;
  return (
    <View pointerEvents="none" style={s.toastWrap} testID="toast">
      <View style={[s.toast, { backgroundColor: p.ink }]}><Txt f="b8" size={13} color={p.bg}>{toast}</Txt></View>
    </View>
  );
}

/* 记好后的庆祝 —— 原型 .cele（veil + halo + say 气泡 + 团团点头）和 .xp-fly「+1 成长值」 */
export function Cele() {
  const { p, cele } = useApp(); const acc = useLvAcc();
  if (!cele) return null;
  return (
    <View pointerEvents="none" style={s.cele} testID="cele">
      <View style={[s.veil, { backgroundColor: p.bg }]} />
      <View style={s.wrap}>
        <Svg width={250} height={250} style={s.halo}>
          <Defs><RadialGradient id="halo" cx="50%" cy="50%" r="50%"><Stop offset="0" stopColor="#FFD45C" stopOpacity={0.75} /><Stop offset="0.65" stopColor="#FFD45C" stopOpacity={0} /></RadialGradient></Defs>
          <Circle cx={125} cy={125} r={125} fill="url(#halo)" />
        </Svg>
        <View style={s.sayRow}>
          <View style={[s.say, { backgroundColor: p.card, borderColor: p.ink }, { boxShadow: `0px 4px 0px ${p.shadow}` }]}>
            <Txt f="h" size={22}>{cele.say}</Txt>{cele.extra ? <Txt f="b9" size={18}>{cele.extra}</Txt> : null}
            <View style={[s.tail, { backgroundColor: p.card, borderColor: p.ink }]} />
          </View>
        </View>
        <View style={s.tuan}><Tuan mood={cele.calm ? 'idle' : 'happy'} acc={acc} size={160} /></View>
      </View>
      <View style={s.xpRow}><View style={[s.xp, { backgroundColor: p.green, borderColor: p.ink }, { boxShadow: `0px 3px 0px ${p.shadow}` }]}><Txt f="b9" size={15}>+1 成长值</Txt></View></View>
    </View>
  );
}

const s = StyleSheet.create({
  cele: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 120 },
  veil: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, opacity: 0.72 },
  wrap: { position: 'absolute', left: '50%', top: '44%', width: 220, height: 240, marginLeft: -110, marginTop: -120 },
  halo: { position: 'absolute', left: -15, top: 9 },
  sayRow: { position: 'absolute', left: -60, right: -60, top: 0, alignItems: 'center' },
  say: { flexDirection: 'row', gap: 6, alignItems: 'center', borderWidth: 3, borderRadius: 22, paddingVertical: 8, paddingHorizontal: 16 },
  tail: { position: 'absolute', left: '50%', bottom: -11, width: 16, height: 16, marginLeft: -8, borderRightWidth: 3, borderBottomWidth: 3, borderBottomRightRadius: 4, transform: [{ rotate: '45deg' }] },
  tuan: { position: 'absolute', left: 30, top: 50, width: 160, height: 160 },
  xpRow: { position: 'absolute', left: 0, right: 0, top: '62%', alignItems: 'center' },
  xp: { borderWidth: 2.5, borderRadius: 99, paddingVertical: 3, paddingHorizontal: 10 },
  status: { position: 'absolute', top: 0, left: 0, right: 0, height: 50, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 6, paddingRight: 30, paddingLeft: 34, zIndex: 150 },
  r: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  fade: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 90 },
  toastWrap: { position: 'absolute', top: 92, left: 0, right: 0, alignItems: 'center', zIndex: 160 },
  toast: { paddingVertical: 9, paddingHorizontal: 16, borderRadius: 99 },
});

/* 夜间星星 —— 原型 .night-stars（473-476）+ app4 初始化：22 颗 4px 金色圆点，
   left:(i*37)%100%  top:(i*53)%45+3%  scale(.6+(i%3)*.3)  tw 3s ease-in-out alternate .2↔.9，delay (i%5)*.6s；
   容器 opacity 0→1 transition .6s。固定在屏幕上、在页面内容之下。 */
const STARS = Array.from({ length: 22 }, (_, i) => ({ left: `${(i * 37) % 100}%` as const, top: `${((i * 53) % 45) + 3}%` as const, g: i % 5, s: 0.6 + (i % 3) * 0.3 }));
const EASE_IO = Easing.bezier(0.42, 0, 0.58, 1);
export function NightStars() {
  const { night } = useApp();
  const still = useReduceMotion();
  const [fade] = useState(() => new Animated.Value(night ? 1 : 0));
  const [tw] = useState(() => Array.from({ length: 5 }, () => new Animated.Value(0.2)));
  const [shown, setShown] = useState(night);
  if (night && !shown) setShown(true);
  useEffect(() => {
    Animated.timing(fade, { toValue: night ? 1 : 0, duration: 600, easing: Easing.bezier(0.25, 0.1, 0.25, 1), useNativeDriver: true }).start(({ finished }) => { if (finished && !night) setShown(false); });
  }, [night, fade]);
  useEffect(() => {
    if (!shown) return;
    if (still) { tw.forEach(v => v.setValue(0.55)); return; }
    /* tw 3s ease-in-out infinite alternate：.2 → .9 往返，各组延迟 (i%5)*.6s */
    const loops = tw.map((v, g) => {
      v.setValue(0.2);
      const t = (to: number) => Animated.timing(v, { toValue: to, duration: 3000, easing: EASE_IO, useNativeDriver: true, isInteraction: false });
      const a = Animated.sequence([Animated.delay(g * 600), Animated.loop(Animated.sequence([t(0.9), t(0.2)]))]);
      a.start(); return a;
    });
    return () => loops.forEach(a => a.stop());
  }, [shown, still, tw]);
  if (!shown) return null;
  return (
    <Animated.View pointerEvents="none" testID="night-stars" style={[StyleSheet.absoluteFill, { opacity: fade, zIndex: 0 }]}>
      {STARS.map((st, i) => (
        <Animated.View key={i} style={{ position: 'absolute', left: st.left, top: st.top, width: 4, height: 4, borderRadius: 2, backgroundColor: '#E9B949', opacity: tw[st.g], transform: [{ scale: st.s }] }} />
      ))}
    </Animated.View>
  );
}
/* 原型 477：body.night .screen:after{background:rgba(20,10,0,.08);z-index:199} */
export function NightTint() {
  const { night } = useApp();
  return night ? <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(20,10,0,.08)', zIndex: 199 }]} /> : null;
}
