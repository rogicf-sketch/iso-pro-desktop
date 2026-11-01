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
  /** Enquanto a lista ainda não chegou, não mostrar o aviso de cadastro vazio. */
  colaboradoresCarregados?: boolean;
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
  colaboradoresCarregados = true,
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
    <div className="form-grid atendimento-form-header">
      <AutocompleteField
        fetchOptions={fetchOpcoesAtendente}
        id="atendimento-atendente"
        label="Atendente"
        onChange={onAtendenteChange}
        placeholder="Nome ou matricula"
        value={atendente}
      />
      <Select label="Tipo" onChange={(event) => onRecebedorTipoChange(event.target.value as AtendimentoRecebedorTipo)} value={recebedorTipo}>
        <option value="interno">Colaborador interno</option>
        <option value="externo">Retirante externo</option>
      </Select>

      {recebedorTipo === 'interno' ? (
        <>
          <SearchableSelect
            label="Retirante"
            onChange={onRecebedorColaboradorIdChange}
            options={colaboradores
              .filter((item) => item.tipo === 'interno')
              .map((item) => ({
                value: item.id,
                label: `${item.nome}${item.matricula ? ` - ${item.matricula}` : ''}`,
              }))}
            placeholder="Nome ou matricula de quem retirou"
            value={recebedorColaboradorId}
          />
          {colaboradoresCarregados && !colaboradores.some((item) => item.tipo === 'interno') ? (
            <OperationalNotice>Nenhum colaborador interno ativo. Cadastre em Colaboradores.</OperationalNotice>
          ) : null}
        </>
      ) : (
        <>
          <Input label="Nome" onChange={(event) => onRecebedorChange(event.target.value)} value={recebedor} />
          <Input label="Empresa" onChange={(event) => onRecebedorEmpresaChange(event.target.value)} value={recebedorEmpresa} />
          <Input label="Documento" onChange={(event) => onRecebedorDocumentoChange(event.target.value)} value={recebedorDocumento} />
          <Input label="Telefone" onChange={(event) => onRecebedorTelefoneChange(event.target.value)} value={recebedorTelefone} />
          <SearchableSelect
            label="Autorizado por"
            onChange={onAutorizadorInternoChange}
            options={colaboradores
              .filter((item) => item.tipo === 'interno')
              .map((item) => {
                const rotulo = `${item.nome.trim()}${item.matricula ? ` - ${item.matricula.trim()}` : ''}`;
                return { value: rotulo, label: rotulo };
              })}
            placeholder="Nome ou matricula do autorizador"
            value={autorizadorInterno}
          />
          <label className="field atendimento-form-header__motivo">
            <span>Motivo</span>
            <textarea className="input-control text-area" onChange={(event) => onMotivoRetiradaChange(event.target.value)} rows={2} value={motivoRetirada} />
          </label>
        </>
      )}
    </div>
  );
}
