import { memo } from 'react';
import { Platform } from 'react-native';
import { SvgXml } from 'react-native-svg';
import { AnimatedTuan } from './mascot';
import { ic, IconName, Mood, tuan } from './art';

export const Icon = memo(function Icon({ name, size = 22, color, fill }: { name: IconName; size?: number; color?: string; fill?: string }) {
  const fn = ic[name] as (s: number, f?: string) => string;
  return <SvgXml xml={fill ? fn(size, fill) : fn(size)} width={size} height={size} color={color} />;
});

const USE_NATIVE_MASCOT = Platform.OS !== 'web' || (typeof location !== 'undefined' && /[?&]mascot=native\b/.test(location.search));

/* 团团的 SVG 是手写字符串，里面用 class="t-body" 给 Web 的 CSS 动画做挂钩。
   React DOM 只认 className，直接传 class 会报
   「Invalid DOM property `class`. Did you mean `className`?」——开发时是红屏浮层，
   生产环境是静默的 console 错误。所以只在 Web 渲染这一步做转换，
   原生那条（AnimatedTuan）仍然按 class="t-xxx" 解析，不能动。 */
const webXml = (xml: string) => (Platform.OS === 'web'
  /* aria-hidden 也会被 react-native-svg 转成 React 不认的 ariaHidden（控制台又一条红字），
     团团和图标的 svg 都是纯装饰，Web 上直接去掉这个属性，不损失可访问性。 */
  ? xml.replace(/\sclass="/g, ' className="').replace(/\saria-hidden="[^"]*"/g, '')
  : xml);

export const Tuan = memo(function Tuan({ mood = 'idle', acc = [], size = 64, cls = '' }: { mood?: Mood; acc?: string[]; size?: number; cls?: string }) {
  /* 原生：Animated 分层动画；Web：原型 CSS 动画（?mascot=native 可在浏览器里预览原生实现） */
  if (USE_NATIVE_MASCOT) return <AnimatedTuan xml={tuan(mood, acc, cls)} size={size} />;
  return <SvgXml xml={webXml(tuan(mood, acc, cls))} width={size} height={size} />;
});
