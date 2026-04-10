export type TableRowState = 'normal' | 'warning' | 'critical';

export function getTableRowClassName(state: TableRowState) {
  if (state === 'critical') return 'table-row-critical';
  if (state === 'warning') return 'table-row-warning';
  return '';
}
