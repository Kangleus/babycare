import { Pressable, StyleSheet, View } from 'react-native';
import { Page, PTitle, Placeholder } from '@/components/page';
import { Icon } from '@/lib/svg';
import { Txt } from '@/components/txt';
import { useApp } from '@/state/app-state';
import { hard } from '@/theme/tokens';

export default function Ai() {
  const { p, baby, openSummary } = useApp();
  return (
    <Page>
      {/* 原型 .ai-h：标题 + 右上角「一键摘要」pillbtn（index.html 364–371、1190） */}
      <View style={s.head}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <PTitle title="问团子" sub={`只看${(baby?.name ?? '宝宝')}的记录回答 · 演示`} />
        </View>
        <Pressable testID="summary-open" onPress={openSummary}
          style={({ pressed }) => [s.pill, { backgroundColor: p.pink, borderColor: p.ink, shadowColor: p.shadow }, pressed ? { transform: [{ translateY: 3 }] } : hard(p, 3)]}>
          <Icon name="doc" size={16} color={p.ink} />
          <Txt f="b9" size={12.5}>一键摘要</Txt>
        </Pressable>
      </View>
      <Placeholder acc={['book']} title="基于自家记录的 AI 问答" milestone="M5"
        lines={['数字由代码算，团团只负责说成人话', '风险问题固定提示就医，不诊断、不给剂量']} />
    </Page>
  );
}

const s = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 2.5, borderRadius: 99, paddingVertical: 7, paddingHorizontal: 12 },
});
