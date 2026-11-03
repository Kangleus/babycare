/* 原型通用组件的 RN 版：.sheet .heard .btn .actions .stepper .seg .editor .rc .risk .hgroup .toggle .list .li .inp
   数值逐条取自 index.html（行号见注释），不做二次设计 */
import { ReactNode } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, TextInput, TextInputProps, View, ViewStyle } from 'react-native';
import { Icon, Tuan } from '@/lib/svg';
import type { IconName, Mood } from '@/lib/art';
import { useApp } from '@/state/app-state';
import { hard, Kind, kindColor } from '@/theme/tokens';
import { fam, Txt } from './txt';

/* .sheet-ov + .sheet（230-232） */
export function Sheet({ open, onClose, children, maxH = '88%', testID }: { open: boolean; onClose: () => void; children: ReactNode; maxH?: `${number}%`; testID?: string }) {
  const { p, night } = useApp();
  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={[s.ov, { backgroundColor: night ? 'rgba(0,0,0,.55)' : 'rgba(74,58,44,.38)' }]} onPress={onClose} />
      <View testID={testID} style={[s.sheet, { maxHeight: maxH, backgroundColor: p.bg, borderColor: p.ink }]}>
        <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          <View style={[s.grab, { backgroundColor: p.line }]} />
          {children}
        </ScrollView>
      </View>
    </Modal>
  );
}

/* .heard（233-237） */
export function Heard({ mood, acc, t, sub, size = 64 }: { mood: Mood; acc: string[]; t: string; sub?: ReactNode; size?: number }) {
  const { p } = useApp();
  return (
    <View style={s.heard}>
      <Tuan mood={mood} acc={acc} size={size} />
      <View style={[s.q, { backgroundColor: p.card, borderColor: p.ink }, hard(p, 3)]}>
        <Txt f="h" size={19}>{t}</Txt>
        {sub ? <Txt f="b8" size={14} color={p.sub} style={{ marginTop: 3 }}>{sub}</Txt> : null}
      </View>
    </View>
  );
}

/* .split（238-239） */
export function Split({ left, chip, chipIcon = 'sparkle' }: { left: string; chip?: string; chipIcon?: IconName }) {
  const { p } = useApp();
  return (
    <View style={s.split}>
      <Txt f="b9" size={12.5} color={p.sub}>{left}</Txt>
      {chip ? <View style={[s.ai, { backgroundColor: p.card, borderColor: p.line }]}><Icon name={chipIcon} size={11} /><Txt f="b9" size={10.5} color={p.sub}>{chip}</Txt></View> : null}
    </View>
  );
}

/* .rc（240-252, 502-504, 590-592） */
export function Rc({ kind, icon, title, tags, onPress, edit = '点我改', testID, diff, dashed }: { kind: Kind; icon: IconName; title: ReactNode; tags: { t: ReactNode; def?: boolean; num?: boolean; clock?: boolean }[]; onPress?: () => void; edit?: string | null; testID?: string; diff?: ReactNode; dashed?: boolean }) {
  const { p } = useApp(); const c = kindColor(p, kind);
  return (
    <Pressable testID={testID} onPress={onPress} style={({ pressed }) => [s.rc, { backgroundColor: c.ks, borderColor: p.ink }, dashed && { backgroundColor: p.card, borderStyle: 'dashed' }, pressed && onPress ? { transform: [{ translateY: 2 }] } : hard(p, 4)]}>
      <View style={[s.rcIc, { backgroundColor: c.k, borderColor: p.ink }]}><Icon name={icon} size={28} /></View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Txt f="b9" size={16}>{title}</Txt>
        {/* .rc .diff（251-252）：一句话修改 <s>120ml</s>→ 150ml */}
        {diff ? <View style={s.diff}>{diff}</View> : null}
        {tags.length ? <View style={s.tags}>
          {tags.map((g, i) => (
            <View key={i} style={[s.tag, { backgroundColor: p.card, borderColor: p.line }, g.def && { borderStyle: 'dashed' }]}>
              {g.clock ? <Icon name="clock" size={11} /> : null}
              <Txt f={g.num ? 'b9' : 'b8'} size={11} color={g.def ? p.sub : p.ink}>{g.t}</Txt>
            </View>
          ))}
        </View> : null}
      </View>
      {edit ? <View style={[s.edit, { backgroundColor: p.card, borderColor: p.ink }]}><Icon name="pen" size={13} /><Txt f="b9" size={11}>{edit}</Txt></View> : null}
    </Pressable>
  );
}

/* .editor + .row（253-254） */
export function Editor({ children }: { children: ReactNode }) {
  const { p } = useApp();
  return <View style={[s.editor, { backgroundColor: p.card, borderColor: p.line }]}>{children}</View>;
}
export function Row({ label, children }: { label: string; children: ReactNode }) {
  return <View style={s.row}><Txt f="b9" size={12.5}>{label}</Txt>{children}</View>;
}
/* .stepper（255-258） */
export function Stepper({ val, onMinus, onPlus, testID, minW = 72 }: { val: ReactNode; onMinus: () => void; onPlus: () => void; testID?: string; minW?: number }) {
  return (
    <View style={s.stepper}>
      <StB t="−" on={onMinus} id={`${testID}-minus`} />
      <Txt f="b9" size={20} style={{ minWidth: minW, textAlign: 'center' }} testID={`${testID}-val`}>{val}</Txt>
      <StB t="+" on={onPlus} id={`${testID}-plus`} />
    </View>
  );
}
function StB({ t, on, id }: { t: string; on: () => void; id: string }) {
  const { p } = useApp();
  return (
    <Pressable testID={id} accessibilityLabel={id} onPress={on} style={({ pressed }) => [s.stb, { backgroundColor: p.bg, borderColor: p.ink }, pressed ? { transform: [{ translateY: 3 }] } : hard(p, 3)]}>
      <Txt f="b9" size={18} style={{ lineHeight: 20 }}>{t}</Txt>
    </Pressable>
  );
}
/* .seg（259-261, 581） */
export function Seg<T extends string>({ opts, value, onChange, style, testID }: { opts: { k: T; t: string; icon?: IconName }[]; value: T; onChange: (k: T) => void; style?: ViewStyle; testID?: string }) {
  const { p } = useApp();
  return (
    <View style={[s.seg, style]}>
      {opts.map(o => {
        const on = o.k === value;
        return (
          <Pressable key={o.k} testID={testID ? `${testID}-${o.k}` : undefined} onPress={() => onChange(o.k)} style={[s.segb, { borderColor: p.ink, backgroundColor: on ? p.yellow : p.bg }, on && { transform: [{ translateY: -1 }], ...hard(p, 3) }]}>
            {o.icon ? <Icon name={o.icon} size={14} /> : null}<Txt f="b9" size={12.5}>{o.t}</Txt>
          </Pressable>
        );
      })}
    </View>
  );
}
/* .risk（392-396） */
export function Risk({ title, items, icon = 16 }: { title: string; items: ReactNode[]; icon?: number }) {
  const { p, night } = useApp();
  return (
    <View style={[s.risk, { backgroundColor: night ? '#4a2a24' : '#FFE6E0' }]}>
      <View style={s.rt}><Icon name="warn" size={icon} /><Txt f="b9" size={14.5} color={night ? '#ff9d8a' : '#C9452F'}>{title}</Txt></View>
      {items.map((t, i) => (
        <View key={i} style={{ flexDirection: 'row', marginTop: i ? 0 : 6, paddingLeft: 4 }}>
          <Txt f="b4" size={12.5} style={{ lineHeight: 20, width: 14 }}>•</Txt>
          <Txt f="b4" size={12.5} style={{ lineHeight: 20, flex: 1 }} color={p.ink}>{t}</Txt>
        </View>
      ))}
    </View>
  );
}
/* .btn / .actions（262-268） */
export function Btn({ label, icon, kind, onPress, style, testID, disabled }: { label: string; icon?: IconName; kind?: 'pri' | 'pink'; onPress: () => void; style?: ViewStyle; testID?: string; disabled?: boolean }) {
  const { p } = useApp();
  const bg = kind === 'pri' ? p.yellow : kind === 'pink' ? p.pink : p.card;
  return (
    <Pressable testID={testID} disabled={disabled} onPress={onPress} style={({ pressed }) => [s.btn, { flex: kind === 'pri' ? 1.6 : 1, backgroundColor: bg, borderColor: p.ink }, pressed ? { transform: [{ translateY: 4 }, { scale: 0.98 }] } : hard(p, 4), disabled && { opacity: 0.45 }, style]}>
      {icon ? <Icon name={icon} size={20} color={p.ink} /> : null}<Txt f="b9" size={16}>{label}</Txt>
    </Pressable>
  );
}
export function Actions({ children, mt = 14 }: { children: ReactNode; mt?: number }) { return <View style={[s.actions, { marginTop: mt }]}>{children}</View>; }
export function Autosave({ children }: { children: ReactNode }) { const { p } = useApp(); return <Txt f="b8" size={11} color={p.sub} style={{ textAlign: 'center', marginTop: 10 }}>{children}</Txt>; }
export function NoteS({ children }: { children: ReactNode }) { const { p } = useApp(); return <Txt f="b8" size={11.5} color={p.sub} style={{ marginTop: 6, lineHeight: 17.25 }}>{children}</Txt>; }

/* .hgroup（534-536） */
export function HGroup({ t, mini, ok, style }: { t: string; mini?: string; ok?: string; style?: ViewStyle }) {
  const { p } = useApp();
  return (
    <View style={[s.hgroup, style]}>
      <Txt f="h" size={18}>{t}</Txt>
      {ok ? <View style={[s.ok, { backgroundColor: p.green, borderColor: p.ink }]}><Txt f="b9" size={10.5}>{ok}</Txt></View> : null}
      {mini ? <Txt f="b8" size={11} color={p.sub}>{mini}</Txt> : null}
    </View>
  );
}

/* .toggle（460-463） */
export function Toggle({ on, onPress, testID }: { on: boolean; onPress: () => void; testID?: string }) {
  const { p } = useApp();
  return (
    <Pressable testID={testID} accessibilityRole="switch" accessibilityState={{ checked: on }} onPress={onPress} style={[s.toggle, { backgroundColor: on ? p.yellow : p.line, borderColor: p.ink }]}>
      <View style={[s.knob, { backgroundColor: p.card, borderColor: p.ink }, on && { transform: [{ translateX: 22 }] }]} />
    </Pressable>
  );
}
/* .list / .li（450-457） */
export function List({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  const { p } = useApp();
  return <View style={[s.list, { backgroundColor: p.card, borderColor: p.ink }, hard(p, 4), style]}>{children}</View>;
}
export function Li({ icon, iconBg, t, sub, right, onPress, last, testID, iconNode }: { icon?: IconName; iconBg: string; t: string; sub?: string; right?: ReactNode; onPress?: () => void; last?: boolean; testID?: string; iconNode?: ReactNode }) {
  const { p } = useApp();
  const body = (
    <>
      <View style={[s.liIc, { backgroundColor: iconBg, borderColor: p.ink }]}>{iconNode ?? (icon ? <Icon name={icon} size={22} /> : null)}</View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Txt f="b9" size={14.5}>{t}</Txt>
        {sub ? <Txt f="b7" size={11.5} color={p.sub} style={{ marginTop: 2 }}>{sub}</Txt> : null}
      </View>
      {right ?? (onPress ? <Icon name="chev" size={16} color={p.ink} /> : null)}
    </>
  );
  const st = [s.li, { borderBottomColor: p.line }, last && { borderBottomWidth: 0 }];
  return onPress ? <Pressable testID={testID} onPress={onPress} style={st}>{body}</Pressable> : <View testID={testID} style={st}>{body}</View>;
}
/* .li .free（457） */
export function Free({ t, bg, dashed }: { t: string; bg?: string; dashed?: boolean }) {
  const { p } = useApp();
  return <View style={[s.free, { backgroundColor: bg ?? p.green, borderColor: p.ink }, dashed && { borderStyle: 'dashed' }]}><Txt f="b9" size={10.5}>{t}</Txt></View>;
}
/* .inp（410-412）：输入框沿用「问团子」输入条的样式 */
export function Inp(props: TextInputProps & { testID?: string; h?: number; bg?: string }) {
  const { p } = useApp();
  const { h, bg, ...rest } = props;
  return (
    <View style={[s.inp, { backgroundColor: bg ?? p.card, borderColor: p.ink }]}>
      <TextInput placeholderTextColor={p.sub} {...rest} style={[{ flex: 1, minWidth: 0, fontSize: 14, color: p.ink, paddingVertical: h ? 0 : 8, height: h, outlineStyle: 'none' } as object, fam('b7'), props.style]} />
    </View>
  );
}
/* .fl（300） */
export function Fl({ children, style }: { children: ReactNode; style?: ViewStyle }) { const { p } = useApp(); return <Txt f="b9" size={12.5} color={p.sub} style={[{ marginTop: 4, marginHorizontal: 2, marginBottom: 8 }, style]}>{children}</Txt>; }

const s = StyleSheet.create({
  ov: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, borderTopWidth: 3, borderTopLeftRadius: 34, borderTopRightRadius: 34, paddingTop: 10, paddingHorizontal: 18, paddingBottom: 30 },
  grab: { width: 46, height: 6, borderRadius: 9, alignSelf: 'center', marginBottom: 12 },
  heard: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  q: { flex: 1, borderWidth: 2.5, borderTopLeftRadius: 20, borderTopRightRadius: 20, borderBottomRightRadius: 20, borderBottomLeftRadius: 6, paddingVertical: 10, paddingHorizontal: 13 },
  split: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 16, marginHorizontal: 4, marginBottom: 9 },
  ai: { flexDirection: 'row', gap: 5, alignItems: 'center', borderWidth: 1.5, paddingVertical: 2, paddingHorizontal: 9, borderRadius: 99 },
  rc: { flexDirection: 'row', gap: 12, alignItems: 'center', borderWidth: 2.5, borderRadius: 24, padding: 12, marginBottom: 10 },
  rcIc: { width: 48, height: 48, borderRadius: 17, borderWidth: 2.5, alignItems: 'center', justifyContent: 'center' },
  tags: { flexDirection: 'row', gap: 5, marginTop: 5, flexWrap: 'wrap' },
  diff: { flexDirection: 'row', alignItems: 'baseline', marginTop: 4 },
  tag: { flexDirection: 'row', alignItems: 'center', gap: 3, borderRadius: 99, paddingVertical: 2, paddingHorizontal: 8, borderWidth: 1.5 },
  edit: { flexDirection: 'row', alignItems: 'center', gap: 3, borderWidth: 2, borderRadius: 99, paddingVertical: 4, paddingHorizontal: 9 },
  editor: { borderWidth: 2.5, borderStyle: 'dashed', borderRadius: 22, padding: 12, marginTop: -2, marginBottom: 12 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4, marginBottom: 8 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  stb: { width: 34, height: 34, borderRadius: 12, borderWidth: 2.5, alignItems: 'center', justifyContent: 'center' },
  seg: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  segb: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 2, borderRadius: 99, paddingVertical: 5, paddingHorizontal: 12 },
  risk: { borderWidth: 2.5, borderColor: '#E26D5A', borderRadius: 18, paddingVertical: 10, paddingHorizontal: 12, marginTop: 2, marginBottom: 8 },
  rt: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  btn: { height: 54, borderRadius: 99, borderWidth: 3, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, overflow: 'hidden' },
  actions: { flexDirection: 'row', gap: 10 },
  hgroup: { flexDirection: 'row', gap: 8, alignItems: 'center', marginTop: 18, marginHorizontal: 4, marginBottom: -2 },
  ok: { borderWidth: 1.5, borderRadius: 99, paddingVertical: 1, paddingHorizontal: 8 },
  toggle: { width: 54, height: 32, borderRadius: 99, borderWidth: 2.5 },
  knob: { position: 'absolute', top: 2, left: 2, width: 23, height: 23, borderRadius: 12, borderWidth: 2 },
  list: { borderWidth: 2.5, borderRadius: 26, marginTop: 14, overflow: 'hidden' },
  li: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13, paddingHorizontal: 14, borderBottomWidth: 2 },
  liIc: { width: 38, height: 38, borderRadius: 14, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  free: { borderWidth: 1.5, paddingVertical: 1, paddingHorizontal: 8, borderRadius: 99 },
  inp: { flexDirection: 'row', gap: 8, alignItems: 'center', borderWidth: 2.5, borderRadius: 99, paddingTop: 5, paddingBottom: 5, paddingRight: 5, paddingLeft: 16 },
});

/* .full 整页（293-306, 309）：彩色底 + 白色气泡圆 + 顶栏 + 团团 + 卡片 + 大按钮 */
export function FullPage({ bg, title, onClose, children, testID, closeIcon = 'x', closeLabel = '关闭' }: { bg: string; title: string; onClose?: () => void; children: ReactNode; testID?: string; closeIcon?: IconName; closeLabel?: string }) {
  const { p } = useApp();
  return (
    <View testID={testID} style={[fs.full, { backgroundColor: bg }]}>
      <ScrollView contentContainerStyle={fs.pad} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <View pointerEvents="none" style={[fs.blob, { width: 260, height: 260, right: -90, top: 60 }]} />
        <View pointerEvents="none" style={[fs.blob, { width: 160, height: 160, left: -60, top: 300 }]} />
        <View style={fs.bar}>
          {onClose ? <Pressable testID="full-close" accessibilityLabel={closeLabel} onPress={onClose} style={({ pressed }) => [fs.iconbtn, { backgroundColor: p.card, borderColor: p.ink }, pressed ? { transform: [{ translateY: 3 }] } : hard(p, 3)]}><Icon name={closeIcon} size={18} style={closeIcon === 'chev' ? { transform: [{ rotate: '180deg' }] } : undefined} /></Pressable> : <View style={{ width: 42 }} />}
          <Txt f="h" size={22}>{title}</Txt>
          <View style={{ width: 42 }} />
        </View>
        {children}
      </ScrollView>
    </View>
  );
}
export function FullHero({ mood, acc, line }: { mood: Mood; acc: string[]; line?: string }) {
  return (
    <>
      <View style={fs.hero}><Tuan mood={mood} acc={acc} size={200} /></View>
      {line ? <Txt f="b9" size={14} style={{ textAlign: 'center', marginBottom: 14 }}>{line}</Txt> : null}
    </>
  );
}
export function FullCard({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  const { p } = useApp();
  return <View style={[fs.card, { backgroundColor: p.card, borderColor: p.ink }, hard(p, 5), style]}>{children}</View>;
}
/* .full .btn.go（306） */
export function GoBtn({ label, icon = 'check', onPress, disabled, testID }: { label: string; icon?: IconName; onPress: () => void; disabled?: boolean; testID?: string }) {
  const { p } = useApp();
  return (
    <Pressable testID={testID} disabled={disabled} onPress={onPress} style={({ pressed }) => [fs.go, { backgroundColor: p.card, borderColor: p.ink }, pressed ? { transform: [{ translateY: 4 }, { scale: 0.98 }] } : hard(p, 4), disabled && { opacity: 0.45 }]}>
      <Icon name={icon} size={22} color={p.ink} /><Txt f="b9" size={18}>{label}</Txt>
    </Pressable>
  );
}
/* .cbox（555） */
export function CBox({ on, onPress, testID }: { on: boolean; onPress: () => void; testID?: string }) {
  const { p } = useApp();
  return (
    <Pressable testID={testID} accessibilityRole="checkbox" accessibilityState={{ checked: on }} onPress={onPress} style={[fs.cbox, { borderColor: p.ink, backgroundColor: on ? p.green : p.bg }]}>
      {on ? <Icon name="check" size={16} color={p.ink} /> : null}
    </Pressable>
  );
}
const fs = StyleSheet.create({
  full: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 105 },
  pad: { paddingTop: 62, paddingHorizontal: 20, paddingBottom: 40 },
  blob: { position: 'absolute', borderRadius: 999, backgroundColor: 'rgba(255,255,255,.28)' },
  bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  iconbtn: { width: 42, height: 42, borderRadius: 15, borderWidth: 2.5, alignItems: 'center', justifyContent: 'center' },
  hero: { width: 200, height: 200, marginTop: 4, marginBottom: -6, alignSelf: 'center' },
  card: { borderWidth: 3, borderRadius: 28, padding: 16 },
  go: { marginTop: 18, width: '100%', height: 60, borderRadius: 99, borderWidth: 3, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  cbox: { width: 30, height: 30, borderRadius: 11, borderWidth: 2.5, alignItems: 'center', justifyContent: 'center' },
});
