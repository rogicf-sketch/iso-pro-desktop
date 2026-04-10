import { useCallback } from 'react';
import { AutocompleteField } from '../../../components/ui/AutocompleteField';
import { Input } from '../../../components/ui/Input';
import { OperationalNotice } from '../../../components/ui/OperationalNotice';
import { SearchableSelect } from '../../../components/ui/SearchableSelect';
import { Select } from '../../../components/ui/Select';
import type { Colaborador } from '../../colaboradores/types/colaborador.types';
import type { AtendimentoRecebedorTipo } from '../types/atendimento.types';

type Props = {
  atendente: string;
  colaboradores: Colaborador[];
  recebedorTipo: AtendimentoRecebedorTipo;
  recebedorColaboradorId: string;
  recebedor: string;
  recebedorEmpresa: string;
  recebedorDocumento: string;
  recebedorTelefone: string;
  autorizadorInterno: string;
  motivoRetirada: string;
  onAtendenteChange: (value: string) => void;
  onRecebedorTipoChange: (value: AtendimentoRecebedorTipo) => void;
  onRecebedorColaboradorIdChange: (value: string) => void;
  onRecebedorChange: (value: string) => void;
  onRecebedorEmpresaChange: (value: string) => void;
  onRecebedorDocumentoChange: (value: string) => void;
  onRecebedorTelefoneChange: (value: string) => void;
  onAutorizadorInternoChange: (value: string) => void;
  onMotivoRetiradaChange: (value: string) => void;
};

export function AtendimentoFormHeader({
  atendente,
  colaboradores,
  recebedorTipo,
  recebedorColaboradorId,
  recebedor,
  recebedorEmpresa,
  recebedorDocumento,
  recebedorTelefone,
  autorizadorInterno,
  motivoRetirada,
  onAtendenteChange,
  onRecebedorTipoChange,
  onRecebedorColaboradorIdChange,
  onRecebedorChange,
  onRecebedorEmpresaChange,
  onRecebedorDocumentoChange,
  onRecebedorTelefoneChange,
  onAutorizadorInternoChange,
  onMotivoRetiradaChange,
}: Props) {
  const fetchOpcoesAtendente = useCallback(
    async (query: string) => {
      const q = query.trim().toLowerCase();
      const linhas = colaboradores
        .filter((c) => {
          if (!q) return true;
          const nome = c.nome?.toLowerCase() ?? '';
          const mat = c.matricula?.toLowerCase() ?? '';
          return nome.includes(q) || mat.includes(q);
        })
        .map((c) => `${c.nome.trim()}${c.matricula ? ` - ${c.matricula}` : ''}`)
        .filter(Boolean);
      return [...new Set(linhas)].slice(0, 50);
    },
    [colaboradores],
  );

  return (
    <div className="form-grid">
      <AutocompleteField
        fetchOptions={fetchOpcoesAtendente}
        id="atendimento-atendente"
        label="Atendente (obrigatorio)"
        onChange={onAtendenteChange}
        placeholder="Digite nome ou matricula — ou cole o atendente"
        value={atendente}
      />
      <Select label="Tipo do retirante" onChange={(event) => onRecebedorTipoChange(event.target.value as AtendimentoRecebedorTipo)} value={recebedorTipo}>
        <option value="interno">Colaborador interno</option>
        <option value="externo">Retirante externo</option>
      </Select>

      {recebedorTipo === 'interno' ? (
        <>
          <SearchableSelect
            label="Colaborador cadastrado"
            onChange={onRecebedorColaboradorIdChange}
            options={colaboradores
              .filter((item) => item.tipo === 'interno')
              .map((item) => ({
                value: item.id,
                label: `${item.nome}${item.matricula ? ` - ${item.matricula}` : ''}`,
              }))}
            placeholder="Digite nome ou matricula — ou cole o colaborador"
            value={recebedorColaboradorId}
          />
          {!colaboradores.some((item) => item.tipo === 'interno') ? (
            <OperationalNotice>Nenhum colaborador interno ativo cadastrado. Cadastre em `Colaboradores` antes de atender.</OperationalNotice>
          ) : null}
        </>
      ) : (
        <>
          <Input label="Nome de quem retirou" onChange={(event) => onRecebedorChange(event.target.value)} value={recebedor} />
          <Input label="Empresa" onChange={(event) => onRecebedorEmpresaChange(event.target.value)} value={recebedorEmpresa} />
          <Input label="Documento" onChange={(event) => onRecebedorDocumentoChange(event.target.value)} value={recebedorDocumento} />
          <Input label="Telefone" onChange={(event) => onRecebedorTelefoneChange(event.target.value)} value={recebedorTelefone} />
          <Input label="Autorizado por" onChange={(event) => onAutorizadorInternoChange(event.target.value)} value={autorizadorInterno} />
          <label className="field" style={{ gridColumn: '1 / -1' }}>
            <span>Motivo da retirada</span>
            <textarea className="input-control text-area" onChange={(event) => onMotivoRetiradaChange(event.target.value)} rows={3} value={motivoRetirada} />
          </label>
          <OperationalNotice>O retirante externo e salvo automaticamente em `Colaboradores` para manter historico e rastreabilidade.</OperationalNotice>
        </>
      )}
    </div>
  );
}
