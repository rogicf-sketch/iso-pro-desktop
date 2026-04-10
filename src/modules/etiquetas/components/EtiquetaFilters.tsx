import { Input } from '../../../components/ui/Input';
import { Select } from '../../../components/ui/Select';
import type { EtiquetaFiltro } from '../types/etiqueta.types';

type Props = {
  filters: EtiquetaFiltro;
  onChange: (next: EtiquetaFiltro) => void;
};

export function EtiquetaFilters({ filters, onChange }: Props) {
  return (
    <div className="filters-grid">
      <Input
        label="Buscar"
        onChange={(event) => onChange({ ...filters, busca: event.target.value, page: 1 })}
        placeholder="Titulo, codigo, NF, romaneio, fornecedor (recebimentos)..."
        value={filters.busca}
      />
      <Select label="Modelo" onChange={(event) => onChange({ ...filters, modelo: event.target.value as EtiquetaFiltro['modelo'], page: 1 })} value={filters.modelo}>
        <option value="todos">Todos</option>
        <option value="simples">Simples</option>
        <option value="colorido">Neutro refinado</option>
        <option value="industrial">Industrial</option>
        <option value="cartao">Cartao</option>
        <option value="segregacao">Segregacao (etiqueta: Segregado)</option>
        <option value="liberacao">Liberacao (etiqueta: Liberado)</option>
      </Select>
      <Select label="Formato" onChange={(event) => onChange({ ...filters, formato: event.target.value as EtiquetaFiltro['formato'], page: 1 })} value={filters.formato}>
        <option value="todos">Todos</option>
        <option value="a4_2col">A4 2 colunas</option>
        <option value="a4_1col">A4 1 coluna</option>
        <option value="termica_58">Termica 58mm</option>
        <option value="termica_80">Termica 80mm</option>
      </Select>
      <Select label="Status" onChange={(event) => onChange({ ...filters, status: event.target.value as EtiquetaFiltro['status'], page: 1 })} value={filters.status}>
        <option value="todos">Todos</option>
        <option value="rascunho">Rascunho</option>
        <option value="pronta">Pronta</option>
        <option value="impressa">Impressa</option>
        <option value="cancelada">Cancelada</option>
      </Select>
    </div>
  );
}
