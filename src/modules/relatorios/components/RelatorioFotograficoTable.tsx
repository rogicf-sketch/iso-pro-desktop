import { DataTable } from '../../../components/tables/DataTable';
import { TableIconButton } from '../../../components/ui/TableIconButton';
import { IconEye, IconPencil, IconTrash } from '../../../components/ui/TableActionIcons';
import type { RelatorioFotograficoMeta } from '../types/relatorioFotografico.types';

type Props = {
  items: RelatorioFotograficoMeta[];
  canEdit: boolean;
  previewId: string | null;
  onVisualizar: (item: RelatorioFotograficoMeta) => void;
  onEdit: (item: RelatorioFotograficoMeta) => void;
  onExcluir: (item: RelatorioFotograficoMeta) => void;
  formatSalvo: (iso: string) => string;
};

export function RelatorioFotograficoTable({
  items,
  canEdit,
  previewId,
  onVisualizar,
  onEdit,
  onExcluir,
  formatSalvo,
}: Props) {
  return (
    <DataTable
      getRowKey={(item) => item.id}
      columns={[
        {
          key: 'numero',
          header: 'Nº',
          render: (item) => item.numeroRelatorio.trim() || '—',
        },
        {
          key: 'titulo',
          header: 'Título',
          render: (item) => item.titulo,
        },
        {
          key: 'fotos',
          header: 'Fotos',
          render: (item) => item.fotoCount,
        },
        {
          key: 'atualizado',
          header: 'Atualizado',
          render: (item) => formatSalvo(item.salvoEm),
        },
        {
          key: 'acoes',
          header: 'Ações',
          render: (item) => (
            <div className="table-actions">
              <TableIconButton
                disabled={previewId === item.id}
                label={
                  previewId === item.id
                    ? 'A abrir pré-visualização…'
                    : 'Pré-visualizar relatório fotográfico'
                }
                onClick={() => onVisualizar(item)}
              >
                <IconEye />
              </TableIconButton>
              {canEdit ? (
                <TableIconButton label="Editar relatório fotográfico" onClick={() => onEdit(item)}>
                  <IconPencil />
                </TableIconButton>
              ) : null}
              {canEdit ? (
                <TableIconButton
                  label="Excluir relatório fotográfico"
                  onClick={() => onExcluir(item)}
                  tone="danger"
                >
                  <IconTrash />
                </TableIconButton>
              ) : null}
            </div>
          ),
        },
      ]}
      emptyDescription="Crie um relatório ou ajuste a busca."
      emptyText="Nenhum relatório fotográfico encontrado"
      items={items}
    />
  );
}
