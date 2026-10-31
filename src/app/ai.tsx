import { Page, PTitle, Placeholder } from '@/components/page';
import { useApp } from '@/state/app-state';

export default function Ai() {
  const { baby } = useApp();
  return (
    <Page>
      <PTitle title="问团子" sub={`只看${(baby?.name ?? '宝宝')}的记录回答 · 演示`} />
      <Placeholder acc={['book']} title="基于自家记录的 AI 问答" milestone="M5"
        lines={['数字由代码算，团团只负责说成人话', '一键摘要：给家人或医生', '风险问题固定提示就医，不诊断、不给剂量']} />
    </Page>
  );
}
