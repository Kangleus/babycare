import { Page, PTitle, Placeholder } from '@/components/page';
import { useLvAcc } from '@/components/home';

export default function Me() {
  const acc = useLvAcc();
  return (
    <Page>
      <PTitle title="我的" />
      <Placeholder mood="happy" acc={acc} title="宝宝资料 · 家人共享 · 设置" milestone="M2"
        lines={['豆米 · 2026-03-28 出生', '邀请家人：管理员、记录者、只读', '数据导出、隐私与夜间模式']} />
    </Page>
  );
}
