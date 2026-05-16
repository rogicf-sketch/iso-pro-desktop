import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '../../../components/ui/Button';
import { AutocompleteField } from '../../../components/ui/AutocompleteField';
import { Modal } from '../../../components/ui/Modal';
import { ModuleHelp } from '../../../components/ui/ModuleHelp';
import { OperationalNotice } from '../../../components/ui/OperationalNotice';
import { SnapshotConflictHint } from '../../../components/ui/SnapshotConflictHint';
import { abrirPreVisualizacaoHtmlRelatorio } from '../../../lib/htmlRelatorioInstitucional';
import { getSupabaseOperationalStatus } from '../../../lib/supabase';
import { useAuth } from '../../auth/hooks/useAuth';
import { AtendimentoBuscaDocumento } from '../components/AtendimentoBuscaDocumento';
import { AtendimentoFormHeader } from '../components/AtendimentoFormHeader';
import { AtendimentoHistoricoTable } from '../components/AtendimentoHistoricoTable';
import { AtendimentoItensTable } from '../components/AtendimentoItensTable';
import { totalizarLinhas, useAtendimento } from '../hooks/useAtendimento';
import type { Atendimento } from '../types/atendimento.types';
import { montarHtmlRecibo } from '../utils/imprimirReciboAtendimento';
import { montarDadosReciboParaAtendimento } from '../utils/montarDadosReciboParaAtendimento';

export function AtendimentoPage() {
  const { canAccessAction } = useAuth();
  const cloudStatus = getSupabaseOperationalStatus();
  const {
    documentos,
    historico,
    colaboradores,
    selectedDocumento,
    selectedDocumentoId,
    atendente,
    recebedorTipo,
    recebedorColaboradorId,
    recebedor,
    recebedorEmpresa,
    recebedorDocumento,
    recebedorTelefone,
    autorizadorInterno,
    motivoRetirada,
    loading,
    error,
    success,
    snapshotConflict,
    fallbackReason,
    hasCloudConfig,
    setSelectedDocumentoId,
    setAtendente,
    setRecebedorTipo,
    setRecebedorColaboradorId,
    setRecebedor,
    setRecebedorEmpresa,
    setRecebedorDocumento,
    setRecebedorTelefone,
    setAutorizadorInterno,
    setMotivoRetirada,
    updateLinha,
    load,
    pedirConfirmacaoAtendimento,
    podeRegistrarAtendimento,
    confirmacaoAtendimento,
    cancelarConfirmacaoAtendimento,
    confirmarAtendimentoNoModal,
    reciboOpcional,
    dispensarImpressaoRecibo,
    imprimirReciboEfechar,
    reciboEstornoOpcional,
    dispensarImpressaoReciboEstorno,
    imprimirReciboEstornoEfechar,
    estornoAlvo,
    estornoDocLoading,
    estornoDocInfo,
    estornoNomeQuemEstorna,
    estornoNomeQuemDevolve,
    estornoMotivo,
    setEstornoNomeQuemEstorna,
    setEstornoNomeQuemDevolve,
    setEstornoMotivo,
    fecharModalEstorno,
    executarImpressaoReciboEstorno,
    confirmarEstornoFinal,
    iniciarEstorno,
    estornoLinhas,
    setEstornoLinhas,
    idsMarcados,
    itensSelecionados,
    toggleMarcaItem,
    marcarTodosItens,
    exportarAtendimentosMateriaisExcel,
    leitorEscolhaDocumento,
    processarLeituraCodigoBarras,
    confirmarLeitorDocumento,
    cancelarLeitorEscolhaDocumento,
  } = useAtendimento();
  const canEdit = canAccessAction('atendimento', 'editar');
  const canAdminister = canAccessAction('atendimento', 'administrar');
  const canExportAtendimentos = canAccessAction('atendimento', 'visualizar');

  const leitorCodigoRef = useRef<HTMLInputElement>(null);
  const estornoQtdRefs = useRef<(HTMLInputElement | null)[]>([]);
  const estornoConfirmarRef = useRef<HTMLButtonElement | null>(null);
  const [leitorCodigoBuffer, setLeitorCodigoBuffer] = useState('');
  const [reciboHistoricoLoadingId, setReciboHistoricoLoadingId] = useState<string | null>(null);

  /** Sugestoes: atendente/recebedor do lote + colaboradores ativos; filtra ao digitar; aceita texto livre e colar. */
  useEffect(() => {
    estornoQtdRefs.current = [];
  }, [estornoAlvo?.id]);

  useEffect(() => {
    if (!loading && canEdit && !leitorEscolhaDocumento) {
      const t = window.setTimeout(() => leitorCodigoRef.current?.focus(), 0);
      return () => window.clearTimeout(t);
    }
  }, [loading, canEdit, leitorEscolhaDocumento]);

  const focarProximaQtdEstorno = useCallback(
    (fromIndex: number) => {
      if (!estornoAlvo) return;
      for (let i = fromIndex + 1; i < estornoAlvo.itens.length; i++) {
        const it = estornoAlvo.itens[i];
        const cfg = estornoLinhas[it.id];
        if (cfg?.marcado) {
          const el = estornoQtdRefs.current[i];
          el?.focus();
          el?.select();
          return;
        }
      }
      estornoConfirmarRef.current?.focus();
    },
    [estornoAlvo, estornoLinhas],
  );

  const focarQtdEstornoAnterior = useCallback(
    (fromIndex: number) => {
      if (!estornoAlvo) return;
      for (let i = fromIndex - 1; i >= 0; i--) {
        const it = estornoAlvo.itens[i];
        const cfg = estornoLinhas[it.id];
        if (cfg?.marcado) {
          const el = estornoQtdRefs.current[i];
          el?.focus();
          el?.select();
          return;
        }
      }
    },
    [estornoAlvo, estornoLinhas],
  );

  const fetchOpcoesNomeEstorno = useCallback(
    async (query: string) => {
      const q = query.trim().toLowerCase();
      const fromColab = colaboradores
        .filter((c) => c.nome && (q === '' || c.nome.toLowerCase().includes(q)))
        .map((c) => c.nome.trim())
        .filter(Boolean);

      const contexto: string[] = [];
      if (estornoAlvo) {
        if (estornoAlvo.atendente?.trim()) contexto.push(estornoAlvo.atendente.trim());
        if (estornoAlvo.recebedor?.trim()) contexto.push(estornoAlvo.recebedor.trim());
      }
      const contextoFiltrado = q === '' ? contexto : contexto.filter((n) => n.toLowerCase().includes(q));

      return [...new Set([...contextoFiltrado, ...fromColab])].slice(0, 50);
    },
    [colaboradores, estornoAlvo],
  );

  async function handleVerReciboHistorico(item: Atendimento) {
    setReciboHistoricoLoadingId(item.id);
    try {
      const dados = await montarDadosReciboParaAtendimento(item);
      const html = montarHtmlRecibo(dados);
      const res = await abrirPreVisualizacaoHtmlRelatorio(html);
      if (!res.ok) {
        window.alert(
          res.error ??
            'Nao foi possivel abrir a pre-visualizacao. Permita pop-ups ou use Imprimir / PDF no fluxo de confirmacao do atendimento.',
        );
      }
    } finally {
      setReciboHistoricoLoadingId(null);
    }
  }

  return (
    <div className="stack-grid">
      <div className="panel">
        <div className="panel-header">
          <div>
            <p className="panel-kicker">Modulo</p>
            <h2>Atendimento</h2>
          </div>
        </div>

        <ModuleHelp>
          <p className="panel-copy">
            Baixa parcial de documentos com historico de lotes e saldo calculado a partir do planejamento, recebimentos e ajustes.
          </p>
        </ModuleHelp>

        <OperationalNotice>
          {cloudStatus === 'ready' && hasCloudConfig
            ? 'Fonte atual: Supabase. Atendimento operando com historico e saldo integrados em nuvem.'
            : cloudStatus === 'partial'
              ? 'Fonte atual: fallback local. Configuracao do Supabase incompleta.'
              : 'Fonte atual: fallback local. Supabase ainda nao esta configurado.'}
        </OperationalNotice>
        {fallbackReason ? <OperationalNotice tone="warning">{`Fallback ativo por falha de consulta: ${fallbackReason}`}</OperationalNotice> : null}

        <SnapshotConflictHint show={snapshotConflict} onReload={() => void load()} />
        {error ? <div className="error-box">{error}</div> : null}
        {success ? <OperationalNotice>{success}</OperationalNotice> : null}
        {!canEdit ? (
          <OperationalNotice tone="warning">
            Regra operacional: seu perfil pode consultar saldos e historico, mas o registro de baixas permanece bloqueado para evitar movimentacao sem autorizacao.
          </OperationalNotice>
        ) : null}

        <AtendimentoBuscaDocumento documentos={documentos} onSelect={setSelectedDocumentoId} selectedDocumentoId={selectedDocumentoId} />

        {canEdit ? (
          <div className="section-block">
            <label className="field" htmlFor="atendimento-leitor-codigo">
              <span>Leitor de codigo de barras (USB)</span>
              <input
                autoComplete="off"
                className="input-control"
                id="atendimento-leitor-codigo"
                onChange={(e) => setLeitorCodigoBuffer(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key !== 'Enter') return;
                  e.preventDefault();
                  const raw = e.currentTarget.value;
                  setLeitorCodigoBuffer('');
                  void processarLeituraCodigoBarras(raw);
                  window.setTimeout(() => leitorCodigoRef.current?.focus(), 0);
                }}
                placeholder="Bipe o material; Enter confirma a leitura"
                ref={leitorCodigoRef}
                spellCheck={false}
                type="text"
                value={leitorCodigoBuffer}
              />
            </label>
            <ModuleHelp>
              <p className="panel-copy" style={{ marginTop: 8 }}>
                Busca o material no cadastro (codigo ou codigo de barras) e marca a linha somente em documentos pendentes que contenham esse codigo. Se houver mais de um documento, escolha na lista.
              </p>
            </ModuleHelp>
          </div>
        ) : null}

        <AtendimentoFormHeader
          atendente={atendente}
          autorizadorInterno={autorizadorInterno}
          colaboradores={colaboradores}
          motivoRetirada={motivoRetirada}
          onAtendenteChange={setAtendente}
          onAutorizadorInternoChange={setAutorizadorInterno}
          onMotivoRetiradaChange={setMotivoRetirada}
          onRecebedorChange={setRecebedor}
          onRecebedorColaboradorIdChange={setRecebedorColaboradorId}
          onRecebedorDocumentoChange={setRecebedorDocumento}
          onRecebedorEmpresaChange={setRecebedorEmpresa}
          onRecebedorTelefoneChange={setRecebedorTelefone}
          onRecebedorTipoChange={setRecebedorTipo}
          recebedor={recebedor}
          recebedorColaboradorId={recebedorColaboradorId}
          recebedorDocumento={recebedorDocumento}
          recebedorEmpresa={recebedorEmpresa}
          recebedorTelefone={recebedorTelefone}
          recebedorTipo={recebedorTipo}
        />

        {loading ? <OperationalNotice>Carregando dados de atendimento...</OperationalNotice> : null}

        {selectedDocumento ? (
          <div className="section-block">
            <div className="document-summary">
              <strong>
                {selectedDocumento.numero} Rev. {selectedDocumento.revisao}
              </strong>
              <p className="panel-copy">{selectedDocumento.descricao}</p>
              <p className="panel-copy">Responsavel: {selectedDocumento.responsavel || '-'}</p>
            </div>

            {recebedorTipo === 'interno' ? (
              <OperationalNotice tone="warning">
                Regra operacional: atendimento interno exige colaborador ativo cadastrado para manter rastreabilidade completa da retirada.
              </OperationalNotice>
            ) : (
              <OperationalNotice tone="warning">
                Regra operacional: retirada externa exige identificacao completa, autorizador interno e motivo registrado antes da confirmacao.
              </OperationalNotice>
            )}

            <ModuleHelp>
              <OperationalNotice>
                Itens marcados recebem automaticamente a quantidade sugerida (ate o pendente do documento, limitada ao saldo). Ajuste
                somente o que for parcial; desmarque linhas que nao entram nesta operacao.
              </OperationalNotice>
            </ModuleHelp>

            {itensSelecionados.length === 0 &&
            selectedDocumento.linhas.some((l) => idsMarcados.has(l.documentoItemId)) ? (
              <OperationalNotice tone="warning">
                Itens estao marcados, mas a quantidade nesta operacao esta zero (por exemplo saldo 0 ou material nao encontrado no cadastro com o mesmo codigo). Corrija o cadastro/estoque ou informe uma quantidade valida antes de confirmar. Para retirada interna, selecione tambem o colaborador acima.
              </OperationalNotice>
            ) : null}

            <AtendimentoItensTable
              idsMarcados={idsMarcados}
              items={selectedDocumento.linhas}
              onChangeQuantidade={updateLinha}
              onMarcarTodos={marcarTodosItens}
              onToggleMarca={toggleMarcaItem}
            />

            <div className="inline-actions">
              <span className="panel-copy">
                Total desta operacao: <strong>{totalizarLinhas(selectedDocumento.linhas)}</strong>
              </span>
              {canEdit ? (
                <Button
                  disabled={loading || !podeRegistrarAtendimento}
                  onClick={pedirConfirmacaoAtendimento}
                  title={
                    !podeRegistrarAtendimento && !loading
                      ? 'Preencha documento, atendente, dados do retirante e itens com quantidade valida.'
                      : undefined
                  }
                  type="button"
                >
                  Confirmar atendimento
                </Button>
              ) : null}
            </div>
          </div>
        ) : (
          <OperationalNotice>
            Selecione um documento pendente para visualizar os itens e registrar o atendimento.
          </OperationalNotice>
        )}
      </div>

      {!canEdit ? <OperationalNotice>Seu perfil pode consultar atendimento, mas nao pode registrar baixas.</OperationalNotice> : null}

      <div className="panel">
        <div className="panel-header panel-header--toolbar">
          <div>
            <p className="panel-kicker">Historico</p>
            <h2>Lotes registrados</h2>
          </div>
          {canExportAtendimentos ? (
            <div className="panel-toolbar">
              <div className="panel-toolbar__group" role="group" aria-label="Exportar historico">
                <span className="panel-toolbar__label">Planilha</span>
                <div className="panel-toolbar__buttons">
                  <Button onClick={() => void exportarAtendimentosMateriaisExcel()} type="button" variant="ghost">
                    Exportar Excel (CSV)
                  </Button>
                </div>
              </div>
            </div>
          ) : null}
        </div>

        <ModuleHelp>
          <OperationalNotice>
            O CSV inclui documento, descricao, revisao, datas, atendente, recebedor, origem (PC ou Mobile quando registrado assim), material, quantidade e IDs para cruzar com estorno. Colunas{' '}
            <code>estorno_permitido</code> (sim/nao) e <code>qtd_pode_estornar</code> (numero) mostram se a linha ainda pode ser estornada e a quantidade maxima; <code>atendido</code> indica material ainda com quantidade no lote; <code>pode_estornar_linha</code> repete o mesmo criterio que estorno_permitido. Lotes com estorno total (sem itens no lote) aparecem uma linha resumo com <code>status_lote</code> estornado e descricao explicando. No Excel, use importar com separador{' '}
            <strong>ponto e virgula (;)</strong> se as colunas nao separarem. A coluna <code>atendimento_item_id</code> corresponde a cada linha do lote na tela de estorno.
          </OperationalNotice>
        </ModuleHelp>

        <AtendimentoHistoricoTable
          canAdminister={canAdminister}
          items={historico}
          onEstornar={iniciarEstorno}
          onVerRecibo={handleVerReciboHistorico}
          reciboCarregandoId={reciboHistoricoLoadingId}
        />
      </div>

      <Modal
        onClose={cancelarLeitorEscolhaDocumento}
        open={Boolean(leitorEscolhaDocumento)}
        title="Escolher documento"
        wide
      >
        {leitorEscolhaDocumento ? (
          <div className="editor-block stack-grid">
            <p>
              O material <strong>{leitorEscolhaDocumento.material.codigo}</strong> consta em mais de um documento pendente. Indique qual deseja atender nesta operacao.
            </p>
            <ul className="stack-grid" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {leitorEscolhaDocumento.candidatos.map((d) => (
                <li key={d.id}>
                  <Button onClick={() => confirmarLeitorDocumento(d.id)} type="button">
                    {d.numero} Rev. {d.revisao} — {d.descricao}
                  </Button>
                </li>
              ))}
            </ul>
            <div className="form-actions">
              <Button onClick={cancelarLeitorEscolhaDocumento} type="button" variant="ghost">
                Cancelar
              </Button>
            </div>
          </div>
        ) : null}
      </Modal>

      <Modal
        onClose={cancelarConfirmacaoAtendimento}
        open={Boolean(confirmacaoAtendimento)}
        title="Confirmar atendimento"
        wide
      >
        {confirmacaoAtendimento ? (
          <div className="editor-block">
            <p>
              Confirmar o atendimento do documento <strong>{confirmacaoAtendimento.documentoNumero}</strong> com{' '}
              <strong>{confirmacaoAtendimento.itemCount}</strong> item(ns) e total de{' '}
              <strong>{confirmacaoAtendimento.totalUnidades}</strong> unidade(s)?
            </p>
            <div className="form-actions" style={{ marginTop: 16 }}>
              <Button onClick={cancelarConfirmacaoAtendimento} type="button" variant="ghost">
                Cancelar
              </Button>
              <Button onClick={() => void confirmarAtendimentoNoModal()} type="button">
                Confirmar
              </Button>
            </div>
          </div>
        ) : null}
      </Modal>

      <Modal onClose={fecharModalEstorno} open={Boolean(estornoAlvo)} title="Estornar atendimento" wide>
        {estornoAlvo ? (
          <div className="editor-block stack-grid">
            {estornoDocLoading || !estornoDocInfo ? (
              <OperationalNotice>Carregando dados do documento...</OperationalNotice>
            ) : (
              <>
                <p className="panel-copy">
                  Preencha os dados do estorno. O recibo impresso inclui documento, itens, motivo e assinaturas. O estorno so e aplicado ao confirmar.
                </p>
                <div className="document-summary">
                  <strong>
                    {estornoAlvo.documentoNumero} Rev. {estornoDocInfo.revisao}
                  </strong>
                  <p className="panel-copy">{estornoDocInfo.descricao}</p>
                  <p className="panel-copy">Responsavel (documento): {estornoDocInfo.responsavel}</p>
                  <p className="panel-copy">
                    Atendimento <strong>{estornoAlvo.numero}</strong> — retirada em{' '}
                    {new Date(estornoAlvo.dataAtendimento).toLocaleString('pt-BR')}
                  </p>
                </div>

                <div className="form-columns">
                  <AutocompleteField
                    fetchOptions={fetchOpcoesNomeEstorno}
                    id="estorno-operador"
                    label="Quem esta estornando (operador)"
                    onChange={setEstornoNomeQuemEstorna}
                    placeholder="Digite para buscar, selecione ou cole o nome"
                    value={estornoNomeQuemEstorna}
                  />
                  <AutocompleteField
                    fetchOptions={fetchOpcoesNomeEstorno}
                    id="estorno-devolve"
                    label="Quem esta devolvendo o material"
                    onChange={setEstornoNomeQuemDevolve}
                    placeholder="Digite para buscar, selecione ou cole o nome"
                    value={estornoNomeQuemDevolve}
                  />
                </div>
                <label className="field">
                  <span>Motivo do estorno</span>
                  <textarea
                    className="input-control text-area"
                    onChange={(e) => setEstornoMotivo(e.target.value)}
                    rows={4}
                    value={estornoMotivo}
                  />
                </label>

                <div className="section-block">
                  <h3 className="panel-kicker" style={{ marginBottom: 8 }}>
                    Itens a estornar
                  </h3>
                  <p className="panel-copy">
                    Marque os materiais deste lote que serao devolvidos e ajuste a quantidade (pode ser menor que a retirada). Itens desmarcados nao entram no estorno.
                  </p>
                  <OperationalNotice>
                    Modo rapido na coluna &quot;Qtd a estornar&quot;: <strong>Enter</strong> proxima linha habilitada;{' '}
                    <strong>Shift+Enter</strong> linha anterior; <strong>Setas</strong> para cima/baixo entre linhas; na ultima linha,{' '}
                    <strong>Enter</strong> vai para Confirmar estorno.
                  </OperationalNotice>
                  <div style={{ overflowX: 'auto' }}>
                    <table className="data-table" style={{ width: '100%', fontSize: '0.9rem' }}>
                      <thead>
                        <tr>
                          <th style={{ width: 40 }}></th>
                          <th>Codigo</th>
                          <th>Descricao</th>
                          <th>UN</th>
                          <th>Qtd no lote</th>
                          <th>Qtd a estornar</th>
                        </tr>
                      </thead>
                      <tbody>
                        {estornoAlvo.itens.map((it, rowIndex) => {
                          const cfg = estornoLinhas[it.id] ?? { marcado: false, quantidade: it.quantidadeAtendida };
                          return (
                            <tr key={it.id}>
                              <td>
                                <input
                                  aria-label={`Incluir ${it.codigoMaterial} no estorno`}
                                  checked={cfg.marcado}
                                  onChange={(e) => {
                                    const checked = e.target.checked;
                                    setEstornoLinhas((c) => ({
                                      ...c,
                                      [it.id]: {
                                        marcado: checked,
                                        quantidade: checked ? Math.min(c[it.id]?.quantidade ?? it.quantidadeAtendida, it.quantidadeAtendida) : 0,
                                      },
                                    }));
                                  }}
                                  type="checkbox"
                                />
                              </td>
                              <td>{it.codigoMaterial}</td>
                              <td>{it.descricaoMaterial}</td>
                              <td>{it.unidade}</td>
                              <td>{it.quantidadeAtendida}</td>
                              <td>
                                <input
                                  ref={(el) => {
                                    estornoQtdRefs.current[rowIndex] = el;
                                  }}
                                  aria-label={`Quantidade a estornar para ${it.codigoMaterial}`}
                                  className="input-control"
                                  disabled={!cfg.marcado}
                                  max={it.quantidadeAtendida}
                                  min={0}
                                  onChange={(e) => {
                                    const v = Number(e.target.value);
                                    const q = Number.isFinite(v)
                                      ? Math.min(Math.max(0, v), it.quantidadeAtendida)
                                      : 0;
                                    setEstornoLinhas((c) => ({
                                      ...c,
                                      [it.id]: { marcado: c[it.id]?.marcado ?? true, quantidade: q },
                                    }));
                                  }}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                      e.preventDefault();
                                      if (e.shiftKey) {
                                        focarQtdEstornoAnterior(rowIndex);
                                      } else {
                                        focarProximaQtdEstorno(rowIndex);
                                      }
                                      return;
                                    }
                                    if (e.key === 'ArrowDown') {
                                      e.preventDefault();
                                      focarProximaQtdEstorno(rowIndex);
                                      return;
                                    }
                                    if (e.key === 'ArrowUp') {
                                      e.preventDefault();
                                      focarQtdEstornoAnterior(rowIndex);
                                      return;
                                    }
                                  }}
                                  step="any"
                                  style={{ maxWidth: 120 }}
                                  type="number"
                                  value={cfg.marcado ? cfg.quantidade : 0}
                                />
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="form-actions" style={{ marginTop: 16, flexWrap: 'wrap', gap: 8 }}>
                  <Button onClick={fecharModalEstorno} type="button" variant="ghost">
                    Cancelar
                  </Button>
                  <Button onClick={() => void executarImpressaoReciboEstorno()} type="button" variant="ghost">
                    Imprimir recibo de estorno
                  </Button>
                  <Button onClick={() => void confirmarEstornoFinal()} ref={estornoConfirmarRef} type="button" variant="danger">
                    Confirmar estorno
                  </Button>
                </div>
              </>
            )}
          </div>
        ) : null}
      </Modal>

      <Modal
        onClose={dispensarImpressaoRecibo}
        open={Boolean(reciboOpcional)}
        title="Recibo de retirada"
        wide
      >
        {reciboOpcional ? (
          <div className="editor-block">
            <p>
              Atendimento <strong>{reciboOpcional.atendimento.numero}</strong> registrado. Deseja imprimir o recibo desta retirada?
            </p>
            <div className="form-actions" style={{ marginTop: 16 }}>
              <Button onClick={dispensarImpressaoRecibo} type="button" variant="ghost">
                Nao
              </Button>
              <Button onClick={imprimirReciboEfechar} type="button">
                Sim, imprimir
              </Button>
            </div>
          </div>
        ) : null}
      </Modal>

      <Modal
        onClose={dispensarImpressaoReciboEstorno}
        open={Boolean(reciboEstornoOpcional)}
        title="Recibo de estorno"
        wide
      >
        {reciboEstornoOpcional ? (
          <div className="editor-block">
            <p>
              Estorno registrado no atendimento <strong>{reciboEstornoOpcional.atendimento.numero}</strong>. Deseja imprimir o recibo deste estorno?
            </p>
            <div className="form-actions" style={{ marginTop: 16 }}>
              <Button onClick={dispensarImpressaoReciboEstorno} type="button" variant="ghost">
                Nao
              </Button>
              <Button onClick={imprimirReciboEstornoEfechar} type="button">
                Sim, imprimir
              </Button>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
