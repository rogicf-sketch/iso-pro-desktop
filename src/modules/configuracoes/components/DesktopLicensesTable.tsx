import { DataTable } from '../../../components/tables/DataTable';
import { getTableRowClassName } from '../../../components/tables/tableRowState';
import { StatusBadge } from '../../../components/ui/StatusBadge';
import { TableIconButton } from '../../../components/ui/TableIconButton';
import { IconBan, IconRefresh } from '../../../components/ui/TableActionIcons';
import type { DesktopLicenseRegistryItem } from '../types/desktop-license-registry.types';

type Props = {
  items: DesktopLicenseRegistryItem[];
  canAdminister: boolean;
  showTenant?: boolean;
  onRevoke: (item: DesktopLicenseRegistryItem) => void;
  onRestore: (item: DesktopLicenseRegistryItem) => void;
};

function formatDate(value: string) {
  if (!value) return '-';
  return new Date(value).toLocaleString('pt-BR');
}

export function DesktopLicensesTable({ items, canAdminister, showTenant = false, onRevoke, onRestore }: Props) {
  return (
    <DataTable
      getRowClassName={(item) => getTableRowClassName(item.status === 'revoked' ? 'critical' : 'normal')}
      columns={[
        ...(showTenant
          ? [
              {
                key: 'empresa',
                header: 'Empresa',
                render: (item: DesktopLicenseRegistryItem) => (
                  <div>
                    <strong>{item.tenantName || '—'}</strong>
                    <div className="panel-copy">{item.tenantSlug || item.tenantId || ''}</div>
                  </div>
                ),
              },
            ]
          : []),
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
                  <TableIconButton
                    label="Revogar licenca desktop centralmente."
                    onClick={() => onRevoke(item)}
                    tone="danger"
                  >
                    <IconBan />
                  </TableIconButton>
                ) : (
                  <TableIconButton
                    label="Reativar licenca desktop centralmente."
                    onClick={() => onRestore(item)}
                  >
                    <IconRefresh />
                  </TableIconButton>
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
