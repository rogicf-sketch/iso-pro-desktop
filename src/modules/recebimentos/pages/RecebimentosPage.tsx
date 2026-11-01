import { useMemo } from 'react';
import { Pagination } from '../../../components/tables/Pagination';
import { Button } from '../../../components/ui/Button';
import { Modal } from '../../../components/ui/Modal';
import { ModuleHelp } from '../../../components/ui/ModuleHelp';
import { FonteDadosNotice } from '../../../components/ui/FonteDadosNotice';
import { OperationalNotice } from '../../../components/ui/OperationalNotice';
import { SnapshotConflictHint } from '../../../components/ui/SnapshotConflictHint';
import { resolveFonteNuvemOk } from '../../../lib/fonteNuvemLista';
import { getSupabaseOperationalStatus } from '../../../lib/supabase';
import { usePageChrome } from '../../../layouts/PageChromeContext';
import { useAuth } from '../../auth/hooks/useAuth';
import { RecebimentoFilters } from '../components/RecebimentoFilters';
import { RecebimentoForm } from '../components/RecebimentoForm';
import { RecebimentosTable } from '../components/RecebimentosTable';
import { useRecebimentos } from '../hooks/useRecebimentos';

const MAX_RECEBIMENTOS_RESUMO_MODAL = 60;
const MAX_CARACTERES_LINHA_RESUMO = 90;

function encurtarLinhaResumoRecebimento(texto: string) {
  if (texto.length <= MAX_CARACTERES_LINHA_RESUMO) return texto;
  return `${texto.slice(0, MAX_CARACTERES_LINHA_RESUMO - 3)}...`;
}

export function RecebimentosPage() {
  const { canAccessAction } = useAuth();
  const cloudStatus = getSupabaseOperationalStatus();
  const {
    items,
    total,
    loading,
    error,
    success,
    fallbackReason,
    listSource,
    staleWhileRevalidate,
    hasCloudConfig,
    filters,
    formInitialValue,
    isModalOpen,
    viewOpening,
    selected,
    setFilters,
    openCreateModal,
    openViewModal,
    openEditModal,
    closeModal,
    isViewOnly,
    load,
    submitRecebimento,
    handleCancelar,
    exportRecebimentosExcel,
    exportingRecebimentosCsv,
    downloadModeloCsvImportacaoRecebimentos,
    downloadModeloCsvImportacaoRecebimentosItens,
    importMassInputRef,
    importMassStaging,
    importingRecebimentosMass,
    importMassProgress,
    importMassResultado,
    importMassSnapshotConflict,
    openImportRecebimentosMassaPicker,
    stageImportRecebimentosMassaFromFile,
    cancelImportRecebimentosMassaStaging,
    confirmImportRecebimentosMassaStaging,
    closeImportRecebimentosMassaResultado,
    reloadAfterImportMassSnapshotConflict,
    idsParaExcluirRecebimentos,
    excluirModalResumos,
    excluirModalResumosLoading,
    excluirDefinitivoSenha,
    setExcluirDefinitivoSenha,
    excluirDefinitivoBusy,
    abrirExclusaoDefinitivaRecebimento,
    abrirExclusaoDefinitivaEmMassa,
    fecharExclusaoDefinitivaRecebimento,
    confirmarExclusaoDefinitivaRecebimento,
    destravarContext,
    destravarSenha,
    setDestravarSenha,
    destravarBusy,
    abrirDestravarRecebimento,
    fecharDestravarRecebimento,
    confirmarDestravarRecebimento,
    selectedRecebimentoIds,
    selectedRecebimentoIdSet,
    toggleSelectRecebimentoId,
    toggleSelectRecebimentosPaginaAtual,
    selectAllRecebimentosFiltered,
    selectAllFilteredBusy,
    clearRecebimentosSelection,
  } = useRecebimentos();
  const canEdit = canAccessAction('recebimentos', 'editar');
  const canAdminister = canAccessAction('recebimentos', 'administrar');

  const fonteNuvemOk = resolveFonteNuvemOk({
    listSource,
    hasCloudConfig,
    staleWhileRevalidate,
    fallbackReason,
  });

  usePageChrome(
    {
      meta:
        loading && total === 0
          ? 'A carregar…'
          : `${total.toLocaleString('pt-BR')} recebimentos · ${fonteNuvemOk ? 'nuvem' : 'local'}`,
    },
    [loading, total, fonteNuvemOk],
  );

  const resumoLinhasExclusao = useMemo(() => {
    const total = excluirModalResumos.length;
    const visiveis = excluirModalResumos.slice(0, MAX_RECEBIMENTOS_RESUMO_MODAL);
    const restantes = total - visiveis.length;
    return { total, visiveis, restantes };
  }, [excluirModalResumos]);

  return (
    <div className="panel">
      <div className="panel-header panel-header--toolbar panel-header--actions-only">
        {canEdit ? (
          <div className="panel-toolbar">
            <div className="panel-toolbar__group" role="group" aria-label="Novo recebimento">
              <span className="panel-toolbar__label">Cadastro</span>
              <div className="panel-toolbar__buttons">
                <Button onClick={openCreateModal}>Novo recebimento</Button>
              </div>
            </div>
            <div className="panel-toolbar__group" role="group" aria-label="Importar e exportar CSV">
              <span className="panel-toolbar__label">Planilha CSV</span>
              <div className="panel-toolbar__buttons">
                <Button type="button" variant="ghost" onClick={openImportRecebimentosMassaPicker}>
                  Importar em massa
                </Button>
                <Button type="button" variant="ghost" onClick={downloadModeloCsvImportacaoRecebimentos}>
                  Modelo em massa
                </Button>
                <Button type="button" variant="ghost" onClick={downloadModeloCsvImportacaoRecebimentosItens}>
                  Modelo itens
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  disabled={exportingRecebimentosCsv}
                  onClick={() => void exportRecebimentosExcel()}
                >
                  {exportingRecebimentosCsv ? 'A exportar…' : 'Exportar'}
                </Button>
              </div>
            </div>
            <input
              accept=".csv,.txt,text/csv"
              onChange={(event) => {
                void stageImportRecebimentosMassaFromFile(event.target.files?.[0] ?? null);
                event.target.value = '';
              }}
              ref={importMassInputRef}
              style={{ display: 'none' }}
              type="file"
            />
          </div>
        ) : null}
      </div>

      <ModuleHelp>
        <p className="panel-copy">
          Entrada operacional de materiais com modo direto ou aguardando conferencia. Em <strong>Novo recebimento</strong>, preencha o
          cabecalho e use <strong>Importar itens (CSV)</strong> com colunas{' '}
          <strong>codigo</strong>, <strong>descricao</strong>, <strong>quantidade</strong>, <strong>unidade</strong>,{' '}
          <strong>localizacao</strong> e <strong>certificado</strong> (opcional). <strong>Baixar modelo itens (CSV)</strong> traz esse
          cabecalho e exemplos. <strong>Importar recebimentos em massa (CSV)</strong> usa o mesmo formato do modelo em massa (varias NFs no
          mesmo ficheiro). <strong>Baixar modelo importacao em massa</strong> traz o cabecalho e linhas de exemplo.{' '}
          <strong>Exportar Excel (CSV)</strong> gera uma
          planilha com nota fiscal, fornecedor, romaneio e cada material (codigo, descricao, quantidades, localizacao, pesos e{' '}
          <strong>certificado</strong>), com colunas separadas por ponto e
          virgula para o Excel em portugues abrir certo; os
          filtros da lista acima limitam o que entra no arquivo (deixe tudo em &quot;Todos&quot; para exportar tudo).
        </p>
      </ModuleHelp>

      <FonteDadosNotice
        healthy={fonteNuvemOk}
        fallbackMessage={
          hasCloudConfig
            ? 'Cópia local / desatualizada — a nuvem nao confirmou esta lista. Nao use como verdade unica.'
            : cloudStatus === 'partial'
              ? 'Fonte atual: fallback local. Configuracao do Supabase incompleta.'
              : 'Fonte atual: fallback local. Supabase ainda nao esta configurado.'
        }
      />
      {fallbackReason ? <OperationalNotice tone="warning">{`Fallback ativo por falha de consulta: ${fallbackReason}`}</OperationalNotice> : null}

      <SnapshotConflictHint
        show={importMassSnapshotConflict}
        onReload={() => void reloadAfterImportMassSnapshotConflict()}
      />

      <RecebimentoFilters filters={filters} onChange={setFilters} />

      {error ? <div className="error-box">{error}</div> : null}
      {exportingRecebimentosCsv ? (
        <OperationalNotice>A exportar recebimentos para Excel… Aguarde o download.</OperationalNotice>
      ) : null}
      {success ? <OperationalNotice tone="success">{success}</OperationalNotice> : null}
      {canEdit || canAdminister ? (
        <ModuleHelp>
          <OperationalNotice tone="warning">
            Recebimentos ja conferidos ficam travados para proteger o estoque.{' '}
            <strong>Destravar</strong> (cadeado + a sua senha) volta para <strong>aguardando conferencia</strong> mantendo as
            quantidades conferidas — depois use <strong>Editar</strong>.{' '}
            {canAdminister ? (
              <>
                <strong>Cancelar</strong> e <strong>exclusao definitiva</strong> exigem permissao administrar.
              </>
            ) : (
              <>Cancelar e exclusao definitiva so um administrador pode fazer.</>
            )}
          </OperationalNotice>
        </ModuleHelp>
      ) : null}

      {canAdminister ? (
        <div className="etiquetas-bulk-bar etiquetas-bulk-bar--compact recebimentos-bulk-bar">
          <span className="recebimentos-bulk-bar__count">
            {selectedRecebimentoIds.length} selecionado(s)
            {total > 0 ? ` · ${total} no filtro` : null}
          </span>
          <div className="etiquetas-bulk-bar__actions">
            <Button
              disabled={selectAllFilteredBusy || loading}
              onClick={() => void selectAllRecebimentosFiltered()}
              type="button"
              variant="ghost"
            >
              {selectAllFilteredBusy ? 'A selecionar...' : 'Selecionar todos'}
            </Button>
            <Button disabled={!selectedRecebimentoIds.length} onClick={clearRecebimentosSelection} type="button" variant="ghost">
              Limpar selecao
            </Button>
            <Button
              disabled={!selectedRecebimentoIds.length}
              onClick={abrirExclusaoDefinitivaEmMassa}
              type="button"
              variant="danger"
            >
              Excluir selecionados...
            </Button>
          </div>
        </div>
      ) : null}

      {loading ? (
        <OperationalNotice>Carregando recebimentos...</OperationalNotice>
      ) : (
        <>
          <RecebimentosTable
            canAdminister={canAdminister}
            canEdit={canEdit}
            items={items}
            onCancel={handleCancelar}
            onEdit={openEditModal}
            onExcluirDefinitivo={canAdminister ? abrirExclusaoDefinitivaRecebimento : undefined}
            onDestravar={canEdit || canAdminister ? abrirDestravarRecebimento : undefined}
            onToggleSelect={canAdminister ? toggleSelectRecebimentoId : undefined}
            onToggleSelectPagina={canAdminister ? toggleSelectRecebimentosPaginaAtual : undefined}
            onView={openViewModal}
            selectedIds={canAdminister ? selectedRecebimentoIdSet : undefined}
          />
          <Pagination
            itemLabel="recebimentos"
            onPageChange={(page) => setFilters({ ...filters, page })}
            page={filters.page}
            pageSize={filters.pageSize}
            total={total}
          />
        </>
      )}

      {!canEdit && !canAdminister ? (
        <OperationalNotice>Seu perfil pode visualizar recebimentos, mas nao pode alterar ou cancelar registros.</OperationalNotice>
      ) : null}

      <Modal
        onClose={() => {
          if (!importingRecebimentosMass) cancelImportRecebimentosMassaStaging();
        }}
        open={Boolean(importMassStaging) && canEdit}
        title="Confirmar importacao em massa"
        wide
      >
        {importMassStaging ? (
          <div className="editor-block">
            <p>
              Importar <strong>{importMassStaging.linhaCount}</strong> linha(s) de material em{' '}
              <strong>{importMassStaging.recebimentoCount}</strong> recebimento(s) distinto(s) a partir de{' '}
              <strong>{importMassStaging.fileName}</strong>?
            </p>
            {importingRecebimentosMass ? (
              <OperationalNotice>
                {importMassProgress || 'A gravar na nuvem…'} A janela fecha sozinha com o resultado.
              </OperationalNotice>
            ) : null}
            <div className="form-actions" style={{ marginTop: 16 }}>
              <Button
                disabled={importingRecebimentosMass}
                onClick={cancelImportRecebimentosMassaStaging}
                type="button"
                variant="ghost"
              >
                Cancelar
              </Button>
              <Button disabled={importingRecebimentosMass} onClick={() => void confirmImportRecebimentosMassaStaging()} type="button">
                Importar
              </Button>
            </div>
          </div>
        ) : null}
      </Modal>

      <Modal onClose={closeImportRecebimentosMassaResultado} open={Boolean(importMassResultado)} title="Importacao concluida" wide>
        {importMassResultado ? (
          <div className="editor-block">
            {importMassResultado.mensagem ? (
              <OperationalNotice>{importMassResultado.mensagem}</OperationalNotice>
            ) : null}
            <p>
              <strong>{importMassResultado.criados}</strong> novo(s), <strong>{importMassResultado.atualizados}</strong> atualizado(s),{' '}
              <strong>{importMassResultado.ignorados}</strong> ignorado(s).
            </p>
            {importMassResultado.detalhes.length ? (
              <div style={{ marginTop: 12, maxHeight: 240, overflow: 'auto', fontSize: '0.9rem' }}>
                {importMassResultado.detalhes.map((linha, index) => (
                  <div key={`${index}-${linha.slice(0, 48)}`}>{linha}</div>
                ))}
              </div>
            ) : null}
            <div className="form-actions" style={{ marginTop: 16 }}>
              <Button onClick={closeImportRecebimentosMassaResultado} type="button">
                OK
              </Button>
            </div>
          </div>
        ) : null}
      </Modal>

      <Modal
        onClose={fecharDestravarRecebimento}
        open={Boolean(destravarContext) && (canEdit || canAdminister)}
        title="Destravar recebimento para correcao"
        wide
      >
        {destravarContext ? (
          <div className="editor-block">
            <p>
              O recebimento <strong>{destravarContext.notaFiscal || '-'}</strong> /{' '}
              <strong>{destravarContext.romaneio || '-'}</strong> ({destravarContext.fornecedor}) voltara para{' '}
              <strong>aguardando conferencia</strong>. A conferencia feita (quantidades e observacoes por linha) sera mantida - altere apenas o necessario e grave. Esta accao e registada na auditoria.
            </p>
            <p className="panel-copy" style={{ marginTop: 8 }}>
              Confirme com a sua senha. Com o foco no campo abaixo, pode premir <kbd>Enter</kbd> para confirmar.
            </p>
            <div style={{ marginTop: 12 }}>
              <label className="form-label" htmlFor="recebimento-destravar-senha">
                Senha
              </label>
              <input
                autoComplete="current-password"
                className="form-input"
                id="recebimento-destravar-senha"
                onChange={(e) => setDestravarSenha(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key !== 'Enter') return;
                  e.preventDefault();
                  if (destravarBusy || !destravarSenha.trim()) return;
                  void confirmarDestravarRecebimento();
                }}
                type="password"
                value={destravarSenha}
              />
            </div>
            {destravarBusy ? (
              <div style={{ marginTop: 12 }}>
                <OperationalNotice>A processar...</OperationalNotice>
              </div>
            ) : null}
            <div className="form-actions" style={{ marginTop: 16 }}>
              <Button disabled={destravarBusy} onClick={fecharDestravarRecebimento} type="button" variant="ghost">
                Cancelar
              </Button>
              <Button
                disabled={destravarBusy || !destravarSenha.trim()}
                onClick={() => void confirmarDestravarRecebimento()}
                type="button"
                variant="danger"
              >
                Destravar
              </Button>
            </div>
          </div>
        ) : null}
      </Modal>

      <Modal
        onClose={fecharExclusaoDefinitivaRecebimento}
        open={idsParaExcluirRecebimentos.length > 0 && canAdminister}
        title={idsParaExcluirRecebimentos.length > 1 ? 'Excluir recebimentos definitivamente' : 'Excluir recebimento definitivamente'}
        wide
      >
        {idsParaExcluirRecebimentos.length > 0 ? (
          <div className="editor-block">
            <p>
              <strong>{idsParaExcluirRecebimentos.length}</strong> recebimento(s) sera(ao) removido(s) do cadastro. Esta accao e
              irreversivel.
            </p>
            <p className="panel-copy" style={{ marginTop: 8 }}>
              Apenas recebimentos em aguardando conferencia, cancelados ou rascunho podem ser apagados. Confirme com a sua senha. Com o
              foco no campo abaixo, pode premir <kbd>Enter</kbd> para confirmar.
            </p>
            <div style={{ marginTop: 12 }}>
              <p className="form-label" style={{ marginBottom: 6 }}>
                Recebimentos a remover
                {excluirModalResumosLoading ? (
                  <span className="panel-copy"> (a carregar...)</span>
                ) : (
                  <span className="panel-copy">
                    {' '}
                    ({resumoLinhasExclusao.total} encontrado(s)
                    {idsParaExcluirRecebimentos.length !== resumoLinhasExclusao.total
                      ? ` Â· ${idsParaExcluirRecebimentos.length} pedido(s)`
                      : ''}
                    )
                  </span>
                )}
              </p>
              {excluirModalResumosLoading ? null : idsParaExcluirRecebimentos.length > 0 &&
                resumoLinhasExclusao.total < idsParaExcluirRecebimentos.length ? (
                <p className="panel-copy" style={{ marginBottom: 8 }}>
                  Apenas {resumoLinhasExclusao.total} linha(s) encontradas no cadastro atual para os IDs selecionados.
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
                    <div key={`${index}-${r.notaFiscal}-${r.romaneio}`}>
                      {encurtarLinhaResumoRecebimento(`${r.fornecedor} - NF ${r.notaFiscal || '-'} / ${r.romaneio || '-'}`)}
                    </div>
                  ))}
                  {resumoLinhasExclusao.restantes > 0 ? (
                    <div style={{ marginTop: 6, fontStyle: 'italic' }}>
                      ... e mais {resumoLinhasExclusao.restantes} recebimento(s).
                    </div>
                  ) : null}
                </div>
              ) : !excluirModalResumosLoading ? (
                <p className="panel-copy" style={{ marginBottom: 12 }}>
                  Nenhum recebimento encontrado para os IDs selecionados.
                </p>
              ) : null}
            </div>
            <div style={{ marginTop: 12 }}>
              <label className="form-label" htmlFor="recebimento-excluir-senha">
                Senha
              </label>
              <input
                autoComplete="current-password"
                className="form-input"
                id="recebimento-excluir-senha"
                onChange={(e) => setExcluirDefinitivoSenha(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key !== 'Enter') return;
                  e.preventDefault();
                  if (excluirDefinitivoBusy || !excluirDefinitivoSenha.trim()) return;
                  void confirmarExclusaoDefinitivaRecebimento();
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
              <Button disabled={excluirDefinitivoBusy} onClick={fecharExclusaoDefinitivaRecebimento} type="button" variant="ghost">
                Cancelar
              </Button>
              <Button
                disabled={excluirDefinitivoBusy || !excluirDefinitivoSenha.trim()}
                onClick={() => void confirmarExclusaoDefinitivaRecebimento()}
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
        browserFullscreen
        onClose={closeModal}
        open={isModalOpen && (canEdit || isViewOnly)}
        title={
          isViewOnly
            ? 'Visualizar recebimento'
            : selected
              ? 'Editar recebimento'
              : 'Novo recebimento'
        }
        wide
      >
        {viewOpening && !selected ? (
          <OperationalNotice>A carregar recebimento...</OperationalNotice>
        ) : (
        <RecebimentoForm
          allowImportItens={!selected && !isViewOnly}
          editId={selected?.id}
          key={selected?.id ?? 'new-rec'}
          initialValue={formInitialValue}
          onCancel={closeModal}
          onReloadAfterConflict={async () => {
            await load();
            closeModal();
          }}
          onSubmit={submitRecebimento}
          podeCorrigirItensNaVisualizacao={
            Boolean(isViewOnly && canEdit && selected?.status === 'aguardando_conferencia')
          }
          readOnly={isViewOnly}
          recebimentoRelatorioMeta={
            isViewOnly && selected
              ? { status: selected.status, dataConferencia: selected.dataConferencia }
              : undefined
          }
        />
        )}
      </Modal>
    </div>
  );
}
