type Tone = 'ok' | 'warning' | 'danger' | 'neutral';

type Props = {
  percent: number;
  tone: Tone;
  size?: number;
  label?: string;
  /** Ex.: "% cota" */
  sublabel?: string;
};

const STROKE: Record<Tone, string> = {
  ok: '#34d399',
  warning: '#fbbf24',
  danger: '#f87171',
  neutral: '#94a3b8',
};

export function DashboardRingGauge({ percent, tone, size = 88, label, sublabel }: Props) {
  const clamped = Math.min(100, Math.max(0, percent));
  const stroke = 8;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - clamped / 100);

  return (
    <div className="dashboard-ring" style={{ width: size, height: size }} aria-hidden={!label}>
      <svg className="dashboard-ring__svg" height={size} viewBox={`0 0 ${size} ${size}`} width={size}>
        <circle
          className="dashboard-ring__track"
          cx={size / 2}
          cy={size / 2}
          fill="none"
          r={r}
          strokeWidth={stroke}
        />
        <circle
          className="dashboard-ring__fill dashboard-ring__fill--animated"
          cx={size / 2}
          cy={size / 2}
          fill="none"
          r={r}
          stroke={STROKE[tone]}
          strokeDasharray={c}
          strokeDashoffset={offset}
          strokeLinecap="round"
          strokeWidth={stroke}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <div className="dashboard-ring__center">
        {label ? <strong className="dashboard-ring__value">{label}</strong> : null}
        {sublabel ? <span className="dashboard-ring__sub">{sublabel}</span> : null}
      </div>
    </div>
  );
}
