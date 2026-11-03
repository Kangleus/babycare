/* 邀请家人（全局 sheet 内容）：原型 invite() —— .heard + .note-desc 里的 6 位 .ob-code + 有效期 + 关闭 / 换一个 / 分享
   旧的登录 / 创建家庭 / 加入家庭整页已由 onboarding.tsx / ob-family.tsx 取代（必须登录才能用）。 */
import { useEffect, useState } from 'react';
import { Platform, Share, StyleSheet, View } from 'react-native';
import { Actions, Autosave, Btn, Heard } from './ui';
import { Txt } from './txt';
import { useApp } from '@/state/app-state';
import { useLvAcc } from '@/state/hooks';
import { cloud } from '@/state/cloud';
import { hard } from '@/theme/tokens';

const errColor = '#C9452F';

export function InviteBody({ onClose }: { onClose: () => void }) {
  const { p, night, baby, showToast } = useApp();
  const acc = useLvAcc();
  const [inv, setInv] = useState<{ code: string; expiresAt: string } | null>(null);
  const [err, setErr] = useState('');
  const [n, setN] = useState(0);
  useEffect(() => {
    let alive = true;
    cloud.createInvite().then(v => { if (alive) { setInv(v); setErr(''); if (n) showToast('换了一个新的邀请码'); } }, e => { if (alive) setErr((e as Error).message); });
    return () => { alive = false; };
  }, [n, showToast]);
  const exp = inv ? new Date(inv.expiresAt) : null;
  const expTxt = exp ? `${exp.getMonth() + 1}月${exp.getDate()}日 ${String(exp.getHours()).padStart(2, '0')}:${String(exp.getMinutes()).padStart(2, '0')}` : '';
  const text = inv ? `我在「团子育儿本」记录${baby?.name ?? '宝宝'}的吃喝拉撒睡，邀请你一起记～\n注册登录后选「我有邀请码」，输入：${inv.code}\n（${expTxt} 前有效，只能用一次）` : '';
  const share = async () => {
    try {
      if (Platform.OS === 'web') {
        const nav = navigator as Navigator & { share?: (d: { text: string }) => Promise<void> };
        if (nav.share) await nav.share({ text });
        else { await nav.clipboard.writeText(text); showToast('邀请文字已复制，发给家人吧'); }
      } else await Share.share({ message: text });
      onClose();
    } catch { /* 用户取消分享 / 剪贴板不可用 */ }
  };
  return (
    <>
      <Heard mood="happy" acc={acc} t="邀请家人" sub="把邀请码发给爸爸、奶奶，一起记" />
      <View testID="invite-card" style={[s.desc, { backgroundColor: p.bg2, borderColor: p.line }]}>
        {err ? <Txt f="b9" size={13} color={night ? '#ff9d8a' : errColor}>{err}</Txt> : (
          <>
            <Txt f="b7" size={12} color={p.sub}>邀请码</Txt>
            <View style={s.codeRow}>
              {(inv?.code ?? '      ').split('').map((ch, i) => (
                <View key={i} style={[s.codeBox, { backgroundColor: p.card, borderColor: p.ink }, hard(p, 3)]}><Txt testID={`invite-c${i}`} f="h" size={24}>{ch.trim()}</Txt></View>
              ))}
            </View>
            <Txt testID="invite-exp" f="b7" size={11.5} color={p.sub}>{inv ? `${expTxt} 前有效（48 小时）· 只能用一次` : '正在生成…'}</Txt>
          </>
        )}
      </View>
      <Actions>
        <Btn label="关闭" onPress={onClose} testID="invite-ok" />
        <Btn label="换一个" onPress={() => { setInv(null); setN(x => x + 1); }} testID="invite-new" />
        <Btn label="分享" icon="share" kind="pri" disabled={!inv} onPress={share} testID="invite-share" />
      </Actions>
      <Autosave>家人加入后，每条记录都会显示是谁记的</Autosave>
    </>
  );
}

const s = StyleSheet.create({
  desc: { marginTop: 14, borderWidth: 2, borderStyle: 'dashed', borderRadius: 22, paddingVertical: 10, paddingHorizontal: 12, alignItems: 'center' },
  codeRow: { flexDirection: 'row', gap: 7, justifyContent: 'center', marginVertical: 10 },
  codeBox: { width: 40, height: 50, borderRadius: 14, borderWidth: 2.5, alignItems: 'center', justifyContent: 'center' },
});
