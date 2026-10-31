import { ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useApp } from '@/state/app-state';
import { Tuan } from '@/lib/svg';
import type { Mood } from '@/lib/art';
import { hard } from '@/theme/tokens';
import { useTopPad } from './chrome';
import { Txt } from './txt';

/* .page：padding 76px 18px 160px，可滚动 */
export function Page({ children }: { children: ReactNode }) {
  const { p } = useApp(); const top = useTopPad();
  return (
    <ScrollView style={{ flex: 1, backgroundColor: p.bg }} contentContainerStyle={{ paddingTop: top, paddingHorizontal: 18, paddingBottom: 160 }} showsVerticalScrollIndicator={false}>
      {children}
    </ScrollView>
  );
}

/* .ptitle / .psub */
export function PTitle({ title, sub }: { title: string; sub?: string }) {
  const { p } = useApp();
  return (
    <View>
      <Txt f="h" size={30} style={{ marginTop: 2, marginHorizontal: 4 }}>{title}</Txt>
      {sub ? <Txt f="b8" size={12.5} color={p.sub} style={{ marginTop: 3, marginHorizontal: 4 }}>{sub}</Txt> : null}
    </View>
  );
}

/* M0 占位卡：说明这个 Tab 在哪个里程碑接入 */
export function Placeholder({ mood = 'idle', acc = [], title, lines, milestone }: { mood?: Mood; acc?: string[]; title: string; lines: string[]; milestone: string }) {
  const { p } = useApp();
  return (
    <View style={[st.card, { backgroundColor: p.card, borderColor: p.ink }, hard(p, 4)]}>
      <View style={st.row}>
        <Tuan mood={mood} acc={acc} size={72} />
        <View style={{ flex: 1 }}>
          <Txt f="h" size={19}>{title}</Txt>
          <View style={[st.ms, { backgroundColor: p.yellowS, borderColor: p.ink }]}><Txt f="b9" size={11}>{milestone} 接入</Txt></View>
        </View>
      </View>
      {lines.map(l => <Txt key={l} f="b7" size={12.5} color={p.sub} style={{ marginTop: 8, lineHeight: 18 }}>· {l}</Txt>)}
    </View>
  );
}
const st = StyleSheet.create({
  card: { marginTop: 16, borderWidth: 2.5, borderRadius: 24, padding: 14 },
  row: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  ms: { alignSelf: 'flex-start', marginTop: 6, borderWidth: 2, borderRadius: 99, paddingVertical: 2, paddingHorizontal: 9 },
});
