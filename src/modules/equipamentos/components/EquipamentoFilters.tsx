import { Input } from '../../../components/ui/Input';
import { Select } from '../../../components/ui/Select';
import type { EquipamentoFiltro } from '../types/equipamento.types';

type Props = {
  filters: EquipamentoFiltro;
  onChange: (next: EquipamentoFiltro) => void;
};

export function EquipamentoFilters({ filters, onChange }: Props) {
  return (
    <div className="filters-grid">
      <Input
        label="Buscar"
        onChange={(event) => onChange({ ...filters, busca: event.target.value, page: 1 })}
        placeholder="Nº frota, tipo, placa, operador, contrato, setor ou empresa"
        value={filters.busca}
      />

      <Select
        label="Status no canteiro"
        onChange={(event) => onChange({ ...filters, statusOperacao: event.target.value as EquipamentoFiltro['statusOperacao'], page: 1 })}
        value={filters.statusOperacao}
      >
        <option value="todos">Todos</option>
        <option value="operando">Em operação</option>
        <option value="manutencao">Manutenção</option>
        <option value="parado">Parado</option>
        <option value="em_transito">Em trânsito</option>
      </Select>

      <Select
        label="Contrato"
        onChange={(event) =>
          onChange({ ...filters, situacaoContrato: event.target.value as EquipamentoFiltro['situacaoContrato'], page: 1 })
        }
        value={filters.situacaoContrato}
      >
        <option value="todos">Todos</option>
        <option value="vencido">Vencidos</option>
        <option value="proximo_30">Vence em até 30 dias</option>
        <option value="em_dia">Em dia</option>
        <option value="sem_prazo">Sem data de fim</option>
      </Select>
    </div>
  );
}
