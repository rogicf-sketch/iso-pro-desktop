import { useId, useMemo } from 'react';

type Tone = 'ok' | 'warning' | 'danger' | 'neutral';

type Props = {
  percent: number;
  tone: Tone;
  size?: number;
  /** Só com leitura real — nunca inventar percentagem */
  hasData?: boolean;
  /** A ler (arco curto a girar; fill 0) */
  waiting?: boolean;
};

const STROKE: Record<Tone, string> = {
  ok: '#22d3ee',
  warning: '#fbbf24',
  danger: '#f87171',
  neutral: '#64748b',
};

const TICK_COUNT = 36;

export function DashboardRingGauge({
  percent,
  tone,
  size = 96,
  hasData = false,
  waiting = false,
}: Props) {
  const uid = useId().replace(/:/g, '');
  const clamped = hasData ? Math.min(100, Math.max(0, percent)) : 0;
  const stroke = 8;
  const tickOuter = size / 2 - 2;
  const tickInner = tickOuter - 5;
  const r = (size - stroke) / 2 - 8;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - clamped / 100);
  const strokeColor = STROKE[tone];
  const cx = size / 2;
  const cy = size / 2;
  const glowId = `dashboard-ring-glow-${uid}`;
  const gradId = `dashboard-ring-grad-${uid}`;

  const ticks = useMemo(() => {
    const items: { x1: number; y1: number; x2: number; y2: number }[] = [];
    for (let i = 0; i < TICK_COUNT; i++) {
      const a = (i / TICK_COUNT) * Math.PI * 2 - Math.PI / 2;
      items.push({
        x1: cx + Math.cos(a) * tickInner,
        y1: cy + Math.sin(a) * tickInner,
        x2: cx + Math.cos(a) * tickOuter,
        y2: cy + Math.sin(a) * tickOuter,
      });
    }
    return items;
  }, [cx, cy, tickInner, tickOuter]);

  const centerLabel = hasData ? `${Math.round(clamped)}%` : waiting ? '…' : '—';

  return (
    <div
      className={`dashboard-ring dashboard-ring--meter${waiting ? ' dashboard-ring--waiting' : ''}${hasData ? '' : ' dashboard-ring--empty'} dashboard-ring--${tone}`}
      style={{ width: size, height: size }}
      aria-hidden
    >
      <svg className="dashboard-ring__svg" height={size} viewBox={`0 0 ${size} ${size}`} width={size}>
        <defs>
          <linearGradient id={gradId} x1="0%" x2="100%" y1="0%" y2="100%">
            <stop offset="0%" stopColor="#38bdf8" />
            <stop offset="100%" stopColor={strokeColor} />
          </linearGradient>
          <filter id={glowId} x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="1.4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        {ticks.map((t, i) => (
          <line
            key={i}
            className="dashboard-ring__tick"
            strokeLinecap="round"
            x1={t.x1}
            x2={t.x2}
            y1={t.y1}
            y2={t.y2}
          />
        ))}
        <circle
          className="dashboard-ring__track"
          cx={cx}
          cy={cy}
          fill="none"
          r={r}
          strokeWidth={stroke}
        />
        {hasData ? (
          <circle
            className="dashboard-ring__fill dashboard-ring__fill--animated"
            cx={cx}
            cy={cy}
            fill="none"
            filter={`url(#${glowId})`}
            r={r}
            stroke={`url(#${gradId})`}
            strokeDasharray={c}
            strokeDashoffset={offset}
            strokeLinecap="round"
            strokeWidth={stroke}
            transform={`rotate(-90 ${cx} ${cy})`}
          />
        ) : null}
        {waiting && !hasData ? (
          <g className="dashboard-ring__spin" style={{ transformOrigin: `${cx}px ${cy}px` }}>
            <circle
              className="dashboard-ring__fill"
              cx={cx}
              cy={cy}
              fill="none"
              r={r}
              stroke={strokeColor}
              strokeDasharray={`${c * 0.2} ${c}`}
              strokeDashoffset={0}
              strokeLinecap="round"
              strokeWidth={stroke}
              transform={`rotate(-90 ${cx} ${cy})`}
              opacity={0.65}
            />
          </g>
        ) : null}
      </svg>
      <div className="dashboard-ring__center">
        {hasData ? <span className="dashboard-ring__kicker">Uso</span> : null}
        <strong className="dashboard-ring__value">{centerLabel}</strong>
      </div>
    </div>
  );
}
