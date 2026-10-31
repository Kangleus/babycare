/* 编辑首页卡片底部面板 —— 原型 app6 renderEd() + .cedit 样式 */
import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Icon, Tuan } from '@/lib/svg';
import { useApp } from '@/state/app-state';
import { CARDS, DEF_CARDS } from '@/data/mock';
import { hard, Kind, kindColor } from '@/theme/tokens';
import { Txt } from './txt';
import { useLvAcc } from './home';

export function CardEditor({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose}>
      {open ? <EditorBody onClose={onClose} /> : null}
    </Modal>
  );
}

/* 每次打开重新挂载，用当前首页卡片初始化（原型 openCardEditor） */
function EditorBody({ onClose }: { onClose: () => void }) {
  const { p, cards, setCards, night, showToast } = useApp();
  const lv = useLvAcc();
  /* CSS grid 1fr 等分：内容宽 = 屏宽 - 左右 18 */
  const { width } = useWindowDimensions();
  const inner = width - 36, slotW = (inner - 18) / 3, pcW = (inner - 24) / 4;
  const [slots, setSlots] = useState<Kind[]>(cards);
  const [sel, setSel] = useState(0);
  const sk = slots[sel], sc = CARDS[sk];
  const acc = (() => { const a = sc.acc.filter(x => x !== 'cap'); return night ? [...a, 'cap'] : (a.length ? a : lv); })();
  const move = (d: number) => { const j = sel + d; if (j < 0 || j > 5) return; const n = [...slots];[n[sel], n[j]] = [n[j], n[sel]]; setSlots(n); setSel(j); };
  const pick = (k: Kind) => { const j = slots.indexOf(k); if (j === sel) return; const n = [...slots]; if (j >= 0) [n[sel], n[j]] = [n[j], n[sel]]; else n[sel] = k; setSlots(n); };
  return (
    <>
      <Pressable style={s.ov} onPress={onClose} />
      <View style={[s.sheet, { backgroundColor: p.bg, borderColor: p.ink }]}>
        <ScrollView showsVerticalScrollIndicator={false}>
          <View style={[s.grab, { backgroundColor: p.line }]} />
          <View style={s.heard}>
            <Tuan mood={sc.mood} acc={acc} size={74} />
            <View style={[s.q, { backgroundColor: p.card, borderColor: p.ink }, hard(p, 3)]}>
              <Txt f="h" size={19}>编辑首页卡片</Txt>
              <Txt f="b8" size={14} color={p.sub} style={{ marginTop: 3 }}>固定 6 张 · 先点一张，再从下面挑一个换上</Txt>
            </View>
          </View>
          <Txt f="h" size={18} style={s.hgroup}>首页 · 6 张</Txt>
          <View style={s.slots}>
            {slots.map((k, i) => {
              const col = kindColor(p, k), on = i === sel;
              return (
                <Pressable key={k} onPress={() => setSel(i)} style={[s.slot, { width: slotW, backgroundColor: col.ks, borderColor: p.ink }, hard(p, 3), on && s.slotSel]}>
                  <View style={[s.slotNo, { backgroundColor: p.card, borderColor: p.ink }]}><Txt f="b9" size={11}>{i + 1}</Txt></View>
                  <View style={[s.slotIc, { backgroundColor: col.k, borderColor: p.ink }]}><Icon name={CARDS[k].ic} size={18} /></View>
                  <Txt f="b9" size={13}>{CARDS[k].n}</Txt>
                </Pressable>
              );
            })}
          </View>
          <View style={[s.ord, { backgroundColor: p.bg2, borderColor: p.line }]}>
            <Txt f="b9" size={12} color={p.sub}>选中第 <Txt f="b9" size={12}>{sel + 1}</Txt> 张 · <Txt f="b9" size={12}>{sc.n}</Txt></Txt>
            <View style={{ flexDirection: 'row', gap: 6 }}>
              {[[-1, '◀ 前移'], [1, '后移 ▶']].map(([d, t]) => {
                const dis = (d === -1 && sel === 0) || (d === 1 && sel === 5);
                return <Pressable key={String(d)} disabled={dis} onPress={() => move(d as number)} style={[s.ordBtn, { backgroundColor: p.card, borderColor: p.ink }, dis ? { opacity: 0.35 } : hard(p, 2)]}><Txt f="b9" size={12}>{t}</Txt></Pressable>;
              })}
            </View>
          </View>
          <View style={[s.hgroupRow]}><Txt f="h" size={18}>全部类型</Txt><Txt f="b8" size={11} color={p.sub}>点一下换到第 {sel + 1} 张</Txt></View>
          <View style={s.pool}>
            {(Object.keys(CARDS) as Kind[]).map(k => {
              const u = slots.includes(k), col = kindColor(p, k);
              return (
                <Pressable key={k} onPress={() => pick(k)} style={[s.pc, { width: pcW, borderColor: p.ink, backgroundColor: u ? p.bg2 : p.card }, u ? { borderStyle: 'dashed' } : hard(p, 2)]}>
                  <View style={[s.pcIc, { backgroundColor: col.k, borderColor: p.ink, opacity: u ? 0.55 : 1 }]}><Icon name={CARDS[k].ic} size={20} /></View>
                  <Txt f="b9" size={11.5} color={u ? p.sub : p.ink}>{CARDS[k].n}</Txt>
                  {u ? <View style={[s.chk, { backgroundColor: p.green, borderColor: p.ink }]}><Icon name="check" size={10} color={p.ink} /></View> : null}
                </Pressable>
              );
            })}
          </View>
          <View style={s.actions}>
            <Pressable onPress={() => { setSlots(DEF_CARDS); setSel(0); }} style={[s.btn, { backgroundColor: p.card, borderColor: p.ink }, hard(p, 4)]}><Txt f="b9" size={16}>恢复默认</Txt></Pressable>
            <Pressable onPress={() => { setCards(slots); onClose(); showToast('首页卡片换好啦'); }} style={[s.btn, { flex: 1.6, backgroundColor: p.yellow, borderColor: p.ink }, hard(p, 4)]}><Icon name="check" size={20} color={p.ink} /><Txt f="b9" size={16}>好了</Txt></Pressable>
          </View>
          <Txt f="b8" size={11} color={p.sub} style={{ textAlign: 'center', marginTop: 10 }}>已在首页的类型再点一下，会和选中的那张换位置</Txt>
        </ScrollView>
      </View>
    </>
  );
}

const s = StyleSheet.create({
  ov: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(74,58,44,.38)' },
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, maxHeight: '88%', borderTopWidth: 3, borderTopLeftRadius: 34, borderTopRightRadius: 34, paddingTop: 10, paddingHorizontal: 18, paddingBottom: 30 },
  grab: { width: 46, height: 6, borderRadius: 9, alignSelf: 'center', marginBottom: 12 },
  heard: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  q: { flex: 1, borderWidth: 2.5, borderTopLeftRadius: 20, borderTopRightRadius: 20, borderBottomRightRadius: 20, borderBottomLeftRadius: 6, paddingVertical: 10, paddingHorizontal: 13 },
  hgroup: { marginTop: 12, marginHorizontal: 4, marginBottom: 12 },
  hgroupRow: { flexDirection: 'row', gap: 8, alignItems: 'center', marginTop: 6, /* 12 与 .ord 的 margin-bottom 6 折叠 */ marginHorizontal: 4, marginBottom: 12 },
  slots: { flexDirection: 'row', flexWrap: 'wrap', gap: 9, marginBottom: 10 }, /* margin-top:4 与 hgroup 的 12 折叠 */
  slot: { flexDirection: 'row', alignItems: 'center', gap: 7, borderWidth: 2.5, borderRadius: 20, paddingTop: 9, paddingHorizontal: 8, paddingBottom: 8 },
  slotSel: { transform: [{ translateY: -3 }, { rotate: '-1.5deg' }], outlineWidth: 3, outlineStyle: 'dashed', outlineColor: '#FF7A92', outlineOffset: 3 },
  slotNo: { position: 'absolute', left: -7, top: -8, width: 20, height: 20, borderRadius: 10, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  slotIc: { width: 30, height: 30, borderRadius: 11, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  ord: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 2, borderStyle: 'dashed', borderRadius: 16, paddingTop: 6, paddingRight: 6, paddingBottom: 6, paddingLeft: 12, marginBottom: 6 },
  ordBtn: { height: 30, paddingHorizontal: 10, borderRadius: 99, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  pool: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, /* margin-top:4 被折叠 */
  pc: { alignItems: 'center', gap: 4, paddingTop: 8, paddingHorizontal: 2, paddingBottom: 7, borderRadius: 18, borderWidth: 2 },
  pcIc: { width: 34, height: 34, borderRadius: 12, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  chk: { position: 'absolute', right: -5, top: -6, width: 19, height: 19, borderRadius: 10, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  actions: { flexDirection: 'row', gap: 10, marginTop: 14 },
  btn: { flex: 1, height: 54, borderRadius: 99, borderWidth: 3, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
});
