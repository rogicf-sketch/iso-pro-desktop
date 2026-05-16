import { useEffect, useMemo, useState } from 'react';
import { Pagination } from '../../../components/tables/Pagination';
import { Button } from '../../../components/ui/Button';
import { Modal } from '../../../components/ui/Modal';
import { ModuleHelp } from '../../../components/ui/ModuleHelp';
import { OperationalNotice } from '../../../components/ui/OperationalNotice';
import { SnapshotConflictHint } from '../../../components/ui/SnapshotConflictHint';
import { StatusBadge } from '../../../components/ui/StatusBadge';
import { createStatusMeta } from '../../../components/ui/statusMeta';
import { abrirPreVisualizacaoHtmlRelatorio } from '../../../lib/htmlRelatorioInstitucional';
import { getSupabaseOperationalStatus } from '../../../lib/supabase';
import { useAuth } from '../../auth/hooks/useAuth';
import { DocumentoFilters } from '../components/DocumentoFilters';
import { DocumentoForm } from '../components/DocumentoForm';
import { DocumentosTable } from '../components/DocumentosTable';
import { useDocumentos } from '../hooks/useDocumentos';
import {
  resolverLocalizacaoExibicaoPlanejamento,
  resolverStatusLinhaDocumento,
} from '../services/documentoPlanejamento';
import type { MetricasPorCodigoMaterial } from '../services/documentoPlanejamento';
import { carregarMetricasELocalizacoesPlanejamentoPorCodigo } from '../services/documentos.service';
import { imprimirPlanejamentoCampoHtml, montarHtmlPlanejamentoCampo } from '../utils/imprimirPlanejamentoCampoHtml';

function statusLinhaPlanejamentoMeta(status: ReturnType<typeof resolverStatusLinhaDocumento>) {
  if (status === 'atendido') return createStatusMeta('Atendido', 'ok');
  if (status === 'recebido') return createStatusMeta('Recebido', 'info');
  if (status === 'parcial') return createStatusMeta('Parcial', 'warning');
  return createStatusMeta('Pendente', 'danger');
}

const MAX_DOCUMENTOS_RESUMO_MODAL = 60;
const MAX_CARACTERES_LINHA_RESUMO = 80;

function encurtarLinhaDocumentoResumo(texto: string) {
  if (texto.length <= MAX_CARACTERES_LINHA_RESUMO) return texto;
  return `${texto.slice(0, MAX_CARACTERES_LINHA_RESUMO - 3)}...`;
}

export function DocumentosPage() {
  const { canAccessAction } = useAuth();
  const [metricasVisualizacao, setMetricasVisualizacao] = useState<Map<string, MetricasPorCodigoMaterial>>(new Map());
  const [localizacoesRecebimentoVisualizacao, setLocalizacoesRecebimentoVisualizacao] = useState<Map<string, string>>(
    new Map(),
  );
  const [folhaCampoBusy, setFolhaCampoBusy] = useState(false);
  const cloudStatus = getSupabaseOperationalStatus();
  const {
    items,
    total,
    loading,
    error,
    success,
    fallbackReason,
    documentosSource,
    syncingLocalParaNuvem,
    enviarPlanejamentoLocalParaNuvem,
    planejamentoDiag,
    planejamentoMaisNoLocal,
    hasCloudConfig,
    filters,
    formInitialValue,
    isModalOpen,
    selected,
    setFilters,
    openCreateModal,
    openEditModal,
    closeModal,
    load,
    submitDocumento,
    handleCancelar,
    importInputRef,
    importSnapshotConflict,
    importStaging,
    importingDocumentos,
    importResultado,
    exportDocumentosCsvResumo,
    exportDocumentosCsvResumoFiltrado,
    openImportDocumentosPicker,
    downloadModeloCsvImportacaoDocumentos,
    stageImportDocumentosFromFile,
    cancelImportDocumentosStaging,
    confirmImportDocumentosStaging,
    closeImportDocumentosResultado,
    reloadAfterImportSnapshotConflict,
    viewDocument,
    closeViewDocument,
    openViewDocumento,
    cancelDocAlvo,
    cancelMotivo,
    setCancelMotivo,
    cancelSaving,
    fecharCancelamentoAdministrativo,
    confirmarCancelamentoAdministrativo,
    cancelError,
    idsParaExcluirDocumentos,
    excluirModalResumos,
    excluirModalResumosLoading,
    excluirDefinitivoSenha,
    setExcluirDefinitivoSenha,
    excluirDefinitivoBusy,
    abrirExclusaoDefinitivaDocumento,
    abrirExclusaoDefinitivaEmMassa,
    fecharExclusaoDefinitivaDocumento,
    confirmarExclusaoDefinitivaDocumento,
    selectedDocumentIds,
    selectedDocumentIdSet,
    toggleSelectDocumentoId,
    toggleSelectDocumentosPaginaAtual,
    selectAllDocumentosFiltered,
    selectAllFilteredBusy,
    clearDocumentosSelection,
  } = useDocumentos();
  const canEdit = canAccessAction('documentos', 'editar');
  const canAdminister = canAccessAction('documentos', 'administrar');

  const resumoLinhasExclusao = useMemo(() => {
    const total = excluirModalResumos.length;
    const visiveis = excluirModalResumos.slice(0, MAX_DOCUMENTOS_RESUMO_MODAL);
    const restantes = total - visiveis.length;
    return { total, visiveis, restantes };
  }, [excluirModalResumos]);

  const viewDocId = viewDocument?.id;
  useEffect(() => {
    if (!viewDocId) {
      setMetricasVisualizacao(new Map());
      setLocalizacoesRecebimentoVisualizacao(new Map());
      return;
    }
    void carregarMetricasELocalizacoesPlanejamentoPorCodigo().then(({ metricas, localizacoesRecebimentoPorCodigo }) => {
      setMetricasVisualizacao(metricas);
      setLocalizacoesRecebimentoVisualizacao(localizacoesRecebimentoPorCodigo);
    });
  }, [viewDocId]);

  return (
    <div className="panel">
      <div className="panel-header panel-header--toolbar">
        <div>
          <p className="panel-kicker">Módulo</p>
          <h2>Planejamento de Materiais</h2>
        </div>
        {canEdit ? (
          <div className="panel-toolbar">
            <div className="panel-toolbar__group" role="group" aria-label="Cadastro">
              <span className="panel-toolbar__label">Cadastro</span>
              <div className="panel-toolbar__buttons">
                <Button onClick={openCreateModal}>Novo documento</Button>
              </div>
            </div>
            <div className="panel-toolbar__group" role="group" aria-label="Planilha CSV">
              <span className="panel-toolbar__label">Planilha CSV</span>
              <div className="panel-toolbar__buttons">
                <Button type="button" variant="ghost" onClick={openImportDocumentosPicker}>
                  Importar
                </Button>
                <Button type="button" variant="ghost" onClick={downloadModeloCsvImportacaoDocumentos}>
                  Modelo
                </Button>
                <Button type="button" variant="ghost" onClick={() => void exportDocumentosCsvResumo()}>
                  Exportar itens (tudo)
                </Button>
                <Button type="button" variant="ghost" onClick={() => void exportDocumentosCsvResumoFiltrado()}>
                  Exportar itens (filtro)
                </Button>
              </div>
            </div>
            <input
              accept=".csv,.txt,text/csv"
              onChange={(event) => {
                void stageImportDocumentosFromFile(event.target.files?.[0] ?? null);
                event.target.value = '';
              }}
              ref={importInputRef}
              style={{ display: 'none' }}
              type="file"
            />
          </div>
        ) : null}
      </div>

      <ModuleHelp>
        <p className="panel-copy">
          Planejamento de materiais com itens, revisao, status e pendencia por documento. Use <strong>Baixar modelo CSV</strong> para obter
          cabecalho e linhas de exemplo (um material por linha; repita numero/revisao/data por linha). Na importacao, se{' '}
          <strong>descricao_material</strong> estiver vazia mas o <strong>codigo</strong> existir no cadastro de materiais, o sistema completa
          a descricao. Use <strong>Visualizar</strong> na lista para ver os itens de qualquer documento (inclusive parcial ou atendido).{' '}
          <strong>Excel - itens</strong> gera uma linha por material: dados do documento (numero, revisao, descricao), do material (codigo,
          descricao, disciplina, saldo do cadastro), unidade, <strong>quantidade no documento</strong> (por desenho), atendida e pendente nesse
          documento, <strong>quantidade prevista</strong> (soma do codigo em todos os documentos ativos), totais <strong>atendido</strong> e{' '}
          <strong>recebido</strong> por codigo, <strong>status de planejamento</strong> da linha (Pendente/Parcial/Recebido/Atendido), pesos e
          saldo; colunas <code>localizacao_planejamento</code> (texto salvo no item do documento) e{' '}
          <code>localizacao_consolidada</code> (mesma regra da folha de campo: recebimentos agregados ou, se vazio, o texto do documento); arquivo
          CSV com separador <code>;</code> para abrir no Excel em portugues.
          Use <strong>(tudo)</strong> para todos
          os documentos ou <strong>(filtro)</strong> apenas os da lista filtrada. Atualizacao por import so para documentos pendentes (mesmo
          numero e revisao).
        </p>
      </ModuleHelp>

      <OperationalNotice>
        {cloudStatus === 'ready' && hasCloudConfig
          ? 'Fonte atual: Supabase. Planejamento sincronizado com a base em nuvem.'
          : cloudStatus === 'partial'
            ? 'Fonte atual: fallback local. Configuracao do Supabase incompleta.'
            : 'Fonte atual: fallback local. Supabase ainda nao esta configurado.'}
      </OperationalNotice>
      {fallbackReason ? (
        <OperationalNotice tone="warning">
          {`Fallback ativo por falha de consulta: ${fallbackReason}. O telemovel so le a nuvem — se ve desenhos aqui mas nao no app, use o botao abaixo para gravar esta lista no Supabase.`}
        </OperationalNotice>
      ) : null}
      {hasCloudConfig && canEdit && planejamentoMaisNoLocal && planejamentoDiag ? (
        <OperationalNotice tone="warning">
          <strong>Atencao — copia local maior que a nuvem:</strong> o snapshot no Supabase tem{' '}
          <strong>{planejamentoDiag.noSnapshot}</strong> documento(s), mas este navegador tem <strong>{planejamentoDiag.noNavegador}</strong>{' '}
          em armazenamento local. A tabela abaixo reflete a <strong>nuvem</strong>; trabalho extra pode existir só neste PC. Exporte ou use{' '}
          <strong>Enviar planejamento deste PC para a nuvem</strong> apos confirmar qual versao deve prevalecer (a accao substitui o snapshot
          remoto).
        </OperationalNotice>
      ) : null}
      {hasCloudConfig &&
      canEdit &&
      planejamentoDiag &&
      planejamentoDiag.noSnapshot === 0 &&
      planejamentoDiag.noNavegador > 0 ? (
        <OperationalNotice tone="warning">
          <strong>Planejamento so neste navegador:</strong> o snapshot na nuvem tem <strong>0</strong> documento(s), mas este computador tem{' '}
          <strong>{planejamentoDiag.noNavegador}</strong> no armazenamento local. Colaboradores e outros modulos podem ja estar na nuvem; os
          desenhos so chegam ao telemovel depois de gravar no snapshot. Toque em <strong>Enviar planejamento deste PC para a nuvem</strong>{' '}
          abaixo (ou abra cada documento e salve com Supabase ligado).
        </OperationalNotice>
      ) : null}
      {hasCloudConfig &&
      canEdit &&
      (documentosSource === 'local' ||
        Boolean(fallbackReason) ||
        planejamentoMaisNoLocal ||
        (planejamentoDiag != null &&
          planejamentoDiag.noSnapshot === 0 &&
          planejamentoDiag.noNavegador > 0)) ? (
        <div className="form-actions" style={{ marginBottom: 12 }}>
          <Button type="button" variant="primary" disabled={syncingLocalParaNuvem} onClick={() => void enviarPlanejamentoLocalParaNuvem()}>
            {syncingLocalParaNuvem ? 'A enviar…' : 'Enviar planejamento deste PC para a nuvem (mobile)'}
          </Button>
        </div>
      ) : null}

      <SnapshotConflictHint
        show={importSnapshotConflict}
        onReload={() => void reloadAfterImportSnapshotConflict()}
      />

      <DocumentoFilters filters={filters} onChange={setFilters} />

      {error ? <div className="error-box">{error}</div> : null}
      {success ? <OperationalNotice>{success}</OperationalNotice> : null}
      {canAdminister ? (
        <ModuleHelp>
          <OperationalNotice tone="warning">
            Cancelamento: documentos <strong>pendentes</strong> cancelam com confirmacao simples. Com status{' '}
            <strong>parcial</strong>, <strong>recebido</strong> ou <strong>atendido</strong>, use <strong>Cancelar (adm.)</strong>:
            justificativa obrigatoria (min. 15 caracteres) e registro em auditoria. Isso remove o documento do planejamento;{' '}
            <strong>nao estorna</strong> recebimentos nem atendimentos — use os fluxos operacionais proprios se precisar corrigir estoque.{' '}
            <strong>Excluir definitivamente</strong> apaga a linha do documento (com senha); use apenas quando quiser eliminar o registo do
            planejamento. Se existir <strong>atendimento de material</strong> registrado para aquele documento, o sistema <strong>bloqueia</strong> a
            exclusao e mostra o motivo. A caixa de selecao do cabecalho da tabela marca <strong>somente a pagina atual</strong>; para marcar{' '}
            <strong>todos</strong> os registos que correspondem ao filtro (ex.: milhares), use os botoes <strong>logo abaixo da tabela</strong>.
          </OperationalNotice>
        </ModuleHelp>
      ) : null}

      {loading ? (
        <OperationalNotice>Carregando documentos...</OperationalNotice>
      ) : (
        <>
          <DocumentosTable
            canAdminister={canAdminister}
            canEdit={canEdit}
            items={items}
            onCancel={handleCancelar}
            onEdit={openEditModal}
            onExcluirDefinitivo={canAdminister ? abrirExclusaoDefinitivaDocumento : undefined}
            onToggleSelect={canAdminister ? toggleSelectDocumentoId : undefined}
            onToggleSelectPagina={canAdminister ? toggleSelectDocumentosPaginaAtual : undefined}
            onView={(item) => void openViewDocumento(item)}
            selectedIds={canAdminister ? selectedDocumentIdSet : undefined}
          />
          {canAdminister ? (
            <div className="editor-block" style={{ marginTop: 12, marginBottom: 8 }}>
              <ModuleHelp>
                <p className="panel-copy" style={{ marginBottom: 8 }}>
                  <strong>Selecao em massa:</strong> a coluna de caixas marca <strong>esta pagina</strong>. Para incluir{' '}
                  <strong>todos os documentos</strong> do filtro atual em todas as paginas
                  {total > 0 ? ` (${total} registro(s))` : ''}, use o botao abaixo; depois <strong>Excluir selecionados...</strong> (senha).
                </p>
              </ModuleHelp>
              <div className="form-actions" style={{ flexWrap: 'wrap', alignItems: 'center' }}>
                <span style={{ marginRight: 8, fontSize: '0.9rem' }}>
                  {selectedDocumentIds.length} selecionado(s)
                  {total > 0 ? ` · ${total} no filtro atual` : null}
                </span>
                <Button
                  disabled={selectAllFilteredBusy || loading || total === 0}
                  onClick={() => void selectAllDocumentosFiltered()}
                  type="button"
                  variant="ghost"
                >
                  {selectAllFilteredBusy
                    ? 'A selecionar...'
                    : total > 0
                      ? `Selecionar todos os ${total} documentos (filtro atual)`
                      : 'Selecionar todos (filtro atual)'}
                </Button>
                <Button disabled={!selectedDocumentIds.length} onClick={clearDocumentosSelection} type="button" variant="ghost">
                  Limpar selecao
                </Button>
                <Button
                  disabled={!selectedDocumentIds.length}
                  onClick={abrirExclusaoDefinitivaEmMassa}
                  type="button"
                  variant="danger"
                >
                  Excluir selecionados...
                </Button>
              </div>
            </div>
          ) : null}
          <Pagination
            onPageChange={(page) => setFilters({ ...filters, page })}
            page={filters.page}
            pageSize={filters.pageSize}
            total={total}
          />
        </>
      )}

      {!canEdit && !canAdminister ? (
        <OperationalNotice>Seu perfil pode visualizar documentos, mas nao pode alterar planejamento.</OperationalNotice>
      ) : null}

      <Modal
        onClose={fecharExclusaoDefinitivaDocumento}
        open={idsParaExcluirDocumentos.length > 0 && canAdminister}
        title={idsParaExcluirDocumentos.length > 1 ? 'Excluir documentos definitivamente' : 'Excluir documento definitivamente'}
        wide
      >
        {idsParaExcluirDocumentos.length > 0 ? (
          <div className="editor-block">
            <p>
              <strong>{idsParaExcluirDocumentos.length}</strong> documento(s) sera(ao) removido(s) do planejamento (nao ficam nem como
              cancelados). Esta accao e irreversivel.
            </p>
            <p className="panel-copy" style={{ marginTop: 8 }}>
              Recebimentos e atendimentos ja registados nao sao estornados automaticamente. Confirme com a sua senha. Com o foco no campo
              abaixo, pode premir <kbd>Enter</kbd> para confirmar.
            </p>
            <div style={{ marginTop: 12 }}>
              <p className="form-label" style={{ marginBottom: 6 }}>
                Documentos a remover
                {excluirModalResumosLoading ? (
                  <span className="panel-copy"> (a carregar...)</span>
                ) : (
                  <span className="panel-copy">
                    {' '}
                    ({resumoLinhasExclusao.total} encontrado(s) no cadastro
                    {idsParaExcluirDocumentos.length !== resumoLinhasExclusao.total
                      ? ` · ${idsParaExcluirDocumentos.length} pedido(s)`
                      : ''}
                    )
                  </span>
                )}
              </p>
              {excluirModalResumosLoading ? null : idsParaExcluirDocumentos.length > 0 &&
                resumoLinhasExclusao.total < idsParaExcluirDocumentos.length ? (
                <p className="panel-copy" style={{ marginBottom: 8 }}>
                  Apenas {resumoLinhasExclusao.total} documento(s) encontrados no planejamento atual para os IDs selecionados.
                </p>
              ) : null}
              {excluirModalResumosLoading ? null : resumoLinhasExclusao.total > 0 ? (
                <div
                  style={{
                    marginBottom: 12,
                    maxHeight: 220,
                    overflow: 'auto',
                    padding: '8px 10px',
                    fontSize: '0.88rem',
                    lineHeight: 1.45,
                    border: '1px solid var(--border-subtle, rgba(255,255,255,0.12))',
                    borderRadius: 6,
                    fontFamily: 'ui-monospace, monospace',
                  }}
                >
                  {resumoLinhasExclusao.visiveis.map((r, index) => (
                    <div key={`${index}-${r.numero}-${r.revisao}`}>
                      {encurtarLinhaDocumentoResumo(`${r.numero} Rev. ${r.revisao}`)}
                    </div>
                  ))}
                  {resumoLinhasExclusao.restantes > 0 ? (
                    <div style={{ marginTop: 6, fontStyle: 'italic' }}>
                      ... e mais {resumoLinhasExclusao.restantes} documento(s).
                    </div>
                  ) : null}
                </div>
              ) : !excluirModalResumosLoading ? (
                <p className="panel-copy" style={{ marginBottom: 12 }}>
                  Nenhum documento encontrado para os IDs selecionados.
                </p>
              ) : null}
            </div>
            <div style={{ marginTop: 12 }}>
              <label className="form-label" htmlFor="documento-excluir-senha">
                Senha
              </label>
              <input
                autoComplete="current-password"
                className="form-input"
                id="documento-excluir-senha"
                onChange={(e) => setExcluirDefinitivoSenha(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key !== 'Enter') return;
                  e.preventDefault();
                  if (excluirDefinitivoBusy || !excluirDefinitivoSenha.trim()) return;
                  void confirmarExclusaoDefinitivaDocumento();
                }}
                type="password"
                value={excluirDefinitivoSenha}
              />
            </div>
            {excluirDefinitivoBusy ? (
              <div style={{ marginTop: 12 }}>
                <OperationalNotice>A processar...</OperationalNotice>
              </div>
            ) : null}
            <div className="form-actions" style={{ marginTop: 16 }}>
              <Button disabled={excluirDefinitivoBusy} onClick={fecharExclusaoDefinitivaDocumento} type="button" variant="ghost">
                Cancelar
              </Button>
              <Button
                disabled={excluirDefinitivoBusy || !excluirDefinitivoSenha.trim()}
                onClick={() => void confirmarExclusaoDefinitivaDocumento()}
                type="button"
                variant="danger"
              >
                Excluir definitivamente
              </Button>
            </div>
          </div>
        ) : null}
      </Modal>

      <Modal
        onClose={fecharCancelamentoAdministrativo}
        open={Boolean(cancelDocAlvo) && canAdminister}
        title="Cancelamento administrativo do documento"
        wide
      >
        {cancelDocAlvo ? (
          <div className="editor-block">
            <OperationalNotice tone="critical">
              Documento <strong>{cancelDocAlvo.numero}</strong> rev. <strong>{cancelDocAlvo.revisao}</strong> — status atual:{' '}
              <strong>{cancelDocAlvo.status}</strong>. Ao confirmar, o planejamento deixa de contar no sistema (metricas e listas).
              Recebimentos e atendimentos <strong>permanecem</strong> como registrados.
            </OperationalNotice>
            <label className="field">
              <span>Justificativa (minimo 15 caracteres) *</span>
              <textarea
                className="input-control text-area"
                onChange={(event) => setCancelMotivo(event.target.value)}
                placeholder="Ex.: Obra suspensa; documento substituido pela revisao C; escopo retirado do contrato..."
                rows={4}
                value={cancelMotivo}
              />
            </label>
            {cancelError ? <div className="error-box">{cancelError}</div> : null}
            <div className="form-actions">
              <Button disabled={cancelSaving} onClick={fecharCancelamentoAdministrativo} type="button" variant="ghost">
                Voltar
              </Button>
              <Button disabled={cancelSaving} onClick={() => void confirmarCancelamentoAdministrativo()} type="button" variant="danger">
                {cancelSaving ? 'Cancelando...' : 'Confirmar cancelamento'}
              </Button>
            </div>
          </div>
        ) : null}
      </Modal>

      <Modal onClose={closeModal} open={isModalOpen && canEdit} title={selected ? 'Editar documento' : 'Novo documento'} wide>
        <DocumentoForm
          key={selected?.id ?? 'new-doc'}
          initialValue={formInitialValue}
          onCancel={closeModal}
          onReloadAfterConflict={async () => {
            await load();
            closeModal();
          }}
          onSubmit={submitDocumento}
        />
      </Modal>

      <Modal
        onClose={() => {
          if (!importingDocumentos) cancelImportDocumentosStaging();
        }}
        open={Boolean(importStaging) && canEdit}
        title="Confirmar importacao"
        wide
      >
        {importStaging ? (
          <div className="editor-block">
            <p>
              Importar <strong>{importStaging.linhaCount}</strong> linha(s) de dados do arquivo{' '}
              <strong>{importStaging.fileName}</strong>?
            </p>
            {importingDocumentos ? (
              <OperationalNotice>Importando documentos...</OperationalNotice>
            ) : null}
            <div className="form-actions" style={{ marginTop: 16 }}>
              <Button disabled={importingDocumentos} onClick={cancelImportDocumentosStaging} type="button" variant="ghost">
                Cancelar
              </Button>
              <Button disabled={importingDocumentos} onClick={() => void confirmImportDocumentosStaging()} type="button">
                Importar
              </Button>
            </div>
          </div>
        ) : null}
      </Modal>

      <Modal onClose={closeImportDocumentosResultado} open={Boolean(importResultado)} title="Importacao concluida" wide>
        {importResultado ? (
          <div className="editor-block">
            <p>
              <strong>{importResultado.criados}</strong> novo(s), <strong>{importResultado.atualizados}</strong>{' '}
              atualizado(s), <strong>{importResultado.ignorados}</strong> ignorado(s).
            </p>
            {importResultado.detalhes.length ? (
              <div style={{ marginTop: 12, maxHeight: 240, overflow: 'auto', fontSize: '0.9rem' }}>
                {importResultado.detalhes.map((linha) => (
                  <div key={linha}>{linha}</div>
                ))}
              </div>
            ) : null}
            <div className="form-actions" style={{ marginTop: 16 }}>
              <Button onClick={closeImportDocumentosResultado} type="button">
                OK
              </Button>
            </div>
          </div>
        ) : null}
      </Modal>

      <Modal
        onClose={closeViewDocument}
        open={Boolean(viewDocument)}
        title={viewDocument ? `${viewDocument.numero} Rev. ${viewDocument.revisao}` : 'Documento'}
        wide
      >
        {viewDocument ? (
          <div className="editor-block">
            <p className="panel-copy" style={{ marginTop: 0 }}>
              {viewDocument.descricao || 'Sem descricao.'} — Responsavel: {viewDocument.responsavel || '-'} — Data:{' '}
              {viewDocument.dataDocumento}
            </p>
            <div className="table-shell">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Codigo</th>
                    <th>Descricao</th>
                    <th>Localização (estoque)</th>
                    <th>UM</th>
                    <th>Quantidade do documento</th>
                    <th>Qtd atendida</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {viewDocument.itens.length === 0 ? (
                    <tr>
                      <td colSpan={7}>
                        Nenhum item neste documento.
                      </td>
                    </tr>
                  ) : (
                    viewDocument.itens.map((it) => {
                      const st =
                        it.codigoMaterial.trim() && metricasVisualizacao.size > 0
                          ? resolverStatusLinhaDocumento(it, metricasVisualizacao)
                          : null;
                      const meta = st ? statusLinhaPlanejamentoMeta(st) : null;
                      return (
                        <tr key={it.id}>
                          <td>{it.codigoMaterial}</td>
                          <td style={{ minWidth: 240, maxWidth: 520, whiteSpace: 'normal', wordBreak: 'break-word' }}>
                            {it.descricaoMaterial}
                          </td>
                          <td style={{ whiteSpace: 'pre-wrap', maxWidth: 320 }}>
                            {resolverLocalizacaoExibicaoPlanejamento(it, localizacoesRecebimentoVisualizacao) || '—'}
                          </td>
                          <td>{it.unidade}</td>
                          <td>{it.quantidadeProjeto}</td>
                          <td>{it.quantidadeAtendida}</td>
                          <td>
                            {meta ? <StatusBadge text={meta.text} tone={meta.tone} /> : <span>-</span>}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
            <div className="form-actions">
              <Button onClick={closeViewDocument} type="button" variant="ghost">
                Fechar
              </Button>
              <Button
                disabled={folhaCampoBusy}
                onClick={() => {
                  if (!viewDocument) return;
                  const ok = imprimirPlanejamentoCampoHtml(
                    viewDocument,
                    metricasVisualizacao,
                    localizacoesRecebimentoVisualizacao,
                  );
                  if (!ok) {
                    window.alert('Nao foi possivel abrir a impressao. Verifique pop-ups ou o ambiente desktop.');
                  }
                }}
                type="button"
                variant="ghost"
              >
                Imprimir / PDF (folha de campo, paisagem)
              </Button>
              <Button
                disabled={folhaCampoBusy}
                onClick={() => {
                  if (!viewDocument) return;
                  setFolhaCampoBusy(true);
                  void (async () => {
                    try {
                      const html = montarHtmlPlanejamentoCampo(
                        viewDocument,
                        metricasVisualizacao,
                        localizacoesRecebimentoVisualizacao,
                      );
                      const res = await abrirPreVisualizacaoHtmlRelatorio(html);
                      if (!res.ok && res.error) {
                        window.alert(res.error);
                      }
                    } finally {
                      setFolhaCampoBusy(false);
                    }
                  })();
                }}
                type="button"
              >
                Visualizar
              </Button>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
