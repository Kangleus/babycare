import { Page, PTitle, Placeholder } from '@/components/page';
import { useApp } from '@/state/app-state';
import { ageText } from '@/lib/time';

export default function Health() {
  const { baby, now } = useApp();
  return (
    <Page>
      <PTitle title="健康" sub={`${(baby?.name ?? '宝宝')} · ${(baby ? ageText(baby.birthday, now, false) : '')} · 只记你说的，不判断病情`} />
      <Placeholder mood="happy" acc={['chart']} title="团团建议 · 提醒 · 病程 · 疫苗体检" milestone="M4"
        lines={['团团建议：根据近期记录给 2–4 条带依据的提示，一键加入提醒', '提醒事项：喂药、疫苗、体检，到点本地通知', '健康档案：体温曲线、用药、症状、就医要点']} />
    </Page>
  );
}
