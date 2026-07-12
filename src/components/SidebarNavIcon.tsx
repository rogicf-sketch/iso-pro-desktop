import type { ReactNode } from 'react';

function Svg({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <svg
      aria-hidden
      className={className}
      fill="currentColor"
      height="18"
      viewBox="0 0 24 24"
      width="18"
    >
      {children}
    </svg>
  );
}

/** Ícones filled, estilo uniforme para o menu lateral. */
export function SidebarNavIcon({ to, className }: { to: string; className?: string }) {
  const icon = ICONS[to] ?? ICONS.default;
  return icon(className);
}

const ICONS: Record<string, (className?: string) => ReactNode> = {
  '/dashboard': (c) => (
    <Svg className={c}>
      <path d="M3 3h8v8H3V3zm10 0h8v5h-8V3zM3 13h8v8H3v-8zm10 7h8v-8h-8v8z" />
    </Svg>
  ),
  '/fornecedores': (c) => (
    <Svg className={c}>
      <path d="M3 15.5V17a1 1 0 0 0 1 1h1.05a2.5 2.5 0 0 0 4.9 0h4.1a2.5 2.5 0 0 0 4.9 0H20a1 1 0 0 0 1-1v-1.5H3zm15.5 3.5a1 1 0 1 1 0-2 1 1 0 0 1 0 2zm-11 0a1 1 0 1 1 0-2 1 1 0 0 1 0 2zM20 7h-3.5l-1.2-2.4A1 1 0 0 0 14.4 4H4a1 1 0 0 0-1 1v8.5h17V8a1 1 0 0 0-1-1z" />
    </Svg>
  ),
  '/colaboradores': (c) => (
    <Svg className={c}>
      <path d="M16 11a3 3 0 1 0-3-3 3 3 0 0 0 3 3zM8 11a3 3 0 1 0-3-3 3 3 0 0 0 3 3zm0 2c-2.67 0-8 1.34-8 4v2h10v-2c0-1.47.67-2.61 1.76-3.45C10.55 13.2 9.26 13 8 13zm8 0c-.29 0-.62.02-.97.05A4.86 4.86 0 0 1 16 17v2h8v-2c0-2.66-5.33-4-8-4z" />
    </Svg>
  ),
  '/materiais': (c) => (
    <Svg className={c}>
      <path d="M12 2 2 7l10 5 10-5-10-5zm0 9L2 6v11l10 5 10-5V6l-10 5z" />
    </Svg>
  ),
  '/documentos': (c) => (
    <Svg className={c}>
      <path d="M7 2a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H7zm0 2h10v3H7V4zm0 5h10v2H7V9zm0 4h6v2H7v-2z" />
    </Svg>
  ),
  '/recebimentos': (c) => (
    <Svg className={c}>
      <path d="M11 4v10.17l-3.59-3.58L6 12l6 6 6-6-1.41-1.41L13 14.17V4h-2zM5 20h14v2H5v-2z" />
    </Svg>
  ),
  '/conferencia': (c) => (
    <Svg className={c}>
      <path d="M9.5 16.5 5 12l1.4-1.4 3.1 3.1L17.6 5.6 19 7l-9.5 9.5zm7.1-1.1L18 14l1.4 1.4-2.8 2.8-1.4-1.4 1.4-1.4z" />
    </Svg>
  ),
  '/etiquetas': (c) => (
    <Svg className={c}>
      <path d="M21.4 11.6 12.4 2.6A2 2 0 0 0 11 2H4a2 2 0 0 0-2 2v7a2 2 0 0 0 .6 1.4l9 9a2 2 0 0 0 2.8 0l7-7a2 2 0 0 0 0-2.8zM6.5 8A1.5 1.5 0 1 1 8 6.5 1.5 1.5 0 0 1 6.5 8z" />
    </Svg>
  ),
  '/atendimento': (c) => (
    <Svg className={c}>
      <path d="M9 3v2h4.17l-7.58 7.59L7 14l7.59-7.59V11h2V3H9zm-4 14v2h14v-2H5z" />
    </Svg>
  ),
  '/inventario': (c) => (
    <Svg className={c}>
      <path d="M7 2h10a2 2 0 0 1 2 2v16l-3-2-2 2-2-2-2 2-2-2-3 2V4a2 2 0 0 1 2-2zm2 5v2h6V7H9zm0 4v2h6v-2H9zm0 4v2h4v-2H9z" />
    </Svg>
  ),
  /** Guindaste — Equipamentos da obra */
  '/equipamentos': (c) => (
    <Svg className={c}>
      <path d="M14 3h2l1 3h3v2h-1.2L17 14h-2.3l1.2-4H14V3zM3 9h9v2H8.8l.7 3H12v2H3v-2h2.5L4.8 11H3V9zm1 9h2v3H4v-3zm4 0h2v3H8v-3zm4 0h2v3h-2v-3zm4 0h2v3h-2v-3zM2 16h20v2H2v-2z" />
    </Svg>
  ),
  '/rir': (c) => (
    <Svg className={c}>
      <path d="M6 2h9l5 5v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zm8 1.5V8h4.5L14 3.5zM8 12l2.5 2.5L16 9l-1.4-1.4-4.1 4.1-1.1-1.1L8 12z" />
    </Svg>
  ),
  '/rnc': (c) => (
    <Svg className={c}>
      <path d="M12 2 1 21h22L12 2zm0 4.5 7.2 12.5H4.8L12 6.5zM11 10v5h2v-5h-2zm0 6v2h2v-2h-2z" />
    </Svg>
  ),
  '/relatorios': (c) => (
    <Svg className={c}>
      <path d="M4 20h16v2H4v-2zM6 10h3v8H6v-8zm5-4h3v12h-3V6zm5 7h3v5h-3v-5z" />
    </Svg>
  ),
  '/relatorio-fotografico': (c) => (
    <Svg className={c}>
      <path d="M9 3 7.2 5H4a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-3.2L15 3H9zm3 5a5 5 0 1 1 0 10 5 5 0 0 1 0-10zm0 2a3 3 0 1 0 0 6 3 3 0 0 0 0-6z" />
    </Svg>
  ),
  '/mobile': (c) => (
    <Svg className={c}>
      <path d="M8 2h8a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zm2 17h4v1h-4v-1zM8 4v13h8V4H8z" />
    </Svg>
  ),
  '/usuarios': (c) => (
    <Svg className={c}>
      <path d="M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4zm0 2c-3.3 0-10 1.7-10 5v2h12.1a6 6 0 0 1-.1-1 6 6 0 0 1 6.9-5.9C18.4 12.7 15.1 14 12 14zm7 2a1 1 0 0 0-1 1v1h-1a1 1 0 0 0 0 2h1v1a1 1 0 0 0 2 0v-1h1a1 1 0 0 0 0-2h-1v-1a1 1 0 0 0-1-1z" />
    </Svg>
  ),
  '/licencas-desktop': (c) => (
    <Svg className={c}>
      <path d="M12.7 2.3a1 1 0 0 0-1.4 0l-9 9a1 1 0 0 0 0 1.4l9 9a1 1 0 0 0 1.4 0l9-9a1 1 0 0 0 0-1.4l-9-9zM8.5 13.5A2.5 2.5 0 1 1 11 11a2.5 2.5 0 0 1-2.5 2.5z" />
    </Svg>
  ),
  '/configuracoes': (c) => (
    <Svg className={c}>
      <path d="M19.1 12.9a7.5 7.5 0 0 0 .1-.9 7.5 7.5 0 0 0-.1-.9l2-1.6a.5.5 0 0 0 .1-.6l-1.9-3.3a.5.5 0 0 0-.6-.2l-2.4 1a7 7 0 0 0-1.6-.9l-.4-2.5a.5.5 0 0 0-.5-.4h-3.8a.5.5 0 0 0-.5.4l-.4 2.5a7 7 0 0 0-1.6.9l-2.4-1a.5.5 0 0 0-.6.2L2.7 8.9a.5.5 0 0 0 .1.6l2 1.6a7.5 7.5 0 0 0-.1.9 7.5 7.5 0 0 0 .1.9l-2 1.6a.5.5 0 0 0-.1.6l1.9 3.3a.5.5 0 0 0 .6.2l2.4-1a7 7 0 0 0 1.6.9l.4 2.5a.5.5 0 0 0 .5.4h3.8a.5.5 0 0 0 .5-.4l.4-2.5a7 7 0 0 0 1.6-.9l2.4 1a.5.5 0 0 0 .6-.2l1.9-3.3a.5.5 0 0 0-.1-.6l-2-1.6zM12 15.5A3.5 3.5 0 1 1 15.5 12 3.5 3.5 0 0 1 12 15.5z" />
    </Svg>
  ),
  default: (c) => (
    <Svg className={c}>
      <circle cx="12" cy="12" r="8" />
    </Svg>
  ),
};
