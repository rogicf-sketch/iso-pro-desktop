/** Ícones lineares 16px — ações densas de tabela (padrão ERP). */

type IconProps = { className?: string };

const svgProps = {
  'aria-hidden': true as const,
  fill: 'none',
  height: 16,
  stroke: 'currentColor',
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  strokeWidth: 1.75,
  viewBox: '0 0 24 24',
  width: 16,
};

export function IconEye({ className }: IconProps) {
  return (
    <svg {...svgProps} className={className}>
      <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

export function IconPencil({ className }: IconProps) {
  return (
    <svg {...svgProps} className={className}>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}

export function IconTrash({ className }: IconProps) {
  return (
    <svg {...svgProps} className={className}>
      <path d="M3 6h18" />
      <path d="M8 6V4h8v2" />
      <path d="M19 6l-1 14H6L5 6" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
    </svg>
  );
}

export function IconBan({ className }: IconProps) {
  return (
    <svg {...svgProps} className={className}>
      <circle cx="12" cy="12" r="9" />
      <path d="M5.5 5.5 18.5 18.5" />
    </svg>
  );
}

export function IconRefresh({ className }: IconProps) {
  return (
    <svg {...svgProps} className={className}>
      <path d="M21 12a9 9 0 1 1-2.6-6.4" />
      <path d="M21 3v6h-6" />
    </svg>
  );
}

export function IconPlus({ className }: IconProps) {
  return (
    <svg {...svgProps} className={className}>
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </svg>
  );
}

export function IconList({ className }: IconProps) {
  return (
    <svg {...svgProps} className={className}>
      <path d="M8 6h13" />
      <path d="M8 12h13" />
      <path d="M8 18h13" />
      <path d="M3 6h.01" />
      <path d="M3 12h.01" />
      <path d="M3 18h.01" />
    </svg>
  );
}

export function IconCheck({ className }: IconProps) {
  return (
    <svg {...svgProps} className={className}>
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

export function IconPrinter({ className }: IconProps) {
  return (
    <svg {...svgProps} className={className}>
      <path d="M6 9V3h12v6" />
      <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
      <path d="M6 14h12v8H6z" />
    </svg>
  );
}

export function IconLockOpen({ className }: IconProps) {
  return (
    <svg {...svgProps} className={className}>
      <path d="M7 11V7a5 5 0 0 1 9.9-1" />
      <rect height="11" rx="2" width="18" x="3" y="11" />
    </svg>
  );
}

export function IconLock({ className }: IconProps) {
  return (
    <svg {...svgProps} className={className}>
      <rect height="11" rx="2" width="18" x="3" y="11" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}

export function IconDownload({ className }: IconProps) {
  return (
    <svg {...svgProps} className={className}>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <path d="m7 10 5 5 5-5" />
      <path d="M12 15V3" />
    </svg>
  );
}

export function IconShieldCheck({ className }: IconProps) {
  return (
    <svg {...svgProps} className={className}>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}

export function IconFolderOpen({ className }: IconProps) {
  return (
    <svg {...svgProps} className={className}>
      <path d="m6 14 1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2" />
    </svg>
  );
}

export function IconUndo({ className }: IconProps) {
  return (
    <svg {...svgProps} className={className}>
      <path d="M3 7v6h6" />
      <path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6.7 2.9L3 13" />
    </svg>
  );
}
