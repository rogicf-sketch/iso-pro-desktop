import { Input } from '../../../components/ui/Input';
import { Select } from '../../../components/ui/Select';
import type { RirFiltro } from '../types/qualidade.types';

type Props = {
  filters: RirFiltro;
  onChange: (next: RirFiltro) => void;
};

export function RirFilters({ filters, onChange }: Props) {
  return (
    <div className="filters-grid filters-grid-docs">
      <Input
        label="Buscar RIR"
        onChange={(event) => onChange({ ...filters, busca: event.target.value, page: 1 })}
        placeholder="Nº RIR, fornecedor, NF, procedimento, contrato..."
        value={filters.busca}
      />
      <Select
        label="Status"
        onChange={(event) =>
          onChange({
            ...filters,
            status: event.target.value as RirFiltro['status'],
            page: 1,
          })
        }
        value={filters.status}
      >
        <option value="todos">Todos</option>
        <option value="aberto">Aberto</option>
        <option value="em_analise">Em analise</option>
        <option value="tratado">Tratado</option>
        <option value="cancelado">Cancelado</option>
      </Select>
    </div>
  );
}
