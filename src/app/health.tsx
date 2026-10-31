import { Page, PTitle, Placeholder } from '@/components/page';
import { BABY, ageText } from '@/data/mock';

export default function Health() {
  return (
    <Page>
      <PTitle title="健康" sub={`${BABY.name} · ${ageText().split(' · ')[0]} · 只记你说的，不判断病情`} />
      <Placeholder mood="happy" acc={['chart']} title="团团建议 · 提醒 · 病程 · 疫苗体检" milestone="M4"
        lines={['团团建议：根据近期记录给 2–4 条带依据的提示，一键加入提醒', '提醒事项：喂药、疫苗、体检，到点本地通知', '健康档案：体温曲线、用药、症状、就医要点']} />
    </Page>
  );
}
