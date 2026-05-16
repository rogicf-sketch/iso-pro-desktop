/** Setas para fora — entrar em tela inteira (navegador). */
export function IconFullscreenEnter({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden
      className={className}
      fill="none"
      height="20"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      viewBox="0 0 24 24"
      width="20"
    >
      <polyline points="15 3 21 3 21 9" />
      <polyline points="9 21 3 21 3 15" />
      <polyline points="21 15 21 21 15 21" />
      <polyline points="3 9 3 3 9 3" />
    </svg>
  );
}

/** Setas para dentro — sair da tela inteira. */
export function IconFullscreenExit({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden
      className={className}
      fill="none"
      height="20"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      viewBox="0 0 24 24"
      width="20"
    >
      <polyline points="8 8 3 3" />
      <polyline points="16 8 21 3" />
      <polyline points="16 16 21 21" />
      <polyline points="8 16 3 21" />
    </svg>
  );
}
