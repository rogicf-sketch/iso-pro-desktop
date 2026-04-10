import { Input } from '../../../components/ui/Input';
import { Select } from '../../../components/ui/Select';
import type { MaterialFiltro } from '../types/material.types';

type Props = {
  filters: MaterialFiltro;
  disciplinas: string[];
  onChange: (next: MaterialFiltro) => void;
};

export function MaterialFilters({ filters, disciplinas, onChange }: Props) {
  return (
    <div className="filters-grid">
      <Input
        label="Busca"
        onChange={(event) => onChange({ ...filters, busca: event.target.value, page: 1 })}
        placeholder="Codigo, descricao ou disciplina"
        value={filters.busca}
      />

      <Select
        label="Disciplina"
        onChange={(event) => onChange({ ...filters, disciplina: event.target.value, page: 1 })}
        value={filters.disciplina}
      >
        <option value="">Todas</option>
        {disciplinas.map((disciplina) => (
          <option key={disciplina} value={disciplina}>
            {disciplina}
          </option>
        ))}
      </Select>

      <Select
        label="Status"
        onChange={(event) =>
          onChange({ ...filters, ativo: event.target.value as MaterialFiltro['ativo'], page: 1 })
        }
        value={filters.ativo}
      >
        <option value="todos">Todos</option>
        <option value="ativos">Ativos</option>
        <option value="inativos">Inativos</option>
      </Select>
    </div>
  );
}
