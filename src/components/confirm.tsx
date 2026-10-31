/* 确认面板：沿用 .sheet + .heard + .actions（删除 / 重置 / 清空） */
import { useLvAcc } from '@/state/hooks';
import { Actions, Autosave, Btn, Heard, Sheet } from './ui';
import type { Mood } from '@/lib/art';

export type ConfirmOpts = { t: string; sub: string; ok: string; mood?: Mood; note?: string; onOk: () => void };
export function ConfirmSheet({ c, onClose }: { c: ConfirmOpts | null; onClose: () => void }) {
  const acc = useLvAcc();
  return (
    <Sheet open={!!c} onClose={onClose} testID="confirm-sheet">
      {c ? (
        <>
          <Heard mood={c.mood ?? 'worry'} acc={acc} t={c.t} sub={c.sub} />
          <Actions mt={18}>
            <Btn label="算了" onPress={onClose} testID="confirm-cancel" />
            <Btn label={c.ok} kind="pink" onPress={() => { const f = c.onOk; onClose(); f(); }} testID="confirm-ok" />
          </Actions>
          {c.note ? <Autosave>{c.note}</Autosave> : null}
        </>
      ) : null}
    </Sheet>
  );
}
