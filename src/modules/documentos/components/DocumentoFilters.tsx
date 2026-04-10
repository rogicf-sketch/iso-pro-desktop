import { Input } from '../../../components/ui/Input';
import { Select } from '../../../components/ui/Select';
import type { DocumentoFiltro } from '../types/documento.types';

type Props = {
  filters: DocumentoFiltro;
  onChange: (next: DocumentoFiltro) => void;
};

export function DocumentoFilters({ filters, onChange }: Props) {
  return (
    <div className="filters-grid filters-grid-docs">
      <Input
        label="Busca"
        onChange={(event) => onChange({ ...filters, busca: event.target.value, page: 1 })}
        placeholder="Numero, descricao ou responsavel"
        value={filters.busca}
      />

      <Select
        label="Status"
        onChange={(event) => onChange({ ...filters, status: event.target.value as DocumentoFiltro['status'], page: 1 })}
        value={filters.status}
      >
        <option value="todos">Todos</option>
        <option value="pendente">Pendente</option>
        <option value="parcial">Parcial</option>
        <option value="recebido">Recebido</option>
        <option value="atendido">Atendido</option>
        <option value="cancelado">Cancelado</option>
      </Select>
    </div>
  );
}
