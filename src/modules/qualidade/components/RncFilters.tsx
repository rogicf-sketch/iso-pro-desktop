import { Input } from '../../../components/ui/Input';
import { Select } from '../../../components/ui/Select';
import type { RncFiltro } from '../types/qualidade.types';

type Props = {
  filters: RncFiltro;
  onChange: (next: RncFiltro) => void;
};

export function RncFilters({ filters, onChange }: Props) {
  return (
    <div className="filters-grid filters-grid-docs">
      <Input
        label="Buscar RNC"
        onChange={(event) => onChange({ ...filters, busca: event.target.value, page: 1 })}
        placeholder="Codigo, setor, responsavel..."
        value={filters.busca}
      />
      <Select
        label="Status"
        onChange={(event) =>
          onChange({
            ...filters,
            status: event.target.value as RncFiltro['status'],
            page: 1,
          })
        }
        value={filters.status}
      >
        <option value="todos">Todos</option>
        <option value="aberto">Aberto</option>
        <option value="em_tratativa">Em tratativa</option>
        <option value="concluido">Concluido</option>
        <option value="cancelado">Cancelado</option>
      </Select>
    </div>
  );
}
