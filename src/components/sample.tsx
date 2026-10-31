/* 「按住团子说「…」 换一句」—— 原型 .sample / .samples-pop。
   M1 修复：原型里浮条压在「点 + 记一笔」提示和「今日时间线」标题上；这里改为放进页面流里（提示行下方），不再遮挡。 */
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useApp } from '@/state/app-state';
import { Icon } from '@/lib/svg';
import { SAMPLES } from '@/data/mock';
import { hard } from '@/theme/tokens';
import { Txt } from './txt';

export function SamplePill() {
  const { p, sample, setSamplesOpen, samplesOpen } = useApp();
  return (
    <Pressable testID="sample-pill" onPress={() => setSamplesOpen(!samplesOpen)} style={[s.pill, { backgroundColor: p.card, borderColor: p.ink }, hard(p, 3)]}>
      <Txt f="b8" size={10} color={p.sub}>按住团子说</Txt>
      <Txt f="b8" size={12} numberOfLines={1} style={{ maxWidth: 220, flexShrink: 1 }}>「{SAMPLES[sample].text}」</Txt>
      <Pressable testID="sample-switch" onPress={() => setSamplesOpen(!samplesOpen)} style={[s.sw, { backgroundColor: p.pink, borderColor: p.ink }]}><Txt f="b8" size={11}>换一句</Txt></Pressable>
    </Pressable>
  );
}

/* .samples-pop（152-156, 506-508）+ app5 分组 */
export function SamplesPop() {
  const { p, sample, setSample, samplesOpen, setSamplesOpen, showToast } = useApp();
  if (!samplesOpen) return null;
  return (
    <>
      <Pressable style={s.catch} onPress={() => setSamplesOpen(false)} />
      <View testID="samples-pop" style={[s.pop, { backgroundColor: p.card, borderColor: p.ink }, hard(p, 5)]}>
        <ScrollView showsVerticalScrollIndicator={false}>
          <Txt f="h" size={17} style={{ marginTop: 2, marginHorizontal: 6, marginBottom: 8 }}>选一句演示语音</Txt>
          {SAMPLES.map((x, i) => {
            const g = x.g || '日常', head = i === 0 || g !== (SAMPLES[i - 1].g || '日常');
            return (
              <View key={x.text}>
                {head ? <Txt f="b9" size={11} color={p.sub} style={{ marginTop: 8, marginHorizontal: 10, marginBottom: 2 }}>{g}</Txt> : null}
                <Pressable testID={`sample-${i}`} onPress={() => { setSample(i); setSamplesOpen(false); showToast('按住底部团子说话试试吧'); }} style={[s.it, i === sample && { backgroundColor: p.pinkS }]}>
                  <Icon name="mic" size={20} />
                  <View style={{ flex: 1 }}>
                    <Txt f="b8" size={13.5}>「{x.text}」</Txt>
                    <Txt f="b7" size={10.5} color={p.sub}>{x.note}</Txt>
                  </View>
                </Pressable>
              </View>
            );
          })}
        </ScrollView>
      </View>
    </>
  );
}
const s = StyleSheet.create({
  pill: { alignSelf: 'center', maxWidth: 350, marginTop: 12, flexDirection: 'row', alignItems: 'center', gap: 7, borderWidth: 2.5, borderRadius: 99, paddingTop: 4, paddingBottom: 4, paddingRight: 6, paddingLeft: 12 },
  sw: { borderWidth: 2, borderRadius: 99, paddingVertical: 2, paddingHorizontal: 9 },
  catch: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 60 },
  pop: { position: 'absolute', left: 14, right: 14, bottom: 160, zIndex: 61, borderWidth: 3, borderRadius: 26, padding: 12, maxHeight: 560 },
  it: { flexDirection: 'row', gap: 10, alignItems: 'center', paddingVertical: 7, paddingHorizontal: 10, borderRadius: 16 },
});
