import { Input } from '../../../components/ui/Input';

type Props = {
  busca: string;
  onBuscaChange: (busca: string) => void;
};

export function RelatorioFotograficoFilters({ busca, onBuscaChange }: Props) {
  return (
    <div className="filters-grid filters-grid-docs">
      <Input
        label="Buscar relatório"
        onChange={(event) => onBuscaChange(event.target.value)}
        placeholder="Título, nº do relatório…"
        value={busca}
      />
    </div>
  );
}
