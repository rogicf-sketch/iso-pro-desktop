import { Input } from '../../../components/ui/Input';
import { Select } from '../../../components/ui/Select';
import type { InventarioFiltro } from '../types/inventario.types';

type Props = {
  filters: InventarioFiltro;
  onChange: (next: InventarioFiltro) => void;
};

export function InventarioFilters({ filters, onChange }: Props) {
  return (
    <div className="filters-grid filters-grid-docs">
      <Input
        label="Buscar inventario"
        onChange={(event) => onChange({ ...filters, busca: event.target.value, page: 1 })}
        placeholder="Codigo, descricao ou responsavel"
        value={filters.busca}
      />
      <Select
        label="Status"
        onChange={(event) =>
          onChange({
            ...filters,
            status: event.target.value as InventarioFiltro['status'],
            page: 1,
          })
        }
        value={filters.status}
      >
        <option value="todos">Todos</option>
        <option value="aberto">Abertos</option>
        <option value="fechado">Fechados</option>
        <option value="cancelado">Cancelados</option>
      </Select>
    </div>
  );
}
