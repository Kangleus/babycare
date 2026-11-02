import { AskPage } from '@/components/ask';
import { useApp } from '@/state/app-state';

export default function Ai() {
  const { openSummary } = useApp();
  return <AskPage onSummary={aud => openSummary(aud)} />;
}
