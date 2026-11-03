import { createContext, useContext } from 'react';
import { Platform, Text, TextProps, TextStyle } from 'react-native';
import { useApp } from '@/state/app-state';
import type { Seg } from '@/lib/calc';

/* 字体族：原型 --fh(ZCOOL 快乐体) / --fb、--fn(Nunito) 各字重 */
const FAM = {
  h: 'ZCOOLKuaiLe_400Regular', b4: 'Nunito_400Regular', b6: 'Nunito_600SemiBold', b7: 'Nunito_700Bold', b8: 'Nunito_800ExtraBold', b9: 'Nunito_900Black',
} as const;
export type Fam = keyof typeof FAM;
const W: Record<Fam, TextStyle['fontWeight']> = { h: '400', b4: '400', b6: '600', b7: '700', b8: '800', b9: '900' };
/* Web 上中文会回退到系统 CJK 字体，需要同时给 font-weight 才能和原型一样粗；原生端只用字体族（Android 上自定义字体 + fontWeight 会回退系统字体） */
/* 与原型 --fb / --fh 相同的中文回退栈 */
const CJK_B = ',"PingFang SC","Noto Sans SC","Noto Sans CJK SC","Microsoft YaHei",system-ui,sans-serif';
const CJK_H = ',"Yuanti SC","YouYuan","PingFang SC","Noto Sans SC","Noto Sans CJK SC","Microsoft YaHei",sans-serif';
export const fam = (f: Fam): TextStyle => Platform.OS === 'web' ? { fontFamily: FAM[f] + (f === 'h' ? CJK_H : CJK_B), fontWeight: W[f] } : { fontFamily: FAM[f] };

/* 默认文字色覆盖：原型 body.night .full.ob{color:#2a1f16} —— 夜间时彩色整页上「直接放在底色上的字」用深色，
   而卡片 / 按钮 / banner 里面仍是 var(--ink)。FullPage 提供深色，FullCard / GoBtn 等再用 InkReset 恢复成 null。 */
export const InkCtx = createContext<string | null>(null);
export const InkReset = InkCtx.Provider;

export function Txt({ f = 'b4', size = 14, color, style, ...rest }: TextProps & { f?: Fam; size?: number; color?: string }) {
  const { p } = useApp();
  const ink = useContext(InkCtx);
  return <Text {...rest} style={[{ ...fam(f), fontSize: size, color: color ?? ink ?? p.ink }, style]} />;
}

/* .num：Nunito 900，letter-spacing -.01em */
export const numStyle = (size: number): TextStyle => ({ ...fam('b9'), fontSize: size, letterSpacing: -0.01 * size });

export function Segs({ segs, numSize, style }: { segs: Seg[]; numSize?: number; style?: object }) {
  return <>{segs.map((s, i) => s.num ? <Text key={i} style={[numSize ? numStyle(numSize) : fam('b9'), style]}>{s.t}</Text> : <Text key={i}>{s.t}</Text>)}</>;
}
