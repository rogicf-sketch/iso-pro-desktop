import { startTransition, useMemo, useState } from 'react';
import { Pagination } from '../../../components/tables/Pagination';
import { Button } from '../../../components/ui/Button';
import { Modal } from '../../../components/ui/Modal';
import { ModuleHelp } from '../../../components/ui/ModuleHelp';
import { OperationalNotice } from '../../../components/ui/OperationalNotice';
import { FonteDadosNotice } from '../../../components/ui/FonteDadosNotice';
import { SnapshotConflictHint } from '../../../components/ui/SnapshotConflictHint';
import { StatusBadge } from '../../../components/ui/StatusBadge';
import { createStatusMeta } from '../../../components/ui/statusMeta';
import { traduzirErroImpressaoIsoPro } from '../../../lib/traduzirErroImpressaoIsoPro';
import { descarregarLogRelatorioImportacao } from '../../../lib/importacaoRelatorioLog';
import { resolveFonteNuvemOk } from '../../../lib/fonteNuvemLista';
import { getSupabaseOperationalStatus } from '../../../lib/supabase';
import { usePageChrome } from '../../../layouts/PageChromeContext';
import { useAuth } from '../../auth/hooks/useAuth';
import { DocumentoFilters } from '../components/DocumentoFilters';
import { DocumentoForm } from '../components/DocumentoForm';
import { DocumentosTable } from '../components/DocumentosTable';
import { useDocumentos } from '../hooks/useDocumentos';
import {
  resolverLocalizacaoExibicaoPlanejamento,
  resolverStatusLinhaDocumento,
} from '../services/documentoPlanejamento';
import {
  imprimirPlanejamentoCampoHtml,
  preVisualizarPlanejamentoCampoHtml,
} from '../utils/imprimirPlanejamentoCampoHtml';
import { formatarDataDocumentoPtBr } from '../utils/formatarDataDocumento';

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
  const [folhaCampoBusy, setFolhaCampoBusy] = useState(false);
  const [folhaCampoAviso, setFolhaCampoAviso] = useState<string | null>(null);
  const cloudStatus = getSupabaseOperationalStatus();
  const {
    items,
    total,
    loading,
    refreshing,
    error,
    success,
    fallbackReason,
    documentosSource,
    staleWhileRevalidate,
    syncingLocalParaNuvem,
    enviarPlanejamentoLocalParaNuvem,
    planejamentoDiag,
    planejamentoMaisNoLocal,
    planejamentoNuvemSemLinhas,
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
    importProgress,
    lendoArquivoImportacao,
    importResultado,
    setImportStagingCancelarRevisoes,
    salvarRevisoesStaging,
    salvarRevisoesBusy,
    confirmarSalvarComOpcaoRevisoes,
    cancelarSalvarRevisoesStaging,
    exportDocumentosCsvResumo,
    exportDocumentosCsvResumoFiltrado,
    exportingDocumentosCsv,
    openImportDocumentosPicker,
    openAtualizarDescricoesPicker,
    downloadModeloCsvImportacaoDocumentos,
    stageImportDocumentosFromFile,
    cancelImportDocumentosStaging,
    confirmImportDocumentosStaging,
    closeImportDocumentosResultado,
    reloadAfterImportSnapshotConflict,
    importHistoricoBloqueio,
    importSubstituirPasso,
    importSubstituirSenha,
    setImportSubstituirSenha,
    importSubstituirBusy,
    fecharImportHistoricoBloqueio,
    avancarImportSubstituirComLimpeza,
    voltarImportSubstituirComLimpeza,
    confirmarImportSubstituirComLimpezaHistorico,
    viewDocument,
    viewDocumentLoading,
    viewDocumentOpeningId,
    viewPlanejamentoMetricas,
    viewPlanejamentoLocalizacoes,
    viewPlanejamentoMetricasAviso,
    viewPlanejamentoMetricasPending,
    ensureViewPlanejamentoMetricas,
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

  const fonteNuvemOk = resolveFonteNuvemOk({
    listSource: documentosSource ?? 'local',
    hasCloudConfig,
    staleWhileRevalidate,
    fallbackReason,
  });

  usePageChrome(
    {
      meta:
        loading && total === 0
          ? 'A carregar…'
          : `${total.toLocaleString('pt-BR')} documentos · ${fonteNuvemOk ? 'nuvem' : 'local'}`,
    },
    [loading, total, fonteNuvemOk],
  );

  return (
    <div className="panel">
      <div className="panel-header panel-header--toolbar panel-header--actions-only">
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
                <Button
                  type="button"
                  variant="ghost"
                  onClick={openAtualizarDescricoesPicker}
                  title="Atualiza so a descricao de desenhos ja existentes (qualquer status). Use o mesmo modelo CSV da importacao (numero;revisao;descricao)."
                >
                  Atualizar descrições
                </Button>
                <Button type="button" variant="ghost" onClick={downloadModeloCsvImportacaoDocumentos}>
                  Modelo
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  disabled={Boolean(exportingDocumentosCsv)}
                  onClick={() => void exportDocumentosCsvResumo()}
                >
                  {exportingDocumentosCsv === 'tudo' ? 'A exportar…' : 'Exportar itens (tudo)'}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  disabled={Boolean(exportingDocumentosCsv)}
                  onClick={() => void exportDocumentosCsvResumoFiltrado()}
                >
                  {exportingDocumentosCsv === 'filtro' ? 'A exportar…' : 'Exportar itens (filtro)'}
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
          Planejamento de materiais com itens, revisão, status e pendência por documento. Use <strong>Baixar modelo CSV</strong> para obter
          cabeçalho e linhas de exemplo (um material por linha; repita numero/revisao/data por linha). A coluna{' '}
          <strong>descricao_documento</strong> (ou <strong>descricao</strong>) é <strong>obrigatória</strong> por documento
          (basta numa das linhas desse desenho). Use <strong>Atualizar descrições</strong> com o{' '}
          <strong>mesmo modelo CSV da importação</strong> (só lê <code>numero</code>, <code>revisao</code> e{' '}
          <code>descricao</code>; o resto é ignorado) para corrigir só o texto em desenhos já existentes (mesmo se não
          estiverem pendentes). Na importação completa, se{' '}
          <strong>descricao_material</strong> estiver vazia mas o <strong>codigo</strong> existir no cadastro de materiais, o sistema completa
          a descrição. <strong>Visualizar</strong> abre a lista de itens do documento; dentro do modal use{' '}
          <strong>Pré-visualizar folha de campo</strong> ou <strong>Imprimir / PDF</strong> para a folha de campo em paisagem.{' '}
          <strong>Excel - itens</strong> gera uma linha por material: dados do documento (numero, revisao, descricao), do material (codigo,
          descricao, disciplina, saldo do cadastro), unidade, <strong>quantidade no documento</strong> (por desenho), atendida e pendente nesse
          documento, <strong>quantidade prevista</strong> (soma do codigo em todos os documentos ativos), totais <strong>atendido</strong> e{' '}
          <strong>recebido</strong> por codigo, <strong>status de planejamento</strong> da linha (Pendente/Parcial/Recebido/Atendido), pesos e
          saldo; colunas <code>localizacao_planejamento</code> (texto salvo no item do documento) e{' '}
          <code>localizacao_consolidada</code> (mesma regra da folha de campo: recebimentos agregados ou, se vazio, o texto do documento); arquivo
          CSV com separador <code>;</code> para abrir no Excel em português.
          Use <strong>(tudo)</strong> para todos
          os documentos ou <strong>(filtro)</strong> apenas os da lista filtrada. Atualização por import só para documentos pendentes (mesmo
          numero e revisao).
        </p>
      </ModuleHelp>

      <FonteDadosNotice
        healthy={!loading && fonteNuvemOk}
        fallbackMessage={
          loading && hasCloudConfig
            ? 'A carregar planejamento da nuvem…'
            : hasCloudConfig
              ? 'Cópia local / desatualizada — a nuvem nao confirmou esta lista. Nao use como verdade unica; o telemóvel só lê a nuvem.'
              : cloudStatus === 'partial'
                ? 'Fonte atual: fallback local. Configuração do Supabase incompleta.'
                : 'Fonte atual: fallback local. Supabase ainda não está configurado.'
        }
      />
      <ModuleHelp>
        <OperationalNotice>
          Status (lista = detalhe): <strong>Pendente</strong> = sem estoque/saldo;
          <strong> Recebido</strong> = material no estoque (QTD ATENDIDA pode ser 0);
          <strong> Parcial</strong> = mistura; <strong>Atendido</strong> = baixado no Atendimento;
          <strong> Cancelado</strong> = anulado. A barra em Qtd. atendida mostra o % baixado.
        </OperationalNotice>
      </ModuleHelp>
      {fallbackReason ? (
        <OperationalNotice tone="warning">
          {fallbackReason.includes('alinhar o status')
            ? fallbackReason
            : `Fallback ativo por falha de consulta: ${fallbackReason}. O telemóvel só lê a nuvem — se vê desenhos aqui mas não no app, use o botão abaixo para gravar esta lista no Supabase.`}
        </OperationalNotice>
      ) : null}
      {hasCloudConfig && canEdit && planejamentoMaisNoLocal && planejamentoDiag ? (
        <OperationalNotice tone="warning">
          <strong>Atenção — cópia local maior que a nuvem:</strong> o snapshot no Supabase tem{' '}
          <strong>{planejamentoDiag.noSnapshot}</strong> documento(s), mas este navegador tem <strong>{planejamentoDiag.noNavegador}</strong>{' '}
          em armazenamento local. A tabela abaixo reflete a <strong>nuvem</strong>; trabalho extra pode existir só neste PC. Exporte ou use{' '}
          <strong>Enviar planejamento deste PC para a nuvem</strong> após confirmar qual versão deve prevalecer (a acção substitui o snapshot
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
      {hasCloudConfig && canEdit && planejamentoNuvemSemLinhas && planejamentoDiag ? (
        <OperationalNotice tone="warning">
          <strong>Mobile sem lista de material:</strong> a nuvem tem <strong>{planejamentoDiag.noSnapshot}</strong> desenho(s), mas apenas{' '}
          <strong>{planejamentoDiag.comItensNaNuvem}</strong> com linhas de material ({planejamentoDiag.totalItensNaNuvem} linha(s) no total).
          Neste PC ha <strong>{planejamentoDiag.totalItensNoLocal}</strong> linha(s) em <strong>{planejamentoDiag.comItensNoLocal}</strong>{' '}
          desenho(s). O telemovel nao consegue carregar materiais ate gravar o planejamento completo — use{' '}
          <strong>Enviar planejamento deste PC para a nuvem</strong> abaixo e depois «Carregar dados da nuvem» no mobile.
        </OperationalNotice>
      ) : null}
      {hasCloudConfig &&
      canEdit &&
      planejamentoDiag != null &&
      planejamentoDiag.noNavegador > 0 &&
      (planejamentoMaisNoLocal ||
        planejamentoNuvemSemLinhas ||
        (planejamentoDiag.noSnapshot === 0 && planejamentoDiag.noNavegador > 0)) ? (
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

      {lendoArquivoImportacao ? <OperationalNotice>A ler o arquivo...</OperationalNotice> : null}
      {error ? <div className="error-box">{error}</div> : null}
      {exportingDocumentosCsv ? (
        <OperationalNotice>
          {exportingDocumentosCsv === 'filtro'
            ? `A exportar itens do filtro atual (${total.toLocaleString('pt-BR')} documento${total === 1 ? '' : 's'})… Aguarde o download.`
            : 'A exportar todos os itens do planejamento para Excel… Aguarde o download.'}
        </OperationalNotice>
      ) : null}
      {success ? <OperationalNotice tone="success">{success}</OperationalNotice> : null}
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
          {refreshing ? <OperationalNotice>A actualizar página…</OperationalNotice> : null}
          <DocumentosTable
            canAdminister={canAdminister}
            canEdit={canEdit}
            items={items}
            onCancel={handleCancelar}
            onEdit={openEditModal}
            onExcluirDefinitivo={canAdminister ? abrirExclusaoDefinitivaDocumento : undefined}
            onToggleSelect={canAdminister ? toggleSelectDocumentoId : undefined}
            onToggleSelectPagina={canAdminister ? toggleSelectDocumentosPaginaAtual : undefined}
            onVisualizar={(item) => void openViewDocumento(item)}
            visualizarBusyId={viewDocumentOpeningId}
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
            itemLabel="documentos"
            onPageChange={(page) => {
              startTransition(() => setFilters({ ...filters, page }));
            }}
            onPagePrefetch={undefined}
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
        title={importStaging?.modo === 'descricoes' ? 'Confirmar atualização de descrições' : 'Confirmar importacao'}
        wide
      >
        {importStaging ? (
          <div className="editor-block">
            {importStaging.modo === 'descricoes' ? (
              <>
                <OperationalNotice tone="warning">
                  Isto actualiza <strong>apenas a descricao</strong> de desenhos ja existentes (qualquer status). Nao cria
                  documentos nem altera itens ou quantidades.
                </OperationalNotice>
                <p style={{ marginTop: 12 }}>
                  Atualizar descrição de <strong>{importStaging.linhaCount}</strong> documento(s) a partir de{' '}
                  <strong>{importStaging.fileName}</strong>?
                </p>
              </>
            ) : (
              <>
                <p>
                  Importar <strong>{importStaging.linhaCount}</strong> linha(s) de dados do arquivo{' '}
                  <strong>{importStaging.fileName}</strong>?
                </p>
                {importStaging.revisoesAntigasActivas && importStaging.revisoesAntigasActivas.length > 0 ? (
                  <div style={{ marginTop: 12 }}>
                    <OperationalNotice tone="warning">
                      Existem <strong>{importStaging.revisoesAntigasActivas.length}</strong> revisao(oes) activa(s) do
                      mesmo numero (outra revisao). Nao e cancelamento automatico — marque a opcao abaixo se a revisao
                      nova substitui a antiga.
                    </OperationalNotice>
                    <ul className="panel-copy" style={{ margin: '8px 0 0', paddingLeft: 18, maxHeight: 160, overflow: 'auto' }}>
                      {importStaging.revisoesAntigasActivas.slice(0, 40).map((r) => (
                        <li key={r.id}>
                          {r.numero} Rev. {r.revisao} ({r.status})
                        </li>
                      ))}
                      {importStaging.revisoesAntigasActivas.length > 40 ? (
                        <li>… e mais {importStaging.revisoesAntigasActivas.length - 40}</li>
                      ) : null}
                    </ul>
                    <label
                      style={{
                        display: 'flex',
                        gap: 8,
                        alignItems: 'flex-start',
                        marginTop: 12,
                        cursor: importingDocumentos ? 'default' : 'pointer',
                      }}
                    >
                      <input
                        checked={importStaging.cancelarRevisoesAntigas === true}
                        disabled={importingDocumentos}
                        onChange={(e) => setImportStagingCancelarRevisoes(e.target.checked)}
                        type="checkbox"
                      />
                      <span className="panel-copy">
                        Cancelar essas revisoes antigas activas ao importar (motivo: substituida pela revisao do ficheiro)
                      </span>
                    </label>
                  </div>
                ) : null}
              </>
            )}
            {importingDocumentos ? (
              <OperationalNotice>
                {importProgress || 'A gravar na nuvem…'} A janela fecha sozinha com o resultado.
              </OperationalNotice>
            ) : null}
            <div className="form-actions" style={{ marginTop: 16 }}>
              <Button disabled={importingDocumentos} onClick={cancelImportDocumentosStaging} type="button" variant="ghost">
                Cancelar
              </Button>
              <Button disabled={importingDocumentos} onClick={() => void confirmImportDocumentosStaging()} type="button">
                {importStaging.modo === 'descricoes' ? 'Atualizar descrições' : 'Importar'}
              </Button>
            </div>
          </div>
        ) : null}
      </Modal>

      <Modal
        onClose={cancelarSalvarRevisoesStaging}
        open={Boolean(salvarRevisoesStaging) && canEdit}
        title="Outras revisoes do mesmo numero"
        wide
      >
        {salvarRevisoesStaging ? (
          <div className="editor-block">
            <OperationalNotice tone="warning">
              O numero <strong>{salvarRevisoesStaging.data.numero}</strong> ja tem outras revisoes activas. Se esta a
              criar uma linha nova (nao e subir revisao no mesmo documento), pode cancelar as antigas. Se for so
              complementar, grave sem cancelar.
            </OperationalNotice>
            <ul className="panel-copy" style={{ margin: '12px 0 0', paddingLeft: 18 }}>
              {salvarRevisoesStaging.revisoesAntigasActivas.map((r) => (
                <li key={r.id}>
                  Rev. {r.revisao} — {r.status}
                </li>
              ))}
            </ul>
            <p className="panel-copy" style={{ marginTop: 12 }}>
              Revisao a gravar: <strong>{salvarRevisoesStaging.data.revisao}</strong>
            </p>
            <div className="form-actions" style={{ marginTop: 16, flexWrap: 'wrap', gap: 8 }}>
              <Button disabled={salvarRevisoesBusy} onClick={cancelarSalvarRevisoesStaging} type="button" variant="ghost">
                Voltar
              </Button>
              <Button
                disabled={salvarRevisoesBusy}
                onClick={() => void confirmarSalvarComOpcaoRevisoes(false)}
                type="button"
                variant="ghost"
              >
                Gravar so esta
              </Button>
              <Button disabled={salvarRevisoesBusy} onClick={() => void confirmarSalvarComOpcaoRevisoes(true)} type="button">
                Gravar e cancelar antigas
              </Button>
            </div>
          </div>
        ) : null}
      </Modal>

      <Modal
        onClose={closeImportDocumentosResultado}
        open={Boolean(importResultado)}
        title={
          importResultado && importResultado.criados === 0 && importResultado.atualizados === 0
            ? 'Importacao sem alteracoes'
            : 'Importacao concluida'
        }
        wide
      >
        {importResultado ? (
          <div className="editor-block">
            {importResultado.mensagem ? (
              <OperationalNotice
                tone={
                  importResultado.criados === 0 && importResultado.atualizados === 0 ? 'warning' : 'neutral'
                }
              >
                {importResultado.mensagem}
              </OperationalNotice>
            ) : null}
            <p style={{ marginTop: importResultado.mensagem ? 12 : 0 }}>
              <strong>{importResultado.criados}</strong> novo(s), <strong>{importResultado.atualizados}</strong>{' '}
              atualizado(s), <strong>{importResultado.ignorados}</strong> ignorado(s).
            </p>
            {importResultado.detalhes.length ? (
              <div style={{ marginTop: 12, maxHeight: 280, overflow: 'auto', fontSize: '0.9rem' }}>
                {importResultado.detalhes.slice(0, 40).map((linha, idx) => (
                  <div key={`${idx}-${linha.slice(0, 48)}`}>{linha}</div>
                ))}
                {importResultado.detalhes.length > 40 ? (
                  <div>e mais {importResultado.detalhes.length - 40} linha(s) no log.</div>
                ) : null}
              </div>
            ) : null}
            <div className="form-actions" style={{ marginTop: 16, flexWrap: 'wrap', gap: 8 }}>
              {importResultado.detalhes.length ? (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() =>
                    descarregarLogRelatorioImportacao(
                      {
                        modulo: 'Planejamento',
                        mensagem: importResultado.mensagem,
                        ficheiroOrigem: importResultado.ficheiroOrigem,
                        criados: importResultado.criados,
                        atualizados: importResultado.atualizados,
                        ignorados: importResultado.ignorados,
                        detalhes: importResultado.detalhes,
                      },
                      'planejamento',
                    )
                  }
                >
                  Descarregar log
                </Button>
              ) : null}
              <Button onClick={closeImportDocumentosResultado} type="button">
                Fechar
              </Button>
            </div>
          </div>
        ) : null}
      </Modal>

      <Modal
        onClose={fecharImportHistoricoBloqueio}
        open={Boolean(importHistoricoBloqueio) && canAdminister}
        title="Importacao bloqueada — historico incompatible"
        wide
      >
        {importHistoricoBloqueio ? (
          <div className="editor-block">
            {importSubstituirPasso === 1 ? (
              <>
                <OperationalNotice tone="critical">
                  A gravacao foi bloqueada: o planejamento a gravar nao cobre referencias de atendimento ja
                  existentes na nuvem (historico orfao). Isto tambem acontece se o posto nao leu o catalogo
                  completo antes de importar — nesse caso nao use «substituir».
                </OperationalNotice>
                <p className="panel-copy" style={{ marginTop: 12 }}>
                  {importHistoricoBloqueio.error}
                </p>
                <p className="panel-copy" style={{ marginTop: 12 }}>
                  Opcoes: (1) recarregue a pagina (F5) e volte a importar (o sistema deve manter os{' '}
                  {total.toLocaleString('pt-BR')} desenhos da nuvem e so acrescentar/atualizar os do ficheiro);
                  (2) use <strong>Limpar cadastros local + nuvem</strong> em Configuracoes so se for recomeco
                  total; (3) <strong>substituir e limpar historico incompatible</strong> — remove da nuvem
                  atendimentos/historico que referenciam desenhos fora da lista a gravar (perigoso se a lista
                  estiver incompleta).
                </p>
                {importHistoricoBloqueio.resumo ? (
                  <p className="panel-copy" style={{ marginTop: 8 }}>
                    Pre-visualizacao do ficheiro: {importHistoricoBloqueio.resumo.criados} novo(s),{' '}
                    {importHistoricoBloqueio.resumo.atualizados} atualizado(s),{' '}
                    {importHistoricoBloqueio.resumo.ignorados} ignorado(s).
                  </p>
                ) : null}
                <div className="form-actions" style={{ marginTop: 16 }}>
                  <Button disabled={importSubstituirBusy} onClick={fecharImportHistoricoBloqueio} type="button" variant="ghost">
                    Cancelar
                  </Button>
                  <Button disabled={importSubstituirBusy} onClick={avancarImportSubstituirComLimpeza} type="button" variant="danger">
                    Substituir e limpar historico incompatible
                  </Button>
                </div>
              </>
            ) : (
              <>
                <OperationalNotice tone="critical">
                  Confirmacao final: o planejamento na nuvem sera substituido pelo ficheiro{' '}
                  <strong>{importHistoricoBloqueio.staging.fileName}</strong> e linhas de atendimento/historico que
                  referenciam desenhos fora deste planejamento serao removidas. Esta accao e irreversivel.
                </OperationalNotice>
                <div style={{ marginTop: 12 }}>
                  <label className="form-label" htmlFor="documento-import-substituir-senha">
                    Senha do administrador
                  </label>
                  <input
                    autoComplete="current-password"
                    className="form-input"
                    id="documento-import-substituir-senha"
                    onChange={(e) => setImportSubstituirSenha(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key !== 'Enter') return;
                      e.preventDefault();
                      if (importSubstituirBusy || !importSubstituirSenha.trim()) return;
                      void confirmarImportSubstituirComLimpezaHistorico();
                    }}
                    type="password"
                    value={importSubstituirSenha}
                  />
                </div>
                {importSubstituirBusy ? (
                  <div style={{ marginTop: 12 }}>
                    <OperationalNotice>
                      {importProgress || 'A gravar na nuvem…'} A janela fecha sozinha com o resultado.
                    </OperationalNotice>
                  </div>
                ) : null}
                <div className="form-actions" style={{ marginTop: 16 }}>
                  <Button
                    disabled={importSubstituirBusy}
                    onClick={voltarImportSubstituirComLimpeza}
                    type="button"
                    variant="ghost"
                  >
                    Voltar
                  </Button>
                  <Button
                    disabled={importSubstituirBusy || !importSubstituirSenha.trim()}
                    onClick={() => void confirmarImportSubstituirComLimpezaHistorico()}
                    type="button"
                    variant="danger"
                  >
                    Confirmar substituicao
                  </Button>
                </div>
              </>
            )}
          </div>
        ) : null}
      </Modal>

      <Modal
        browserFullscreen
        onClose={closeViewDocument}
        open={Boolean(viewDocument) || viewDocumentLoading}
        title={
          viewDocument
            ? `${viewDocument.numero} Rev. ${viewDocument.revisao}`
            : viewDocumentLoading
              ? 'A carregar documento…'
              : 'Documento'
        }
        wide
      >
        {viewDocumentLoading && !viewDocument ? (
          <p className="panel-copy" style={{ marginTop: 0 }}>
            A preparar visualizacao…
          </p>
        ) : null}
        {viewDocument ? (
          <div className="editor-block">
            <p className="panel-copy" style={{ marginTop: 0 }}>
              {viewDocument.descricao || 'Sem descricao.'} — Responsavel: {viewDocument.responsavel || '-'} — Data:{' '}
              {formatarDataDocumentoPtBr(viewDocument.dataDocumento)}
            </p>
            {viewPlanejamentoMetricasPending && viewPlanejamentoMetricas.size === 0 ? (
              <p className="panel-copy" style={{ marginTop: 0, marginBottom: 8, opacity: 0.85 }}>
                A actualizar estoque e localização…
              </p>
            ) : viewPlanejamentoMetricasAviso && viewPlanejamentoMetricas.size === 0 ? (
              <OperationalNotice tone="warning">{viewPlanejamentoMetricasAviso}</OperationalNotice>
            ) : viewDocument.status === 'parcial' || viewDocument.status === 'recebido' ? (
              <p className="panel-copy" style={{ marginTop: 0, marginBottom: 8, opacity: 0.85 }}>
                Na lista, <strong>Parcial/Recebido</strong> inclui material já no estoque. A coluna{' '}
                <strong>Qtd. atendida</strong> só sobe com baixa no Atendimento — pode ser 0% e o documento ainda
                Parcial.
              </p>
            ) : null}
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
                      // Enquanto métricas não chegam: «…» (nunca Pendente falso).
                      const st =
                        viewPlanejamentoMetricasPending && viewPlanejamentoMetricas.size === 0
                          ? null
                          : !it.codigoMaterial.trim()
                            ? null
                            : resolverStatusLinhaDocumento(it, viewPlanejamentoMetricas);
                      const meta = st ? statusLinhaPlanejamentoMeta(st) : null;
                      const qDoc = Number(it.quantidadeProjeto) || 0;
                      const qAtd = Number(it.quantidadeAtendida) || 0;
                      const fmtQ = (n: number) =>
                        Number.isInteger(n)
                          ? String(n)
                          : n.toLocaleString('pt-BR', { maximumFractionDigits: 4 });
                      return (
                        <tr key={it.id}>
                          <td>{it.codigoMaterial}</td>
                          <td style={{ minWidth: 240, maxWidth: 520, whiteSpace: 'normal', wordBreak: 'break-word' }}>
                            {it.descricaoMaterial}
                          </td>
                          <td style={{ whiteSpace: 'pre-wrap', maxWidth: 320 }}>
                            {resolverLocalizacaoExibicaoPlanejamento(it, viewPlanejamentoLocalizacoes) || '—'}
                          </td>
                          <td>{it.unidade}</td>
                          <td>{fmtQ(qDoc)}</td>
                          <td>{fmtQ(qAtd)}</td>
                          <td>
                            {viewPlanejamentoMetricasPending && viewPlanejamentoMetricas.size === 0 ? (
                              <span style={{ opacity: 0.65 }}>…</span>
                            ) : meta ? (
                              <StatusBadge text={meta.text} tone={meta.tone} />
                            ) : (
                              <span>—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
            {folhaCampoAviso ? (
              <div style={{ marginTop: 12 }}>
                <OperationalNotice tone="critical">{folhaCampoAviso}</OperationalNotice>
              </div>
            ) : null}
            <div className="form-actions">
              <Button onClick={closeViewDocument} type="button" variant="ghost">
                Fechar
              </Button>
              <Button
                disabled={folhaCampoBusy}
                onClick={() => {
                  if (!viewDocument) return;
                  setFolhaCampoBusy(true);
                  setFolhaCampoAviso(null);
                  void (async () => {
                    try {
                      // Abre já — não bloqueia por aviso de estoque (status pela linha se mapa vazio).
                      const met = await ensureViewPlanejamentoMetricas(viewDocument);
                      // Aviso só se não houver mapa — PDF abre na mesma.
                      if (met.metricasAviso && met.metricas.size === 0) {
                        setFolhaCampoAviso(met.metricasAviso);
                      }
                      const ok = await imprimirPlanejamentoCampoHtml(
                        viewDocument,
                        met.metricas,
                        met.localizacoesRecebimentoPorCodigo,
                      );
                      if (!ok) {
                        setFolhaCampoAviso(
                          traduzirErroImpressaoIsoPro(
                            'Não foi possível abrir o diálogo de impressão. Verifique a impressora padrão.',
                          ),
                        );
                      }
                    } finally {
                      setFolhaCampoBusy(false);
                    }
                  })();
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
                  setFolhaCampoAviso(null);
                  void (async () => {
                    try {
                      const met = await ensureViewPlanejamentoMetricas(viewDocument);
                      if (met.metricasAviso && met.metricas.size === 0) {
                        setFolhaCampoAviso(met.metricasAviso);
                      }
                      const res = await preVisualizarPlanejamentoCampoHtml(
                        viewDocument,
                        met.metricas,
                        met.localizacoesRecebimentoPorCodigo,
                      );
                      if (!res.ok && res.error) {
                        setFolhaCampoAviso(traduzirErroImpressaoIsoPro(res.error));
                      }
                    } finally {
                      setFolhaCampoBusy(false);
                    }
                  })();
                }}
                type="button"
              >
                Pre-visualizar folha de campo
              </Button>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
