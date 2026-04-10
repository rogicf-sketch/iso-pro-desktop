import { Input } from '../../../components/ui/Input';
import { Select } from '../../../components/ui/Select';
import type { FornecedorFiltro } from '../types/fornecedor.types';

type Props = {
  filters: FornecedorFiltro;
  onChange: (next: FornecedorFiltro) => void;
};

export function FornecedorFilters({ filters, onChange }: Props) {
  return (
    <div className="filters-grid">
      <Input
        label="Buscar"
        onChange={(event) => onChange({ ...filters, busca: event.target.value, page: 1 })}
        placeholder="Nome, CNPJ, email ou telefone"
        value={filters.busca}
      />

      <Select
        label="Status"
        onChange={(event) => onChange({ ...filters, status: event.target.value as FornecedorFiltro['status'], page: 1 })}
        value={filters.status}
      >
        <option value="todos">Todos</option>
        <option value="ativos">Ativos</option>
        <option value="inativos">Inativos</option>
      </Select>
    </div>
  );
}
