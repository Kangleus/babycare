import { memo } from 'react';
import { SvgXml } from 'react-native-svg';
import { ic, IconName, Mood, tuan } from './art';

export const Icon = memo(function Icon({ name, size = 22, color, fill }: { name: IconName; size?: number; color?: string; fill?: string }) {
  const fn = ic[name] as (s: number, f?: string) => string;
  return <SvgXml xml={fill ? fn(size, fill) : fn(size)} width={size} height={size} color={color} />;
});

export const Tuan = memo(function Tuan({ mood = 'idle', acc = [], size = 64 }: { mood?: Mood; acc?: string[]; size?: number }) {
  return <SvgXml xml={tuan(mood, acc)} width={size} height={size} />;
});
