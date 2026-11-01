import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '../../../components/ui/Button';
import { Modal } from '../../../components/ui/Modal';
import { OperationalNotice } from '../../../components/ui/OperationalNotice';
import type { Colaborador } from '../../colaboradores/types/colaborador.types';
import type { AtendimentoRecebedorTipo, SessaoRetiradaLinha } from '../types/atendimento.types';
import type { AtendimentoLeitorPainelState } from '../hooks/useAtendimento';
import {
  analisarQuantidadeAtendimentoLinha,
  obterQuantidadeLinhaSessao,
  quantidadeMaximaRestanteLeitor,
} from '../utils/sessaoRetirada.utils';

type Props = {
  open: boolean;
  painel: AtendimentoLeitorPainelState | null;
  sessaoRetirada: SessaoRetiradaLinha[];
  atendente: string;
  recebedorTipo: AtendimentoRecebedorTipo;
  recebedorColaboradorId: string;
  recebedor: string;
  colaboradores: Colaborador[];
  avisoRetirante?: string;
  onConfirmar: (documentoId: string, quantidade: number) => void | Promise<void>;
  onContinuarBipando: () => void;
  onCancelar: () => void;
  /** Abre a confirmacao da retirada (recibo unico) sem precisar rolar ate a tabela da sessao. */
  onFinalizarRetirada?: () => void;
};

function rotuloRetirante(
  recebedorTipo: AtendimentoRecebedorTipo,
  recebedorColaboradorId: string,
  recebedor: string,
  colaboradores: Colaborador[],
): string {
  if (recebedorTipo === 'interno') {
    const c = colaboradores.find((x) => x.id === recebedorColaboradorId);
    return c?.nome?.trim() || recebedor.trim() || '— (selecione colaborador)';
  }
  return recebedor.trim() || '— (informe retirante externo)';
}

export function AtendimentoLeitorModal({
  open,
  painel,
  sessaoRetirada,
  atendente,
  recebedorTipo,
  recebedorColaboradorId,
  recebedor,
  colaboradores,
  avisoRetirante,
  onConfirmar,
  onContinuarBipando,
  onCancelar,
  onFinalizarRetirada,
}: Props) {
  const [documentoId, setDocumentoId] = useState('');
  const [quantidade, setQuantidade] = useState('');
  const quantidadeRef = useRef<HTMLInputElement>(null);
  const continuarRef = useRef<HTMLButtonElement>(null);

  const candidato = useMemo(
    () => painel?.candidatos.find((c) => c.documento.id === documentoId),
    [painel, documentoId],
  );

  const candidatoConcluido = useMemo(
    () =>
      painel?.candidatos.find(
        (c) => c.documento.id === (painel.documentoSelecionadoId ?? documentoId),
      ),
    [painel, documentoId],
  );

  const qtdNaSessao = candidato
    ? obterQuantidadeLinhaSessao(sessaoRetirada, candidato.documento.id, candidato.linha.documentoItemId)
    : 0;

  const maxQtd = candidato ? quantidadeMaximaRestanteLeitor(candidato.linha, sessaoRetirada, candidato.documento.id) : 0;
  const concluido = painel?.passo === 'concluido';
  const todosCandidatosEsgotados = useMemo(() => {
    if (!painel?.candidatos.length) return false;
    return painel.candidatos.every(
      (c) => quantidadeMaximaRestanteLeitor(c.linha, sessaoRetirada, c.documento.id) <= 0,
    );
  }, [painel, sessaoRetirada]);

  const analiseQuantidade = useMemo(() => {
    if (!candidato) {
      return { valida: false, quantidade: 0, mensagem: null as string | null };
    }
    if (maxQtd <= 0) {
      return {
        valida: false,
        quantidade: 0,
        mensagem:
          qtdNaSessao > 0
            ? `Este material ja consta na sessao com ${qtdNaSessao} ${candidato.linha.unidade} neste documento (quantidade maxima atingida).`
            : 'Nao ha quantidade pendente ou saldo disponivel para este documento.',
      };
    }
    return analisarQuantidadeAtendimentoLinha(quantidade, maxQtd, candidato.linha.unidade);
  }, [candidato, maxQtd, qtdNaSessao, quantidade]);

  const podeIncluir = Boolean(candidato && maxQtd > 0 && analiseQuantidade.valida);

  const confirmarInclusao = useCallback(() => {
    if (!documentoId || !candidato || !podeIncluir) return;
    void onConfirmar(documentoId, analiseQuantidade.quantidade);
  }, [analiseQuantidade.quantidade, candidato, documentoId, onConfirmar, podeIncluir]);

  useEffect(() => {
    if (!painel || !open) return;
    const comRestante = painel.candidatos.filter(
      (c) => quantidadeMaximaRestanteLeitor(c.linha, sessaoRetirada, c.documento.id) > 0,
    );
    const preferido = comRestante[0] ?? painel.candidatos[0];
    const idInicial =
      painel.documentoSelecionadoId ??
      (painel.candidatos.length === 1 ? preferido?.documento.id : preferido?.documento.id) ??
      '';
    setDocumentoId(idInicial);
    if (preferido && idInicial === preferido.documento.id) {
      const restante = quantidadeMaximaRestanteLeitor(preferido.linha, sessaoRetirada, preferido.documento.id);
      setQuantidade(restante > 0 ? String(restante) : '');
    } else {
      setQuantidade('');
    }
  }, [painel?.scan, open, painel, sessaoRetirada]);

  useEffect(() => {
    if (!candidato) return;
    const restante = quantidadeMaximaRestanteLeitor(candidato.linha, sessaoRetirada, candidato.documento.id);
    setQuantidade(restante > 0 ? String(restante) : '');
  }, [documentoId, candidato, sessaoRetirada]);

  useEffect(() => {
    if (!open || concluido) return;
    if (candidato && maxQtd > 0) {
      window.setTimeout(() => {
        quantidadeRef.current?.focus();
        quantidadeRef.current?.select();
      }, 0);
    }
  }, [open, concluido, candidato, maxQtd, painel?.scan]);

  useEffect(() => {
    if (!open || !concluido) return;
    window.setTimeout(() => continuarRef.current?.focus(), 0);
  }, [open, concluido, painel?.scan]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCancelar();
        return;
      }
      if (event.key !== 'Enter' || event.shiftKey || event.ctrlKey || event.altKey) return;
      const alvo = event.target;
      if (alvo instanceof HTMLElement && alvo.tagName === 'BUTTON') return;

      if (concluido) {
        event.preventDefault();
        onContinuarBipando();
        return;
      }
      if (!painel || painel.candidatos.length === 0 || !podeIncluir) return;
      event.preventDefault();
      confirmarInclusao();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, concluido, podeIncluir, confirmarInclusao, onContinuarBipando, onCancelar, painel]);

  if (!painel) return null;

  const { material, candidatos, scan } = painel;
  const buscando = painel.passo === 'buscando';
  const totalSessaoQtd = sessaoRetirada.reduce((acc, l) => acc + (Number(l.quantidade) || 0), 0);

  return (
    <Modal onClose={onCancelar} open={open} title="Atendimento via leitor" wide>
      <div className="atendimento-leitor">
        <section className="atendimento-leitor__meta" aria-label="Retirada">
          <div className="atendimento-leitor__meta-grid">
            <div>
              <span className="atendimento-leitor__label">Atendente</span>
              <strong className="atendimento-leitor__value">
                {atendente.trim() || '— (obrigatorio)'}
              </strong>
            </div>
            <div>
              <span className="atendimento-leitor__label">
                {recebedorTipo === 'interno' ? 'Colaborador atendido' : 'Retirante (externo)'}
              </span>
              <strong className="atendimento-leitor__value">
                {rotuloRetirante(recebedorTipo, recebedorColaboradorId, recebedor, colaboradores)}
              </strong>
            </div>
          </div>
          {avisoRetirante ? <OperationalNotice tone="warning">{avisoRetirante}</OperationalNotice> : null}
        </section>

        <section className="atendimento-leitor__material" aria-label="Material lido">
          <div className="atendimento-leitor__material-top">
            <div className="atendimento-leitor__codigo">
              {material ? material.codigo : 'A identificar…'}
            </div>
            <span className="atendimento-leitor__scan" title="Codigo lido pelo leitor">
              <span className="atendimento-leitor__scan-label">Leitura</span>
              <code>{scan}</code>
            </span>
          </div>
          <p className="atendimento-leitor__descricao" title={material?.descricao || undefined}>
            {material
              ? material.descricao || 'Sem descricao no cadastro.'
              : 'A consultar o cadastro na nuvem.'}
          </p>
        </section>

        {buscando || !material ? (
          <>
            <OperationalNotice>
              <strong>Aguarde…</strong>{' '}
              {material
                ? 'A procurar desenhos com pendencia deste material na nuvem.'
                : 'A identificar o material no cadastro.'}{' '}
              Isto pode levar alguns segundos.
            </OperationalNotice>
            <div className="atendimento-leitor__actions">
              <Button onClick={onCancelar} type="button" variant="ghost">
                Cancelar
              </Button>
            </div>
          </>
        ) : candidatos.length === 0 ? (
          <OperationalNotice tone="warning">
            Nenhum documento pendente inclui este material. Verifique planejamento, recebimento (saldo) e cadastro.
          </OperationalNotice>
        ) : concluido ? (
          <>
            <OperationalNotice tone="success">
              Material <strong>{material.codigo}</strong> incluido na sessao
              {painel.quantidadeAplicada != null && candidatoConcluido
                ? ` — ${painel.quantidadeAplicada} ${candidatoConcluido.linha.unidade}`
                : ''}
              {candidatoConcluido
                ? ` no documento ${candidatoConcluido.documento.numero} Rev. ${candidatoConcluido.documento.revisao}.`
                : '.'}
            </OperationalNotice>
            <p className="atendimento-leitor__hint">
              Sessao atual: <strong>{sessaoRetirada.length}</strong> item(ns) ·{' '}
              <strong>{totalSessaoQtd}</strong> unidade(s). Enter = continuar bipando · Esc = fechar.
            </p>
            <div className="atendimento-leitor__actions">
              <Button onClick={onContinuarBipando} ref={continuarRef} type="button">
                Sim — continuar bipando
              </Button>
              {onFinalizarRetirada && sessaoRetirada.length > 0 ? (
                <Button onClick={onFinalizarRetirada} type="button" variant="ghost">
                  Finalizar retirada (recibo unico)
                </Button>
              ) : null}
              <Button onClick={onCancelar} type="button" variant="ghost">
                Nao — fechar e revisar tabela
              </Button>
            </div>
          </>
        ) : (
          <>
            {todosCandidatosEsgotados ? (
              <OperationalNotice tone="warning">
                Material <strong>{material.codigo}</strong> ja consta na sessao de retirada com a quantidade maxima
                permitida neste(s) documento(s). Bipe outro material ou confirme a retirada na tabela abaixo.
              </OperationalNotice>
            ) : null}

            <section className="atendimento-leitor__docs" aria-label="Desenho ou documento">
              <div className="atendimento-leitor__docs-head">
                <span className="atendimento-leitor__label">Desenho / documento</span>
                <span className="atendimento-leitor__docs-count">
                  {candidatos.length} opcao{candidatos.length === 1 ? '' : 'es'}
                </span>
              </div>
              <ul className="atendimento-leitor__list" role="listbox" aria-label="Documentos candidatos">
                {candidatos.map(({ documento, linha }) => {
                  const ativo = documentoId === documento.id;
                  const naSessao = obterQuantidadeLinhaSessao(
                    sessaoRetirada,
                    documento.id,
                    linha.documentoItemId,
                  );
                  const restante = quantidadeMaximaRestanteLeitor(linha, sessaoRetirada, documento.id);
                  const esgotado = restante <= 0;
                  return (
                    <li key={documento.id}>
                      <button
                        aria-selected={ativo}
                        className={[
                          'atendimento-leitor__doc',
                          ativo ? 'is-selected' : '',
                          esgotado ? 'is-exhausted' : '',
                        ]
                          .filter(Boolean)
                          .join(' ')}
                        onClick={() => setDocumentoId(documento.id)}
                        role="option"
                        type="button"
                      >
                        <div className="atendimento-leitor__doc-main">
                          <strong className="atendimento-leitor__doc-numero">{documento.numero}</strong>
                          <span className="atendimento-leitor__doc-rev">Rev. {documento.revisao}</span>
                        </div>
                        {documento.descricao ? (
                          <p className="atendimento-leitor__doc-desc" title={documento.descricao}>
                            {documento.descricao}
                          </p>
                        ) : null}
                        <div className="atendimento-leitor__chips">
                          <span className="atendimento-leitor__chip">
                            Pendente{' '}
                            <b>
                              {linha.quantidadePendente} {linha.unidade}
                            </b>
                          </span>
                          <span className="atendimento-leitor__chip">
                            Saldo <b>{linha.saldoDisponivel}</b>
                          </span>
                          {naSessao > 0 ? (
                            <span className="atendimento-leitor__chip atendimento-leitor__chip--session">
                              Na sessao{' '}
                              <b>
                                {naSessao} {linha.unidade}
                              </b>
                              {' · '}
                              Restante{' '}
                              <b>
                                {restante} {linha.unidade}
                              </b>
                            </span>
                          ) : null}
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>

            {candidato ? (
              maxQtd > 0 ? (
                <section className="atendimento-leitor__qty" aria-label="Quantidade">
                  <label className="atendimento-leitor__qty-field" htmlFor="atendimento-leitor-qtd">
                    <span className="atendimento-leitor__label">
                      Quantidade nesta operacao
                      <span className="atendimento-leitor__qty-meta">
                        max. {maxQtd} {candidato.linha.unidade}
                        {qtdNaSessao > 0 ? ` · ja ha ${qtdNaSessao} na sessao` : ''}
                        {' · '}
                        Enter confirma
                      </span>
                    </span>
                    <input
                      aria-invalid={Boolean(analiseQuantidade.mensagem)}
                      className="atendimento-leitor__qty-input"
                      id="atendimento-leitor-qtd"
                      inputMode="decimal"
                      min={0}
                      max={maxQtd}
                      onChange={(e) => setQuantidade(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key !== 'Enter') return;
                        e.preventDefault();
                        confirmarInclusao();
                      }}
                      ref={quantidadeRef}
                      type="number"
                      value={quantidade}
                    />
                  </label>
                  {analiseQuantidade.mensagem ? (
                    <OperationalNotice tone="warning">{analiseQuantidade.mensagem}</OperationalNotice>
                  ) : null}
                </section>
              ) : analiseQuantidade.mensagem ? (
                <OperationalNotice tone="warning">{analiseQuantidade.mensagem}</OperationalNotice>
              ) : null
            ) : (
              <OperationalNotice>Selecione um documento acima.</OperationalNotice>
            )}

            <div className="atendimento-leitor__actions">
              <Button disabled={!podeIncluir} onClick={confirmarInclusao} type="button">
                Incluir no atendimento
              </Button>
              <Button onClick={onCancelar} type="button" variant="ghost">
                Cancelar
              </Button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
