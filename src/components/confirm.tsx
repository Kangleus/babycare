/* 确认面板：沿用 .sheet + .heard + .actions（删除记录 / 退出登录 / 注销账号）
   tip = 首次使用流程里的写法（原型 confirmSheet：.tipline.ob-tip 提示 +「取消」） */
import { useLvAcc } from '@/state/hooks';
import { Actions, Autosave, Btn, Heard, Sheet } from './ui';
import { TipLine } from './health/hui';
import type { Mood } from '@/lib/art';

export type ConfirmOpts = { t: string; sub: string; ok: string; mood?: Mood; note?: string; tip?: boolean; onOk: () => void };
export function ConfirmSheet({ c, onClose }: { c: ConfirmOpts | null; onClose: () => void }) {
  const acc = useLvAcc();
  return (
    <Sheet open={!!c} onClose={onClose} testID="confirm-sheet">
      {c ? (
        <>
          <Heard mood={c.mood ?? (c.tip ? 'shy' : 'worry')} acc={acc} t={c.t} sub={c.sub} />
          {c.tip && c.note ? <TipLine icon="warn" style={{ marginTop: 12 }}>{c.note}</TipLine> : null}
          <Actions mt={c.tip ? 14 : 18}>
            <Btn label={c.tip ? '取消' : '算了'} onPress={onClose} testID="confirm-cancel" />
            <Btn label={c.ok} kind="pink" onPress={() => { const f = c.onOk; onClose(); f(); }} testID="confirm-ok" />
          </Actions>
          {c.note && !c.tip ? <Autosave>{c.note}</Autosave> : null}
        </>
      ) : null}
    </Sheet>
  );
}
