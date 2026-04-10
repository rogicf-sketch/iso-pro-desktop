export type StatusTone = 'ok' | 'warning' | 'danger' | 'neutral';

export type StatusMeta = {
  text: string;
  tone: StatusTone;
};

export function createStatusMeta(text: string, tone: StatusTone): StatusMeta {
  return { text, tone };
}
