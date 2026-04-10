import { SearchableSelect } from '../../../components/ui/SearchableSelect';
import type { AtendimentoDocumento } from '../types/atendimento.types';

type Props = {
  documentos: AtendimentoDocumento[];
  selectedDocumentoId: string;
  onSelect: (value: string) => void;
};

export function AtendimentoBuscaDocumento({ documentos, selectedDocumentoId, onSelect }: Props) {
  const options = documentos.map((documento) => ({
    value: documento.id,
    label: `${documento.numero} Rev. ${documento.revisao} - ${documento.descricao}`,
  }));

  return (
    <SearchableSelect
      label="Documento"
      onChange={onSelect}
      options={options}
      placeholder="Digite numero, revisao ou descricao — ou cole a linha completa"
      value={selectedDocumentoId}
    />
  );
}
