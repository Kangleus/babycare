/* 首页浮条：按住团子说「…」 换一句 —— 原型 .sample */
import { Pressable, StyleSheet, View } from 'react-native';
import { useApp } from '@/state/app-state';
import { SAMPLES } from '@/data/mock';
import { hard } from '@/theme/tokens';
import { Txt } from './txt';

export function SamplePill() {
  const { p, sample, nextSample } = useApp();
  return (
    <View pointerEvents="box-none" style={s.wrap}>
      <View style={[s.pill, { backgroundColor: p.card, borderColor: p.ink }, hard(p, 3)]}>
        <Txt f="b8" size={10} color={p.sub}>按住团子说</Txt>
        <Txt f="b8" size={12} numberOfLines={1} style={{ maxWidth: 220 }}>「{SAMPLES[sample]}」</Txt>
        <Pressable onPress={nextSample} style={[s.sw, { backgroundColor: p.pink, borderColor: p.ink }]}><Txt f="b8" size={11}>换一句</Txt></Pressable>
      </View>
    </View>
  );
}
const s = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, bottom: 112, alignItems: 'center', zIndex: 60 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 7, borderWidth: 2.5, borderRadius: 99, paddingTop: 4, paddingBottom: 4, paddingRight: 6, paddingLeft: 12 },
  sw: { borderWidth: 2, borderRadius: 99, paddingVertical: 2, paddingHorizontal: 9 },
});
