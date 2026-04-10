import { Input } from '../../../components/ui/Input';
import { Select } from '../../../components/ui/Select';
import type { MobileDeviceFilter } from '../types/mobileDevice.types';

type Props = {
  filters: MobileDeviceFilter;
  onChange: (next: MobileDeviceFilter) => void;
};

export function MobileDeviceFilters({ filters, onChange }: Props) {
  return (
    <div className="filters-grid filters-grid-docs">
      <Input
        label="Buscar aparelho / usuario"
        onChange={(event) => onChange({ ...filters, busca: event.target.value, page: 1 })}
        placeholder="Nome do aparelho, login, modelo, device id..."
        value={filters.busca}
      />
      <Select
        label="Status"
        onChange={(event) =>
          onChange({
            ...filters,
            status: event.target.value as MobileDeviceFilter['status'],
            page: 1,
          })
        }
        value={filters.status}
      >
        <option value="todos">Todos</option>
        <option value="autorizado">Autorizados</option>
        <option value="pendente">Pendentes</option>
        <option value="bloqueado">Bloqueados</option>
      </Select>
    </div>
  );
}
