import { Input } from '../../../components/ui/Input';
import { Select } from '../../../components/ui/Select';
import type { RecebimentoFiltro } from '../types/recebimento.types';

type Props = {
  filters: RecebimentoFiltro;
  onChange: (next: RecebimentoFiltro) => void;
};

export function RecebimentoFilters({ filters, onChange }: Props) {
  return (
    <div className="filters-grid">
      <Input
        label="Busca"
        onChange={(event) => onChange({ ...filters, busca: event.target.value, page: 1 })}
        placeholder="Fornecedor, NF ou romaneio"
        value={filters.busca}
      />

      <Select
        label="Status"
        onChange={(event) => onChange({ ...filters, status: event.target.value as RecebimentoFiltro['status'], page: 1 })}
        value={filters.status}
      >
        <option value="todos">Todos</option>
        <option value="rascunho">Rascunho</option>
        <option value="aguardando_conferencia">Aguardando conferencia</option>
        <option value="conferido">Conferido</option>
        <option value="parcialmente_conferido">Parcialmente conferido</option>
        <option value="divergente">Divergente</option>
        <option value="cancelado">Cancelado</option>
      </Select>

      <Select
        label="Modo"
        onChange={(event) => onChange({ ...filters, modo: event.target.value as RecebimentoFiltro['modo'], page: 1 })}
        value={filters.modo}
      >
        <option value="todos">Todos</option>
        <option value="direto">Direto</option>
        <option value="aguardando_conferencia">Aguardando conferencia</option>
      </Select>
    </div>
  );
}
