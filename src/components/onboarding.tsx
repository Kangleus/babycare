/* 首次启动：隐私政策 / 用户协议（草案）→ 宝宝资料 → 首页。整页样式沿用原型「手动记录」的 .full 页 */
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useApp } from '@/state/app-state';
import { uid } from '@/data/repo';
import type { AvatarKey, Baby, Gender } from '@/data/types';
import { ageText, parseYmd } from '@/lib/time';
import { hard } from '@/theme/tokens';
import { AVATARS, BabyAvatar } from './home';
import { CBox, Fl, FullCard, FullHero, FullPage, GoBtn, Inp, NoteS, Seg } from './ui';
import { Txt } from './txt';

/* ⚠️ 草案占位文本：上线前需由法务定稿替换 */
export const POLICY_DRAFT = [
  '【草案 · 占位文本 · 尚未经法务审核，不具法律效力】',
  '1. 我们收集什么：你主动记录的宝宝信息（昵称、生日、性别）和喂奶、睡眠、尿布、体温、用药等记录。',
  '2. 存在哪里：当前版本所有数据只保存在这台设备上，不上传服务器。开通云端同步后，会在你登录并同意后再上传，用于家人之间共享。',
  '3. 语音：后续版本的语音记录在转成文字后不保存原始录音，不用于广告和模型训练。',
  '4. 健康相关：一句记只记录你说的内容，不做诊断、不推荐用药剂量；身体不适请及时就医。',
  '5. 你的权利：可以随时在「我的 › 清空全部数据」删除本机全部数据，或导出数据（后续版本）。',
  '6. 联系我们：正式版本会在此处提供联系方式。',
];

export function ProfileForm({ init, onSubmit, submitLabel, testID }: { init: Baby; onSubmit: (b: Baby) => void; submitLabel: string; testID?: string }) {
  const { p, now, showToast } = useApp();
  const [name, setName] = useState(init.name);
  const [bd, setBd] = useState(init.birthday);
  const [gender, setGender] = useState<Gender>(init.gender);
  const [avatar, setAvatar] = useState<AvatarKey>(init.avatar);
  const d = parseYmd(bd), ok = !!name.trim() && !!d && d <= now;
  const submit = () => {
    if (!name.trim()) return showToast('给宝宝起个昵称吧');
    if (!d) return showToast('生日格式像 2026-03-28 这样');
    if (d > now) return showToast('生日不能晚于今天');
    onSubmit({ ...init, name: name.trim().slice(0, 12), birthday: bd.trim(), gender, avatar });
  };
  return (
    <View testID={testID}>
      <FullCard>
        <Fl>宝宝昵称</Fl>
        <Inp testID="pf-name" value={name} onChangeText={setName} placeholder="比如：豆米" maxLength={12} />
        <Fl style={{ marginTop: 14 }}>生日 · 年-月-日</Fl>
        <Inp testID="pf-bd" value={bd} onChangeText={setBd} placeholder="2026-03-28" maxLength={10} inputMode="numeric" />
        <NoteS>{d ? (d > now ? '生日不能晚于今天' : `今天 ${ageText(bd, now)}`) : '格式像 2026-03-28 这样'}</NoteS>
        <Fl style={{ marginTop: 14 }}>性别</Fl>
        <Seg testID="pf-gender" opts={[{ k: 'girl', t: '女宝' }, { k: 'boy', t: '男宝' }]} value={gender} onChange={k => setGender(k as Gender)} />
        <Fl style={{ marginTop: 14 }}>头像</Fl>
        <View style={s.avs}>
          {AVATARS.map(a => (
            <Pressable key={a.k} testID={`pf-av-${a.k}`} onPress={() => setAvatar(a.k)} style={[s.av, { backgroundColor: a.k === avatar ? p.pinkS : p.bg, borderColor: p.ink }, a.k === avatar ? hard(p, 3) : null]}>
              <View style={s.avIn}><BabyAvatar k={a.k} size={40} /></View>
              <Txt f="b9" size={10.5} color={a.k === avatar ? p.ink : p.sub}>{a.n}</Txt>
            </Pressable>
          ))}
        </View>
      </FullCard>
      <GoBtn testID="pf-submit" label={submitLabel} onPress={submit} disabled={!ok} />
    </View>
  );
}

export const DEFAULT_BABY = (): Baby => ({ id: uid(), name: '豆米', birthday: '2026-03-28', gender: 'girl', avatar: 'baby', feeding: 'formula' });

export function Onboarding() {
  const { p, settings, acceptConsent, finishOnboarding, showToast } = useApp();
  const [agree, setAgree] = useState(false);
  if (!settings.consentAt) {
    return (
      <FullPage bg={p.yellow} title="欢迎来到一句记" testID="ob-consent">
        <FullHero mood="happy" acc={['sprout']} line="一句话记下宝宝的吃睡拉，团团帮你算" />
        <FullCard>
          <View style={s.ttl}>
            <Txt f="h" size={19}>隐私政策 & 用户协议</Txt>
            <View style={[s.draft, { backgroundColor: p.bg2, borderColor: p.ink }]}><Txt f="b9" size={10.5}>草案 · 待法务审核</Txt></View>
          </View>
          <View style={[s.box, { backgroundColor: p.bg2, borderColor: p.line }]}>
            {POLICY_DRAFT.map((t, i) => <Txt key={i} f={i ? 'b7' : 'b9'} size={12} color={i ? p.ink : '#C9452F'} style={{ lineHeight: 18, marginTop: i ? 6 : 0 }}>{t}</Txt>)}
          </View>
          <Pressable onPress={() => setAgree(!agree)} style={s.agree}>
            <CBox testID="ob-agree" on={agree} onPress={() => setAgree(!agree)} />
            <Txt f="b8" size={12.5} style={{ flex: 1, lineHeight: 18 }}>我已阅读并同意《隐私政策》和《用户协议》（草案）</Txt>
          </Pressable>
        </FullCard>
        <GoBtn testID="ob-continue" label="同意并继续" disabled={!agree} onPress={acceptConsent} />
        <Pressable onPress={() => showToast('需要同意后才能开始使用哦，数据只存在这台设备')} style={{ alignSelf: 'center', marginTop: 12 }}>
          <Txt f="b8" size={11.5} style={{ opacity: 0.7 }}>不同意</Txt>
        </Pressable>
      </FullPage>
    );
  }
  return (
    <FullPage bg={p.pink} title="宝宝资料" testID="ob-profile">
      <FullHero mood="happy" acc={['flower']} line="先认识一下宝宝吧～" />
      <ProfileForm init={DEFAULT_BABY()} submitLabel="开始记录" onSubmit={b => finishOnboarding(b)} />
      <Txt f="b8" size={11.5} style={{ textAlign: 'center', marginTop: 12, opacity: 0.7, lineHeight: 17 }}>首次使用会放入豆米的演示记录，方便先看看效果{'\n'}可在「我的 › 重置演示数据 / 清空全部数据」处理</Txt>
    </FullPage>
  );
}

const s = StyleSheet.create({
  ttl: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' },
  draft: { borderWidth: 1.5, borderStyle: 'dashed', borderRadius: 99, paddingVertical: 1, paddingHorizontal: 8 },
  box: { marginTop: 10, borderWidth: 2, borderStyle: 'dashed', borderRadius: 16, padding: 12 },
  agree: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 14 },
  avs: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  av: { width: '31%', alignItems: 'center', gap: 2, paddingVertical: 8, borderRadius: 18, borderWidth: 2 },
  avIn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
});
