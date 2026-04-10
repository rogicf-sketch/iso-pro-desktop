import { DataTable } from '../../../components/tables/DataTable';
import { getTableRowClassName } from '../../../components/tables/tableRowState';
import { ActionButton } from '../../../components/ui/ActionButton';
import { StatusBadge } from '../../../components/ui/StatusBadge';
import { createStatusMeta } from '../../../components/ui/statusMeta';
import type { MobileDevice } from '../types/mobileDevice.types';

type Props = {
  items: MobileDevice[];
  onAuthorize: (id: string) => void;
  onBlock: (id: string) => void;
  onUnblock: (id: string) => void;
  onRevoke: (id: string) => void;
  canAdminister: boolean;
};

function formatDate(value: string) {
  return new Date(value).toLocaleString('pt-BR');
}

function getStatusMeta(status: MobileDevice['status']) {
  if (status === 'autorizado') return createStatusMeta('Autorizado', 'ok');
  if (status === 'bloqueado') return createStatusMeta('Bloqueado', 'danger');
  return createStatusMeta('Pendente', 'warning');
}

export function MobileDevicesTable({ items, onAuthorize, onBlock, onUnblock, onRevoke, canAdminister }: Props) {
  return (
    <DataTable
      getRowClassName={(item) =>
        getTableRowClassName(item.status === 'bloqueado' ? 'critical' : item.status === 'pendente' ? 'warning' : 'normal')
      }
      columns={[
        {
          key: 'aparelho',
          header: 'Aparelho',
          render: (item) => (
            <div>
              <strong>{item.nomeAparelho}</strong>
              <div className="panel-copy">
                {item.modelo} · {item.plataforma} · app {item.versaoApp}
              </div>
            </div>
          ),
        },
        {
          key: 'usuario',
          header: 'Usuario',
          render: (item) => (
            <div>
              <strong>{item.usuarioNome}</strong>
              <div className="panel-copy">{item.usuarioLogin}</div>
            </div>
          ),
        },
        {
          key: 'deviceId',
          header: 'Device ID',
          render: (item) => item.deviceId,
        },
        {
          key: 'status',
          header: 'Status',
          render: (item) => {
            const meta = getStatusMeta(item.status);
            return <StatusBadge text={meta.text} tone={meta.tone} />;
          },
        },
        {
          key: 'ultimoAcesso',
          header: 'Ultimo acesso',
          render: (item) => formatDate(item.ultimoAcessoEm),
        },
        {
          key: 'acoes',
          header: 'Acoes',
          render: (item) =>
            canAdminister ? (
              <div className="table-actions">
                {item.status !== 'autorizado' ? (
                  <ActionButton
                    onClick={() => onAuthorize(item.id)}
                    enabledLabel={item.status === 'bloqueado' ? 'Autorizar novamente' : 'Autorizar'}
                    enabledTitle={
                      item.status === 'bloqueado'
                        ? 'Autorizar novamente o aparelho bloqueado.'
                        : 'Autorizar aparelho para acesso ao sistema.'
                    }
                    variant="primary"
                  />
                ) : null}
                {item.status !== 'bloqueado' ? (
                  <ActionButton enabledLabel="Bloquear" enabledTitle="Bloquear acesso do aparelho." onClick={() => onBlock(item.id)} variant="danger" />
                ) : (
                  <ActionButton enabledLabel="Desbloquear" enabledTitle="Remover bloqueio e voltar para autorizado." onClick={() => onUnblock(item.id)} variant="ghost" />
                )}
                <ActionButton enabledLabel="Revogar" enabledTitle="Revogar o vinculo e exigir nova autorizacao." onClick={() => onRevoke(item.id)} variant="ghost" />
              </div>
            ) : null,
        },
      ]}
      emptyText="Nenhum aparelho encontrado."
      items={items}
    />
  );
}
