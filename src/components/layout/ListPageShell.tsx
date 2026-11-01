import type { ReactNode } from 'react';

export type ListPageShellProps = {
  /** Classes no contentor exterior (`panel …` se `asPanel`, senão wrapper embutido). */
  className?: string;
  /** `true` (omissão): `.panel`. `false`: só slots (ex.: lista do Histórico). */
  asPanel?: boolean;
  /** Conteúdo de `.panel-toolbar` (grupos de acções). */
  toolbar?: ReactNode;
  /** Tipicamente `div.panel-tabs`. */
  tabs?: ReactNode;
  /** ModuleHelp, FonteDadosNotice, avisos — acima dos filtros. */
  notices?: ReactNode;
  /** Deve renderizar um `.filters-grid` (filho directo do painel para sticky). */
  filters?: ReactNode;
  /** Barras de selecção em lote, meta, etc. */
  beforeTable?: ReactNode;
  /** Tabela (`DataTable` → `.table-shell`). */
  children?: ReactNode;
  pagination?: ReactNode;
};

/**
 * Object-page de lista (espírito Fiori): toolbar + tabs + filtros flat + tabela + paginação.
 * Slots saem como filhos directos do painel para o CSS sticky de listas funcionar.
 */
export function ListPageShell({
  className,
  asPanel = true,
  toolbar,
  tabs,
  notices,
  filters,
  beforeTable,
  children,
  pagination,
}: ListPageShellProps) {
  const listSlots = (
    <>
      {filters}
      {beforeTable}
      {children}
      {pagination}
    </>
  );

  if (!asPanel) {
    if (!className) return listSlots;
    return <div className={className}>{listSlots}</div>;
  }

  return (
    <div className={['panel', className].filter(Boolean).join(' ')}>
      {toolbar != null ? (
        <div className="panel-header panel-header--toolbar panel-header--actions-only">
          <div className="panel-toolbar">{toolbar}</div>
        </div>
      ) : null}
      {tabs}
      {notices}
      {listSlots}
    </div>
  );
}

type PanelToolbarGroupProps = {
  label: string;
  'aria-label'?: string;
  children: ReactNode;
};

/** Grupo padrão da toolbar (label + botões). */
export function PanelToolbarGroup({ label, 'aria-label': ariaLabel, children }: PanelToolbarGroupProps) {
  return (
    <div className="panel-toolbar__group" role="group" aria-label={ariaLabel ?? label}>
      <span className="panel-toolbar__label">{label}</span>
      <div className="panel-toolbar__buttons">{children}</div>
    </div>
  );
}
