import { Input } from '../../../components/ui/Input';
import { Select } from '../../../components/ui/Select';
import type { ConferenciaFiltro } from '../types/conferencia.types';

type Props = {
  filters: ConferenciaFiltro;
  onChange: (next: ConferenciaFiltro) => void;
};

export function ConferenciaFilters({ filters, onChange }: Props) {
  return (
    <div className="filters-grid">
      <Input label="Buscar" onChange={(event) => onChange({ ...filters, busca: event.target.value, page: 1 })} placeholder="Fornecedor, NF ou romaneio" value={filters.busca} />
      <Select label="Status" onChange={(event) => onChange({ ...filters, status: event.target.value as ConferenciaFiltro['status'], page: 1 })} value={filters.status}>
        <option value="todos">Todos</option>
        <option value="aguardando_conferencia">Aguardando conferencia</option>
        <option value="parcialmente_conferido">Parcialmente conferido</option>
        <option value="divergente">Divergente</option>
        <option value="conferido">Conferido</option>
      </Select>
    </div>
  );
}
