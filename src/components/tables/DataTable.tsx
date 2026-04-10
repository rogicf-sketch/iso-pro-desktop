import type { ReactNode } from 'react';

type Column<T> = {
  key: string;
  header: ReactNode;
  render: (item: T) => ReactNode;
};

type Props<T> = {
  columns: Column<T>[];
  items: T[];
  emptyText?: string;
  getRowClassName?: (item: T) => string;
  getRowKey?: (item: T, index: number) => string | number;
};

export function DataTable<T>({
  columns,
  items,
  emptyText = 'Nenhum registro encontrado.',
  getRowClassName,
  getRowKey,
}: Props<T>) {
  return (
    <div className="table-shell">
      <table className="data-table">
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.key}>{column.header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.length ? (
            items.map((item, index) => (
              <tr className={getRowClassName ? getRowClassName(item) : ''} key={getRowKey ? getRowKey(item, index) : index}>
                {columns.map((column) => (
                  <td key={column.key}>{column.render(item)}</td>
                ))}
              </tr>
            ))
          ) : (
            <tr>
              <td className="table-empty" colSpan={columns.length}>
                {emptyText}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
