/* 团团动画（原生 iOS / Android）——把原型 CSS 的 mascot animation 段 1:1 换成 RN Animated（原生驱动）。
   做法：把 tuan() 的 SVG 字符串按绘制顺序切成若干层（静态层 + 动画元素层），每层是同 viewBox 的 SvgXml，
   动画层包在 Animated.View 里，用 transformOrigin 复刻 CSS 的 transform-origin / transform-box:fill-box。
   Web 端仍走原 CSS（src/lib/mascot-css.ts），像素与原型一致。 */
import { memo, useEffect, useMemo, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, StyleSheet, View } from 'react-native';
import { SvgXml } from 'react-native-svg';

/* ---------- 共享时钟：全 App 的团团共用 6 条循环，开销与团团数量无关 ---------- */
const EASE = Easing.bezier(0.25, 0.1, 0.25, 1); /* CSS ease */
const EASE_IO = Easing.bezier(0.42, 0, 0.58, 1); /* CSS ease-in-out */
type Clock = { v: Animated.Value; dur: number; alt: boolean; loop?: Animated.CompositeAnimation };
export const CLOCKS = {
  breath: { v: new Animated.Value(0), dur: 2600, alt: true } as Clock,
  blink: { v: new Animated.Value(0), dur: 4200, alt: false } as Clock,
  ring: { v: new Animated.Value(0), dur: 1600, alt: false } as Clock,
  bubble: { v: new Animated.Value(0), dur: 2400, alt: false } as Clock,
  zz: { v: new Animated.Value(0), dur: 2600, alt: false } as Clock,
  sway: { v: new Animated.Value(0), dur: 3000, alt: true } as Clock,
};
type ClockName = keyof typeof CLOCKS;
let running = false, frozen = false;
function startAll() {
  if (running || frozen) return; running = true;
  for (const c of Object.values(CLOCKS)) {
    c.v.setValue(0);
    const lin = { easing: Easing.linear, useNativeDriver: true, isInteraction: false };
    c.loop = Animated.loop(c.alt
      ? Animated.sequence([Animated.timing(c.v, { toValue: 1, duration: c.dur, ...lin }), Animated.timing(c.v, { toValue: 0, duration: c.dur, ...lin })])
      : Animated.timing(c.v, { toValue: 1, duration: c.dur, ...lin }));
    c.loop.start();
  }
}
function stopAll() {
  running = false;
  for (const c of Object.values(CLOCKS)) { c.loop?.stop(); c.v.setValue(0); }
}
/** 测试 / 截图用：停住所有循环，把某条时钟定在进度 t（0–1） */
export function setMascotClock(name: ClockName, t: number) { frozen = true; stopAll(); CLOCKS[name].v.setValue(t); }

if (typeof window !== 'undefined') (window as unknown as { __yjMascot?: typeof setMascotClock }).__yjMascot = setMascotClock;

/* ---------- 减少动态效果 ---------- */
let reduce = false; const subs = new Set<(r: boolean) => void>();
AccessibilityInfo.isReduceMotionEnabled?.().then(r => { reduce = !!r; subs.forEach(f => f(reduce)); }).catch(() => {});
AccessibilityInfo.addEventListener?.('reduceMotionChanged', r => { reduce = !!r; subs.forEach(f => f(reduce)); });
export function useReduceMotion() {
  const [r, setR] = useState(reduce);
  useEffect(() => { subs.add(setR); return () => { subs.delete(setR); }; }, []);
  return r;
}

/* ---------- 关键帧（与原型 CSS 完全相同） ---------- */
const v = (n: ClockName) => CLOCKS[n].v;
/* .t-body  yj-breath 2.6s ease-in-out alternate：scale(1,1) → scale(1.025,.965)，origin 60px 108px */
const breathX = () => v('breath').interpolate({ inputRange: [0, 1], outputRange: [1, 1.025], easing: EASE_IO });
const breathY = () => v('breath').interpolate({ inputRange: [0, 1], outputRange: [1, 0.965], easing: EASE_IO });
/* .t-eye  yj-blink 4.2s (ease)：0,91,100% scaleY(1)；94% scaleY(.08) */
const blinkY = () => v('blink').interpolate({ inputRange: [0, 0.91, 0.94, 1], outputRange: [1, 1, 0.08, 1], easing: EASE });
/* .t-ring  yj-ring 1.6s ease-in-out */
const ringR = () => v('ring').interpolate({ inputRange: [0, 0.6, 0.65, 0.7, 0.75, 0.8, 0.85, 1], outputRange: ['0deg', '0deg', '-12deg', '12deg', '-10deg', '9deg', '-4deg', '0deg'], easing: EASE_IO });
/* .t-bubble yj-bubble 2.4s ease-in-out：scale .3 →(70%) 1 →(85%) 1.08 →(100%) 1.1；opacity 85%:1 → 100%:0 */
const bubbleS = () => v('bubble').interpolate({ inputRange: [0, 0.7, 0.85, 1], outputRange: [0.3, 1, 1.08, 1.1], easing: EASE_IO });
const bubbleO = () => v('bubble').interpolate({ inputRange: [0, 0.85, 1], outputRange: [1, 1, 0], easing: EASE_IO });
/* .t-z yj-zz 2.6s ease-in-out：opacity 0 →(30%) 1 →(100%) 0；translate (0,6) → (8,-14)；.b 延迟 1.3s = 相位 +0.5 */
const zPhase = (b: boolean): Animated.AnimatedInterpolation<number> => (b ? (Animated.modulo(Animated.add(v('zz'), 0.5), 1) as unknown as Animated.Value) : v('zz')).interpolate({ inputRange: [0, 1], outputRange: [0, 1] });
const zO = (b: boolean) => zPhase(b).interpolate({ inputRange: [0, 0.3, 1], outputRange: [0, 1, 0], easing: EASE_IO });
const zX = (b: boolean, k: number) => zPhase(b).interpolate({ inputRange: [0, 1], outputRange: [0, 8 * k], easing: EASE_IO });
const zY = (b: boolean, k: number) => zPhase(b).interpolate({ inputRange: [0, 1], outputRange: [6 * k, -14 * k], easing: EASE_IO });
/* .t-sprout yj-sway 3s ease-in-out alternate：rotate(-6deg) → rotate(6deg) */
const swayR = () => v('sway').interpolate({ inputRange: [0, 1], outputRange: ['-6deg', '6deg'], easing: EASE_IO });

const once = <T,>(f: () => T) => { let x: T | undefined; return () => (x ??= f()); };
const I = { breathX: once(breathX), breathY: once(breathY), blinkY: once(blinkY), ringR: once(ringR), bubbleS: once(bubbleS), bubbleO: once(bubbleO), swayR: once(swayR), zO: once(() => zO(false)), zOb: once(() => zO(true)) };

/* ---------- SVG 切层 ---------- */
type Kind = 'eye' | 'ring' | 'bubble' | 'z' | 'zb' | 'sprout';
type Layer = { xml: string; kind?: Kind; pivot?: [number, number] };
const VB = 'viewBox="-6 -8 132 132"';
/* fill-box 的 transform-origin，已在 Chrome 里用 getBBox() 量好（tools/mascot-pivots.py），单位 = SVG 用户坐标 */
const PIVOT: Record<'ring' | 'bubble' | 'sprout', [number, number]> = { ring: [93, 83.65], bubble: [64, 80], sprout: [60.5, 30.5] };
const ANIM = /class="(t-eye|t-ring|t-bubble|t-z(?: b)?|t-sprout)"/;

function parseLayers(svg: string): { shadow: string; layers: Layer[] } {
  const open = svg.indexOf('<g class="t-body">');
  const head = svg.slice(0, open), tail = svg.slice(open + '<g class="t-body">'.length, svg.lastIndexOf('</g></svg>'));
  const shadow = head.replace(/<svg[^>]*>/, `<svg ${VB}>`) + '</svg>';
  const tokens = tail.match(/<[^>]+>|[^<]+/g) || [];
  const layers: Layer[] = [];
  const stack: string[] = []; /* 当前打开的祖先标签（原样），切层时闭合再重开 */
  let cur = '';
  const wrap = (inner: string) => `<svg ${VB}>${inner}</svg>`;
  const close = () => stack.slice().reverse().map(t => `</${t.match(/^<(\w+)/)![1]}>`).join('');
  const flush = () => { if (/<(?!\/|g[ >])/.test(cur)) layers.push({ xml: wrap(cur + close()) }); cur = stack.join(''); };
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    const m = t.startsWith('<') && !t.startsWith('</') ? t.match(ANIM) : null;
    if (m) {
      /* 收集整个动画元素 */
      let el = t, depth = t.endsWith('/>') ? 0 : 1;
      while (depth > 0) { const n = tokens[++i]; el += n; if (n.startsWith('</')) depth--; else if (n.startsWith('<') && !n.endsWith('/>')) depth++; }
      flush();
      const c = m[1];
      const kind: Kind = c === 't-eye' ? 'eye' : c === 't-ring' ? 'ring' : c === 't-bubble' ? 'bubble' : c === 't-sprout' ? 'sprout' : c === 't-z b' ? 'zb' : 'z';
      let pivot: [number, number] | undefined;
      if (kind === 'eye') { const e = el.match(/cx="([\d.]+)" cy="([\d.]+)"/); pivot = e ? [+e[1], +e[2]] : [60, 66]; }
      else if (kind === 'ring' || kind === 'bubble' || kind === 'sprout') pivot = PIVOT[kind];
      layers.push({ xml: wrap(stack.join('') + el + close()), kind, pivot });
      cur = stack.join('');
      continue;
    }
    cur += t;
    if (t.startsWith('</')) stack.pop();
    else if (t.startsWith('<') && !t.endsWith('/>')) stack.push(t);
  }
  flush();
  return { shadow, layers };
}
const cache = new Map<string, ReturnType<typeof parseLayers>>();
export function layersOf(svg: string) { let r = cache.get(svg); if (!r) { r = parseLayers(svg); cache.set(svg, r); } return r; }

/* 用户坐标 → 视图像素 */
const px = (u: number, axis: 0 | 1, size: number) => (u - (axis ? -8 : -6)) * size / 132;

export const AnimatedTuan = memo(function AnimatedTuan({ xml, size }: { xml: string; size: number }) {
  const still = useReduceMotion();
  useEffect(() => { if (!still) startAll(); }, [still]);
  const { shadow, layers } = useMemo(() => layersOf(xml), [xml]);
  const k = size / 132;
  const origin = (p: [number, number]) => `${px(p[0], 0, size)}px ${px(p[1], 1, size)}px`;
  const layerStyle = (l: Layer) => {
    if (still || !l.kind) return null;
    switch (l.kind) {
      case 'eye': return { transformOrigin: origin(l.pivot!), transform: [{ scaleY: I.blinkY() }] };
      case 'ring': return { transformOrigin: origin(l.pivot!), transform: [{ rotate: I.ringR() }] };
      case 'bubble': return { transformOrigin: origin(l.pivot!), opacity: I.bubbleO(), transform: [{ scale: I.bubbleS() }] };
      case 'sprout': return { transformOrigin: origin(l.pivot!), transform: [{ rotate: I.swayR() }] };
      case 'z': case 'zb': { const b = l.kind === 'zb'; return { opacity: b ? I.zOb() : I.zO(), transform: [{ translateX: zX(b, k) }, { translateY: zY(b, k) }] }; }
    }
  };
  /* .t-z 默认 opacity:0（动画关掉时也不显示，与 CSS 一致） */
  const hidden = (l: Layer) => (still && (l.kind === 'z' || l.kind === 'zb') ? { opacity: 0 } : null);
  return (
    <View style={{ width: size, height: size }} pointerEvents="none">
      <SvgXml xml={shadow} width={size} height={size} style={StyleSheet.absoluteFill} />
      <Animated.View style={[StyleSheet.absoluteFill, !still && { transformOrigin: origin([60, 108]), transform: [{ scaleX: I.breathX() }, { scaleY: I.breathY() }] }]}>
        {layers.map((l, i) => (
          <Animated.View key={i} style={[StyleSheet.absoluteFill, layerStyle(l), hidden(l)]}>
            <SvgXml xml={l.xml} width={size} height={size} />
          </Animated.View>
        ))}
      </Animated.View>
    </View>
  );
});
