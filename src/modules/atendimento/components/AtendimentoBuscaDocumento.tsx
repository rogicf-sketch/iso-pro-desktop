import { useEffect, useMemo, useRef, useState } from 'react';
import { SearchableSelect } from '../../../components/ui/SearchableSelect';
import { buscarDocumentosPendentesNuvem } from '../services/atendimento.service';
import type { AtendimentoDocumento } from '../types/atendimento.types';

type Props = {
  documentos: AtendimentoDocumento[];
  selectedDocumentoId: string;
  onSelect: (value: string) => void;
  /** Ao escolher um documento vindo da busca remota, entrega-o ao hook para entrar na lista. */
  onDocumentoRemoto?: (documento: AtendimentoDocumento) => void;
};

export function AtendimentoBuscaDocumento({ documentos, selectedDocumentoId, onSelect, onDocumentoRemoto }: Props) {
  /** Boot carrega só os primeiros pendentes; ao digitar, completa com busca na nuvem. */
  const [remotos, setRemotos] = useState<AtendimentoDocumento[]>([]);
  const debounceRef = useRef<number | undefined>(undefined);
  const buscaSeqRef = useRef(0);

  useEffect(() => () => window.clearTimeout(debounceRef.current), []);

  function onQueryChange(query: string) {
    window.clearTimeout(debounceRef.current);
    const q = query.trim();
    if (q.length < 3) {
      setRemotos([]);
      return;
    }
    debounceRef.current = window.setTimeout(() => {
      const seq = ++buscaSeqRef.current;
      void buscarDocumentosPendentesNuvem(q).then((docs) => {
        if (seq === buscaSeqRef.current) setRemotos(docs);
      });
    }, 300);
  }

  const combinados = useMemo(() => {
    const ids = new Set(documentos.map((d) => d.id));
    return [...documentos, ...remotos.filter((d) => !ids.has(d.id))];
  }, [documentos, remotos]);

  const options = combinados.map((documento) => ({
    value: documento.id,
    label: `${documento.numero} Rev. ${documento.revisao} - ${documento.descricao}`,
  }));

  function handleSelect(value: string) {
    const remoto = remotos.find((d) => d.id === value);
    if (remoto && !documentos.some((d) => d.id === value)) {
      onDocumentoRemoto?.(remoto);
    }
    onSelect(value);
  }

  return (
    <SearchableSelect
      label="Documento"
      onChange={handleSelect}
      onQueryChange={onQueryChange}
      options={options}
      placeholder="Digite numero, revisao ou descricao — ou cole a linha completa"
      value={selectedDocumentoId}
    />
  );
}
