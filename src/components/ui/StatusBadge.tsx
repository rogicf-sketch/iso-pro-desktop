import type { StatusTone } from './statusMeta';

type Props = {
  tone: StatusTone;
  text: string;
};

export function StatusBadge({ tone, text }: Props) {
  return <span className={`status-badge status-${tone}`}>{text}</span>;
}
