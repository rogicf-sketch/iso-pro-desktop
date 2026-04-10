import { Input } from '../../../components/ui/Input';
import { Select } from '../../../components/ui/Select';
import type { UsuarioFiltro, UsuarioPerfil } from '../types/usuario.types';

type Props = {
  filters: UsuarioFiltro;
  profiles: UsuarioPerfil[];
  onChange: (next: UsuarioFiltro) => void;
};

export function UsuariosFilters({ filters, profiles, onChange }: Props) {
  return (
    <div className="filters-grid">
      <Input
        label="Buscar"
        onChange={(event) => onChange({ ...filters, busca: event.target.value, page: 1 })}
        placeholder="Nome, login ou perfil"
        value={filters.busca}
      />

      <Select
        label="Status"
        onChange={(event) => onChange({ ...filters, status: event.target.value as UsuarioFiltro['status'], page: 1 })}
        value={filters.status}
      >
        <option value="todos">Todos</option>
        <option value="ativos">Ativos</option>
        <option value="inativos">Inativos</option>
      </Select>

      <Select
        label="Perfil"
        onChange={(event) => onChange({ ...filters, perfilId: event.target.value, page: 1 })}
        value={filters.perfilId}
      >
        <option value="">Todos</option>
        {profiles.map((profile) => (
          <option key={profile.id} value={profile.id}>
            {profile.nome}
          </option>
        ))}
      </Select>
    </div>
  );
}
