import { useId } from 'react';

type Tone = 'ok' | 'warning' | 'danger' | 'neutral';

type Props = {
  percent: number;
  tone: Tone;
  size?: number;
  label?: string;
  /** Ex.: "% cota" */
  sublabel?: string;
  /** Anel em espera (sem leitura RPC) — arco suave + pulse */
  idle?: boolean;
};

const STROKE: Record<Tone, string> = {
  ok: '#34d399',
  warning: '#fbbf24',
  danger: '#f87171',
  neutral: '#7dd3fc',
};

export function DashboardRingGauge({
  percent,
  tone,
  size = 88,
  label,
  sublabel,
  idle = false,
}: Props) {
  const uid = useId().replace(/:/g, '');
  const clamped = Math.min(100, Math.max(0, percent));
  const shown = idle ? 22 : clamped;
  const stroke = idle ? 7 : 9;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - shown / 100);
  const strokeColor = STROKE[tone];
  const cx = size / 2;
  const cy = size / 2;
  const glowId = `dashboard-ring-glow-${uid}`;

  return (
    <div
      className={`dashboard-ring${idle ? ' dashboard-ring--idle' : ''} dashboard-ring--${tone}`}
      style={{ width: size, height: size }}
      aria-hidden={!label}
    >
      <svg className="dashboard-ring__svg" height={size} viewBox={`0 0 ${size} ${size}`} width={size}>
        <defs>
          <filter id={glowId} x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="1.6" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <circle
          className="dashboard-ring__track"
          cx={cx}
          cy={cy}
          fill="none"
          r={r}
          strokeWidth={stroke}
        />
        <g className={idle ? 'dashboard-ring__spin' : undefined} style={{ transformOrigin: `${cx}px ${cy}px` }}>
          <circle
            className="dashboard-ring__fill dashboard-ring__fill--animated"
            cx={cx}
            cy={cy}
            fill="none"
            filter={idle ? undefined : `url(#${glowId})`}
            r={r}
            stroke={strokeColor}
            strokeDasharray={c}
            strokeDashoffset={offset}
            strokeLinecap="round"
            strokeWidth={stroke}
            transform={`rotate(-90 ${cx} ${cy})`}
          />
        </g>
      </svg>
      <div className="dashboard-ring__center">
        {label ? <strong className="dashboard-ring__value">{label}</strong> : null}
        {sublabel ? <span className="dashboard-ring__sub">{sublabel}</span> : null}
      </div>
    </div>
  );
}
