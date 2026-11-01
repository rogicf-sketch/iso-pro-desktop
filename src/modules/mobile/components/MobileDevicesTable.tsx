import { DataTable } from '../../../components/tables/DataTable';
import { getTableRowClassName } from '../../../components/tables/tableRowState';
import { StatusBadge } from '../../../components/ui/StatusBadge';
import { TableIconButton } from '../../../components/ui/TableIconButton';
import { IconBan, IconLock, IconLockOpen, IconShieldCheck, IconTrash } from '../../../components/ui/TableActionIcons';
import { createStatusMeta } from '../../../components/ui/statusMeta';
import type { MobileDevice } from '../types/mobileDevice.types';

type Props = {
  items: MobileDevice[];
  onAuthorize: (id: string) => void;
  onBlock: (id: string) => void;
  onUnblock: (id: string) => void;
  onRevoke: (id: string) => void;
  onDelete: (id: string) => void;
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

export function MobileDevicesTable({
  items,
  onAuthorize,
  onBlock,
  onUnblock,
  onRevoke,
  onDelete,
  canAdminister,
}: Props) {
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
                  <TableIconButton
                    label={
                      item.status === 'bloqueado'
                        ? 'Autorizar novamente o aparelho bloqueado.'
                        : 'Autorizar aparelho para acesso ao sistema.'
                    }
                    onClick={() => onAuthorize(item.id)}
                    tone="accent"
                  >
                    <IconShieldCheck />
                  </TableIconButton>
                ) : null}
                {item.status !== 'bloqueado' ? (
                  <TableIconButton label="Bloquear acesso do aparelho." onClick={() => onBlock(item.id)} tone="danger">
                    <IconLock />
                  </TableIconButton>
                ) : (
                  <TableIconButton label="Remover bloqueio e voltar para autorizado." onClick={() => onUnblock(item.id)}>
                    <IconLockOpen />
                  </TableIconButton>
                )}
                <TableIconButton
                  label="Retira a autorizacao (fica pendente) e exige nova aprovacao no app."
                  onClick={() => onRevoke(item.id)}
                  tone="danger"
                >
                  <IconBan />
                </TableIconButton>
                <TableIconButton
                  label="Excluir o registo da lista. O aparelho so volta a aparecer se o app se registar de novo."
                  onClick={() => onDelete(item.id)}
                  tone="danger"
                >
                  <IconTrash />
                </TableIconButton>
              </div>
            ) : null,
        },
      ]}
      emptyDescription="Aparelhos aparecem após o primeiro pedido de autorização no app."
      emptyText="Nenhum aparelho encontrado"
      items={items}
    />
  );
}
