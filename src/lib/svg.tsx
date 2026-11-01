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

export const Tuan = memo(function Tuan({ mood = 'idle', acc = [], size = 64 }: { mood?: Mood; acc?: string[]; size?: number }) {
  /* 原生：Animated 分层动画；Web：原型 CSS 动画（?mascot=native 可在浏览器里预览原生实现） */
  if (USE_NATIVE_MASCOT) return <AnimatedTuan xml={tuan(mood, acc)} size={size} />;
  return <SvgXml xml={tuan(mood, acc)} width={size} height={size} />;
});
