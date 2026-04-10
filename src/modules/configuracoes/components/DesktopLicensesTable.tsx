import { DataTable } from '../../../components/tables/DataTable';
import { getTableRowClassName } from '../../../components/tables/tableRowState';
import { ActionButton } from '../../../components/ui/ActionButton';
import { StatusBadge } from '../../../components/ui/StatusBadge';
import type { DesktopLicenseRegistryItem } from '../types/desktop-license-registry.types';

type Props = {
  items: DesktopLicenseRegistryItem[];
  canAdminister: boolean;
  onRevoke: (item: DesktopLicenseRegistryItem) => void;
  onRestore: (item: DesktopLicenseRegistryItem) => void;
};

function formatDate(value: string) {
  if (!value) return '-';
  return new Date(value).toLocaleString('pt-BR');
}

export function DesktopLicensesTable({ items, canAdminister, onRevoke, onRestore }: Props) {
  return (
    <DataTable
      getRowClassName={(item) => getTableRowClassName(item.status === 'revoked' ? 'critical' : 'normal')}
      columns={[
        {
          key: 'licenca',
          header: 'Licenca',
          render: (item) => (
            <div>
              <strong>{item.issuedTo}</strong>
              <div className="panel-copy">{item.licenseId}</div>
            </div>
          ),
        },
        {
          key: 'maquina',
          header: 'Maquina',
          render: (item) => (
            <div>
              <strong>{item.machineLabel || 'Equipamento sem nome'}</strong>
              <div className="panel-copy">{item.machineFingerprint}</div>
            </div>
          ),
        },
        {
          key: 'versao',
          header: 'Versao',
          render: (item) => item.appVersion || '-',
        },
        {
          key: 'status',
          header: 'Status',
          render: (item) => <StatusBadge text={item.status === 'revoked' ? 'Revogada' : 'Ativa'} tone={item.status === 'revoked' ? 'danger' : 'ok'} />,
        },
        {
          key: 'datas',
          header: 'Datas',
          render: (item) => (
            <div>
              <div>Emitida: {formatDate(item.emitidaEm)}</div>
              <div>Expira: {formatDate(item.expiraEm)}</div>
              <div>Revogada: {formatDate(item.revogadaEm)}</div>
            </div>
          ),
        },
        {
          key: 'motivo',
          header: 'Motivo',
          render: (item) => item.motivoRevogacao || '-',
        },
        {
          key: 'acoes',
          header: 'Acoes',
          render: (item) =>
            canAdminister ? (
              <div className="table-actions">
                {item.status === 'active' ? (
                  <ActionButton enabledLabel="Revogar" enabledTitle="Revogar licenca desktop centralmente." onClick={() => onRevoke(item)} variant="danger" />
                ) : (
                  <ActionButton enabledLabel="Reativar" enabledTitle="Reativar licenca desktop centralmente." onClick={() => onRestore(item)} variant="ghost" />
                )}
              </div>
            ) : null,
        },
      ]}
      emptyText="Nenhuma licenca desktop registrada."
      items={items}
    />
  );
}
