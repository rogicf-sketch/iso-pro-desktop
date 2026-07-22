import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { SearchableSelect, type SearchableSelectOption } from '../../../components/ui/SearchableSelect';
import { labelDocumentoNumero, resolveSearchableOption } from '../../../components/ui/searchableSelectUtils';
import { buscarDocumentosPendentesNuvem } from '../services/atendimento.service';
import type { AtendimentoDocumento } from '../types/atendimento.types';

type Props = {
  documentos: AtendimentoDocumento[];
  selectedDocumentoId: string;
  onSelect: (value: string) => void;
  /** Ao escolher um documento vindo da busca remota, entrega-o ao hook para entrar na lista. */
  onDocumentoRemoto?: (documento: AtendimentoDocumento) => void;
};

function toOption(documento: AtendimentoDocumento): SearchableSelectOption {
  return {
    value: documento.id,
    label: `${documento.numero} Rev. ${documento.revisao} - ${documento.descricao}`,
  };
}

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
    }, 200);
  }

  const combinados = useMemo(() => {
    const ids = new Set(documentos.map((d) => d.id));
    return [...documentos, ...remotos.filter((d) => !ids.has(d.id))];
  }, [documentos, remotos]);

  const options = combinados.map(toOption);

  const aplicarDocumento = useCallback(
    (documento: AtendimentoDocumento) => {
      if (!documentos.some((d) => d.id === documento.id)) {
        onDocumentoRemoto?.(documento);
      }
      onSelect(documento.id);
    },
    [documentos, onDocumentoRemoto, onSelect],
  );

  function handleSelect(value: string) {
    const remoto = remotos.find((d) => d.id === value);
    if (remoto) {
      aplicarDocumento(remoto);
      return;
    }
    onSelect(value);
  }

  const resolveTypedValue = useCallback(
    async (query: string): Promise<SearchableSelectOption | null> => {
      const local = resolveSearchableOption(options, query);
      if (local) {
        const doc = combinados.find((d) => d.id === local.value);
        if (doc) aplicarDocumento(doc);
        return local;
      }

      const q = query.trim();
      if (q.length < 3) return null;
      const docs = await buscarDocumentosPendentesNuvem(q);
      setRemotos(docs);
      const optList = docs.map(toOption);
      const resolved =
        resolveSearchableOption(optList, q) ??
        (docs.length === 1
          ? toOption(docs[0]!)
          : optList.find((o) => labelDocumentoNumero(o.label).toLowerCase() === q.toLowerCase()));
      if (!resolved) return null;
      const doc = docs.find((d) => d.id === resolved.value);
      if (doc) aplicarDocumento(doc);
      return resolved;
    },
    [aplicarDocumento, combinados, options],
  );

  return (
    <SearchableSelect
      label="Documento"
      onChange={handleSelect}
      onQueryChange={onQueryChange}
      options={options}
      placeholder="Digite numero, revisao ou descricao — ou cole a linha completa"
      resolveTypedValue={resolveTypedValue}
      value={selectedDocumentoId}
    />
  );
}
