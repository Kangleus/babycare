/* 一键摘要：选人 → 团团在写便签 → 便签（可换一种 / 存图片 / 分享）。
   样式对照原型 .aud / .seg / .gen / .memo / .memo.big（index.html 417–443、1216–1264）。
   便签里的数字全部来自 lib/summary.ts，本文件只负责画。 */
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Defs, Line, Pattern, Rect } from 'react-native-svg';
import { useApp } from '@/state/app-state';
import { Icon, Tuan } from '@/lib/svg';
import type { IconName } from '@/lib/art';
import { shareImage, shareText } from '@/lib/share';
import { buildSummary, RANGES, summaryStats, type Aud, type Memo } from '@/lib/summary';
import { Actions, Autosave, Btn, Seg, Sheet } from './ui';
import { fam, Txt } from './txt';
import { hard } from '@/theme/tokens';

const INK = '#4A3A2C', SUB = '#8C7A66', DASH = '#EBD9B6';

export function SummarySheet() {
  const { summaryOpen, closeSummary, baby } = useApp();
  return (
    <Sheet open={summaryOpen} onClose={closeSummary} testID="summary-sheet">
      {summaryOpen && baby ? <SummaryBody onClose={closeSummary} /> : null}
    </Sheet>
  );
}

function SummaryBody({ onClose }: { onClose: () => void }) {
  const { p, baby, records, health, now, me, showToast } = useApp();
  const [stage, setStage] = useState<'pick' | 'gen' | 'memo'>('pick');
  const [aud, setAud] = useState<Aud>('doctor');
  const [range, setRange] = useState(3); // 原型默认「近 3 天」
  const [memo, setMemo] = useState<Memo | null>(null);
  const [busy, setBusy] = useState(false);
  const ref = useRef<unknown>(null);

  /* 原型 sleep(1100) 后再出便签；这里用定时器复刻，e2e 等 sm-memo 出现而不是死等 */
  useEffect(() => {
    if (stage !== 'gen' || !baby) return;
    const t = setTimeout(() => {
      setMemo(buildSummary(aud, summaryStats(records, now, range), { baby, health, now, me }));
      setStage('memo');
    }, 1100);
    return () => clearTimeout(t);
  }, [stage, aud, range, records, now, health, baby, me]);

  if (!baby) return null;

  const AUD: { k: Aud; t: string; s: string; ic: IconName; bg: string }[] = [
    { k: 'doctor', t: '给医生', s: '偏数据和变化', ic: 'steth', bg: p.blue },
    { k: 'granny', t: '给奶奶', s: '大字 · 作息和叮嘱', ic: 'granny', bg: p.orange },
  ];

  if (stage === 'pick') {
    return (
      <>
        <Txt f="h" size={24} style={{ marginTop: 2, marginHorizontal: 4 }}>一键摘要</Txt>
        <Txt f="b8" size={12.5} color={p.sub} style={{ marginHorizontal: 4, marginBottom: 12 }}>把{baby.name}的记录整理成一张小便签</Txt>
        <View style={s.aud} testID="sm-pick">
          {AUD.map(o => {
            const on = aud === o.k;
            return (
              <Pressable key={o.k} testID={`sm-aud-${o.k}`} onPress={() => setAud(o.k)}
                style={({ pressed }) => [s.audb, { backgroundColor: on ? p.pinkS : p.card, borderColor: p.ink },
                  pressed ? { transform: [{ translateY: 3 }] } : hard(p, 4), on && { transform: [{ translateY: -2 }] }]}>
                <View style={[s.audic, { backgroundColor: o.bg, borderColor: p.ink }]}><Icon name={o.ic} size={30} /></View>
                <Txt f="h" size={19} style={{ marginTop: 4 }}>{o.t}</Txt>
                <Txt f="b8" size={11} color={p.sub}>{o.s}</Txt>
              </Pressable>
            );
          })}
        </View>
        <Txt f="b9" size={12.5} color={p.sub} style={{ marginTop: 16, marginHorizontal: 4, marginBottom: 8 }}>时间范围</Txt>
        <Seg opts={RANGES.map(d => ({ k: String(d), t: `近 ${d} 天` }))} value={String(range)}
          onChange={k => setRange(Number(k))} testID="sm-range" />
        <Actions mt={20}><Btn label="生成摘要便签" icon="sparkle" kind="pri" onPress={() => setStage('gen')} testID="sm-gen" /></Actions>
        <Autosave>只陈述记录和统计，不写诊断结论</Autosave>
      </>
    );
  }

  if (stage === 'gen' || !memo) {
    return (
      <View testID="sm-gen-wait" style={{ alignItems: 'center', paddingTop: 24, paddingBottom: 10 }}>
        <Tuan mood="idle" acc={['book']} size={120} />
        <Txt f="b9" size={14} style={{ marginTop: 8 }}>团团在写便签…</Txt>
        <Txt f="b8" size={11.5} color={p.sub} style={{ marginTop: 4 }}>先用代码算统计，再按「{aud === 'doctor' ? '医生' : '奶奶'}版」模板组织文字</Txt>
      </View>
    );
  }

  const text = [memo.title, memo.sub, '', ...memo.rows.map(r => `【${r.k}】\n${r.d.join('\n')}`), '', memo.foot].join('\n');
  const doImg = async () => {
    setBusy(true);
    try {
      const r = await shareImage(ref.current, `${baby.name}-一键摘要`);
      showToast(r === 'saved' ? '图片已保存（下载）' : r === 'shared' ? '已打开分享' : '这台设备不支持分享图片');
    } catch { showToast('生成图片失败，可以先分享文字'); }
    setBusy(false);
  };
  const doText = async () => {
    try {
      const r = await shareText(text);
      if (r === 'copied') showToast('摘要文字已复制，可以粘贴给家人'); else if (r === 'shared') showToast('已打开分享');
    } catch { showToast('分享失败'); }
  };

  return (
    <>
      <View ref={ref as never} collapsable={false} style={{ backgroundColor: p.bg, paddingVertical: 6 }}>
        <MemoCard memo={memo} />
      </View>
      {memo.empty ? (
        <Actions mt={22}>
          <Btn label="关闭" onPress={onClose} testID="sm-close" />
          <Btn label="去记一笔" icon="hplus" kind="pri" testID="sm-record"
            onPress={() => { onClose(); showToast(`按住团团说一句，就能记下${baby.name}的第一笔`); }} />
        </Actions>
      ) : (
        <Actions mt={22}>
          <Btn label="换一种" onPress={() => setStage('pick')} testID="sm-again" />
          <Btn label={busy ? '生成中…' : '存图片'} icon="img" kind="pri" onPress={doImg} testID="sm-img" disabled={busy} />
          <Btn label="分享" icon="share" kind="pink" onPress={doText} testID="sm-share" />
        </Actions>
      )}
      <Autosave>{memo.empty ? '先记一笔，摘要就有内容了' : '包含宝宝信息 · 只发给信得过的人'}</Autosave>
    </>
  );
}

/* .memo / .memo.big（423–441）：胶带、网格、圆角、团团贴纸，数值逐条照抄 */
function MemoCard({ memo }: { memo: Memo }) {
  const { p } = useApp();
  return (
    <View testID="sm-memo" style={[s.memo, { borderColor: p.ink, shadowColor: p.shadow }]}>
      <View style={[StyleSheet.absoluteFill, { borderRadius: 18, overflow: 'hidden' }]} pointerEvents="none">
        <Svg width="100%" height="100%"><Defs><Pattern id="smg" width="18" height="18" patternUnits="userSpaceOnUse"><Line x1="0" y1="0.5" x2="18" y2="0.5" stroke="#F3E6CC" strokeWidth="1" /><Line x1="0.5" y1="0" x2="0.5" y2="18" stroke="#F3E6CC" strokeWidth="1" /></Pattern></Defs><Rect width="100%" height="100%" fill="url(#smg)" /></Svg>
      </View>
      <View style={[s.tape, s.tapeL]} /><View style={[s.tape, s.tapeR]} />
      <Text style={[fam('h'), { fontSize: memo.big ? 24 : 22, color: INK }]}>{memo.title}</Text>
      <Text style={[fam('b8'), { fontSize: 11.5, color: SUB, marginTop: 2 }]}>{memo.sub}</Text>
      {memo.rows.map((r, i) => (
        <View key={i} style={s.rowm} testID={`sm-row-${r.ic}`}>
          <View style={[s.ic, { backgroundColor: r.bg }]}><Icon name={r.ic} size={18} color={INK} /></View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[fam('b9'), { fontSize: memo.big ? 16 : 13.5, color: INK }]}>{r.k}</Text>
            {r.d.map((x, j) => <Text key={j} style={[fam('b6'), { fontSize: memo.big ? 15 : 12.5, lineHeight: memo.big ? 23 : 19.4, color: INK }]}>{x}</Text>)}
          </View>
        </View>
      ))}
      <View style={s.foot}><Text style={[fam('b8'), { fontSize: 10.5, color: SUB, flex: 1, paddingRight: 70 }]}>{memo.foot}</Text></View>
      <View style={s.stk} pointerEvents="none"><Tuan mood="happy" acc={['book']} size={84} /></View>
    </View>
  );
}

const s = StyleSheet.create({
  aud: { flexDirection: 'row', gap: 10, marginTop: 6 },
  audb: { flex: 1, borderWidth: 3, borderRadius: 24, paddingVertical: 12, paddingHorizontal: 10, alignItems: 'center' },
  audic: { width: 54, height: 54, borderRadius: 18, borderWidth: 2.5, alignItems: 'center', justifyContent: 'center' },
  memo: { position: 'relative', marginTop: 22, marginHorizontal: 4, marginBottom: 6, backgroundColor: '#FFFDF6', borderWidth: 2.5, borderTopLeftRadius: 10, borderTopRightRadius: 26, borderBottomRightRadius: 18, borderBottomLeftRadius: 22, paddingTop: 22, paddingHorizontal: 18, paddingBottom: 16, shadowOffset: { width: 0, height: 5 }, shadowOpacity: 1, shadowRadius: 0, elevation: 4, transform: [{ rotate: '-1.2deg' }] },
  tape: { position: 'absolute', top: -13, width: 86, height: 24, borderLeftWidth: 2, borderRightWidth: 2, borderStyle: 'dashed', borderColor: 'rgba(255,255,255,.7)' },
  tapeL: { left: 18, backgroundColor: 'rgba(255,158,177,.75)', transform: [{ rotate: '-7deg' }] },
  tapeR: { right: 16, backgroundColor: 'rgba(140,203,255,.75)', transform: [{ rotate: '6deg' }] },
  rowm: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', paddingVertical: 9, borderBottomWidth: 2, borderStyle: 'dashed', borderColor: DASH },
  ic: { width: 30, height: 30, borderRadius: 11, borderWidth: 2, borderColor: INK, alignItems: 'center', justifyContent: 'center' },
  foot: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 10 },
  stk: { position: 'absolute', right: -10, bottom: -16, width: 84, height: 84, transform: [{ rotate: '10deg' }] },
});
