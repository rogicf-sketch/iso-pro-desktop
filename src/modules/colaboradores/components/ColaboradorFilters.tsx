import { Input } from '../../../components/ui/Input';
import { Select } from '../../../components/ui/Select';
import type { ColaboradorFiltro } from '../types/colaborador.types';

type Props = {
  filters: ColaboradorFiltro;
  onChange: (next: ColaboradorFiltro) => void;
};

export function ColaboradorFilters({ filters, onChange }: Props) {
  return (
    <div className="filters-grid">
      <Input
        label="Buscar"
        onChange={(event) => onChange({ ...filters, busca: event.target.value, page: 1 })}
        placeholder="Nome, empresa, documento ou telefone"
        value={filters.busca}
      />

      <Select
        label="Tipo"
        onChange={(event) => onChange({ ...filters, tipo: event.target.value as ColaboradorFiltro['tipo'], page: 1 })}
        value={filters.tipo}
      >
        <option value="todos">Todos</option>
        <option value="interno">Internos</option>
        <option value="externo">Externos</option>
      </Select>

      <Select
        label="Status"
        onChange={(event) => onChange({ ...filters, status: event.target.value as ColaboradorFiltro['status'], page: 1 })}
        value={filters.status}
      >
        <option value="todos">Todos</option>
        <option value="ativos">Ativos</option>
        <option value="inativos">Inativos</option>
      </Select>
    </div>
  );
}
