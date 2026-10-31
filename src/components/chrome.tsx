/* 手机外框元素：状态栏（仅 Web 演示）、顶部渐隐、Toast */
import { Platform, StyleSheet, View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop, SvgXml } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '@/state/app-state';
import { Txt } from './txt';

/* 原型 init() 里 #sbIcons 的信号 + 电池 */
const SIGNAL = `<svg width="18" height="12" viewBox="0 0 18 12"><rect x="0" y="8" width="3" height="4" rx="1" fill="currentColor"/><rect x="5" y="5.5" width="3" height="6.5" rx="1" fill="currentColor"/><rect x="10" y="3" width="3" height="9" rx="1" fill="currentColor"/><rect x="15" y="0" width="3" height="12" rx="1" fill="currentColor"/></svg>`;
const BATTERY = `<svg width="26" height="13" viewBox="0 0 26 13"><rect x=".8" y=".8" width="21" height="11.4" rx="3.5" fill="none" stroke="currentColor" stroke-width="1.5" opacity=".5"/><rect x="2.6" y="2.6" width="15" height="7.8" rx="2" fill="currentColor"/><rect x="23" y="4.3" width="2" height="4.4" rx="1" fill="currentColor" opacity=".5"/></svg>`;

export const IS_WEB = Platform.OS === 'web';
/* 页面顶部留白：原型 .page padding-top 76（含 50px 状态栏）。真机用安全区 + 26 */
export function useTopPad() { const i = useSafeAreaInsets(); return IS_WEB ? 76 : i.top + 26; }

export function StatusBarMock() {
  const { p } = useApp();
  if (!IS_WEB) return null;
  return (
    <View pointerEvents="none" style={s.status}>
      <Txt f="b8" size={15}>10:20</Txt>
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
    <View pointerEvents="none" style={s.toastWrap}>
      <View style={[s.toast, { backgroundColor: p.ink }]}><Txt f="b8" size={13} color={p.bg}>{toast}</Txt></View>
    </View>
  );
}

const s = StyleSheet.create({
  status: { position: 'absolute', top: 0, left: 0, right: 0, height: 50, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 6, paddingRight: 30, paddingLeft: 34, zIndex: 150 },
  r: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  fade: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 90 },
  toastWrap: { position: 'absolute', top: 92, left: 0, right: 0, alignItems: 'center', zIndex: 160 },
  toast: { paddingVertical: 9, paddingHorizontal: 16, borderRadius: 99 },
});
