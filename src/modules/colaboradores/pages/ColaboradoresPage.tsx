import { Pagination } from '../../../components/tables/Pagination';
import { Button } from '../../../components/ui/Button';
import { Modal } from '../../../components/ui/Modal';
import { OperationalNotice } from '../../../components/ui/OperationalNotice';
import { getSupabaseOperationalStatus } from '../../../lib/supabase';
import { useAuth } from '../../auth/hooks/useAuth';
import { ColaboradorFilters } from '../components/ColaboradorFilters';
import { ColaboradorForm } from '../components/ColaboradorForm';
import { ColaboradoresTable } from '../components/ColaboradoresTable';
import { useColaboradores } from '../hooks/useColaboradores';

export function ColaboradoresPage() {
  const { canAccessAction } = useAuth();
  const cloudStatus = getSupabaseOperationalStatus();
  const {
    items,
    total,
    loading,
    error,
    success,
    fallbackReason,
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
    submitColaborador,
    handleToggleStatus,
    importInputRef,
    importStaging,
    importingColaboradores,
    importResultado,
    openImportColaboradoresPicker,
    baixarModeloCsvImportacaoColaboradores,
    stageImportColaboradoresFromFile,
    cancelImportColaboradoresStaging,
    confirmImportColaboradoresStaging,
    closeImportColaboradoresResultado,
    exportColaboradoresCsv,
    exportColaboradoresCsvFiltrado,
  } = useColaboradores();

  const canEdit = canAccessAction('colaboradores', 'editar');
  const canAdminister = canAccessAction('colaboradores', 'administrar');

  return (
    <div className="panel">
      <div className="panel-header panel-header--toolbar">
        <div>
          <p className="panel-kicker">Modulo</p>
          <h2>Colaboradores</h2>
        </div>
        {canEdit ? (
          <div className="panel-toolbar">
            <div className="panel-toolbar__group" role="group" aria-label="Cadastro">
              <span className="panel-toolbar__label">Cadastro</span>
              <div className="panel-toolbar__buttons">
                <Button onClick={openCreateModal}>Novo colaborador</Button>
              </div>
            </div>
            <div className="panel-toolbar__group" role="group" aria-label="Planilha CSV">
              <span className="panel-toolbar__label">Planilha CSV</span>
              <div className="panel-toolbar__buttons">
                <Button type="button" variant="ghost" onClick={openImportColaboradoresPicker}>
                  Importar
                </Button>
                <Button type="button" variant="ghost" onClick={baixarModeloCsvImportacaoColaboradores}>
                  Modelo
                </Button>
                <Button type="button" variant="ghost" onClick={() => void exportColaboradoresCsv()}>
                  Exportar tudo
                </Button>
                <Button type="button" variant="ghost" onClick={() => void exportColaboradoresCsvFiltrado()}>
                  Exportar filtro
                </Button>
              </div>
            </div>
            <input
              accept=".csv,.txt,text/csv"
              onChange={(event) => {
                void stageImportColaboradoresFromFile(event.target.files?.[0] ?? null);
                event.target.value = '';
              }}
              ref={importInputRef}
              style={{ display: 'none' }}
              type="file"
            />
          </div>
        ) : null}
      </div>

      <p className="panel-copy">
        Base operacional de retirantes internos e externos para garantir rastreabilidade total nos atendimentos. Importe planilhas CSV
        (separador ponto-e-virgula, compativel com Excel em portugues; UTF-8). Use <strong>Baixar modelo CSV</strong> para o cabecalho
        correto. Colunas: <code>nome</code>, <code>tipo</code> (interno/externo), <code>matricula</code>, <code>funcao</code>,{' '}
        <code>empresa</code>, <code>documento</code>, <code>telefone</code>, <code>observacao</code>, <code>ativo</code> (sim/nao). Nome
        ja cadastrado e atualizado; nome repetido no mesmo arquivo e ignorado apos a primeira linha.{' '}
        <strong>Excel — todos</strong> exporta o cadastro completo; <strong>Excel — filtro</strong> apenas os registos que batem com os
        filtros da lista (busca, tipo, status).
      </p>

      <OperationalNotice>
        {cloudStatus === 'ready' && hasCloudConfig
          ? 'Fonte atual: Supabase. Colaboradores sincronizados com a base em nuvem.'
          : cloudStatus === 'partial'
            ? 'Fonte atual: fallback local. Configuracao do Supabase incompleta.'
            : 'Fonte atual: fallback local. Supabase ainda nao esta configurado.'}
      </OperationalNotice>
      {fallbackReason ? <OperationalNotice tone="warning">{`Fallback ativo por falha de consulta: ${fallbackReason}`}</OperationalNotice> : null}

      <ColaboradorFilters filters={filters} onChange={setFilters} />

      {error ? <div className="error-box">{error}</div> : null}
      {success ? <OperationalNotice>{success}</OperationalNotice> : null}

      {loading ? (
        <OperationalNotice>Carregando colaboradores...</OperationalNotice>
      ) : (
        <>
          <ColaboradoresTable
            canAdminister={canAdminister}
            canEdit={canEdit}
            items={items}
            onEdit={openEditModal}
            onToggleStatus={handleToggleStatus}
          />
          <Pagination onPageChange={(page) => setFilters({ ...filters, page })} page={filters.page} pageSize={filters.pageSize} total={total} />
        </>
      )}

      {!canEdit && !canAdminister ? (
        <OperationalNotice>Seu perfil pode visualizar colaboradores, mas nao pode alterar cadastro.</OperationalNotice>
      ) : null}

      <Modal onClose={closeModal} open={isModalOpen && canEdit} title={selected ? 'Editar colaborador' : 'Novo colaborador'}>
        <ColaboradorForm
          key={selected?.id ?? 'new-colaborador'}
          initialValue={formInitialValue}
          onCancel={closeModal}
          onReloadAfterConflict={async () => {
            await load();
            closeModal();
          }}
          onSubmit={submitColaborador}
        />
      </Modal>

      <Modal
        onClose={() => {
          if (!importingColaboradores) cancelImportColaboradoresStaging();
        }}
        open={Boolean(importStaging) && canEdit}
        title="Confirmar importacao"
      >
        {importStaging ? (
          <div className="editor-block">
            <p>
              Importar <strong>{importStaging.linhaCount}</strong> linha(s) de dados do arquivo <strong>{importStaging.fileName}</strong>?
            </p>
            {importingColaboradores ? <OperationalNotice>Importando colaboradores...</OperationalNotice> : null}
            <div className="form-actions" style={{ marginTop: 16 }}>
              <Button disabled={importingColaboradores} onClick={cancelImportColaboradoresStaging} type="button" variant="ghost">
                Cancelar
              </Button>
              <Button disabled={importingColaboradores} onClick={() => void confirmImportColaboradoresStaging()} type="button">
                Importar
              </Button>
            </div>
          </div>
        ) : null}
      </Modal>

      <Modal onClose={closeImportColaboradoresResultado} open={Boolean(importResultado)} title="Importacao concluida">
        {importResultado ? (
          <div className="editor-block">
            <p>
              <strong>{importResultado.criados}</strong> novo(s), <strong>{importResultado.atualizados}</strong> atualizado(s),{' '}
              <strong>{importResultado.ignorados}</strong> ignorado(s).
              {importResultado.ignoradosPorDuplicidadeNoArquivo > 0 ? (
                <>
                  {' '}
                  Destes, <strong>{importResultado.ignoradosPorDuplicidadeNoArquivo}</strong> por nome repetido no arquivo.
                </>
              ) : null}
            </p>
            {importResultado.detalhes.length ? (
              <div style={{ fontSize: '0.9rem', marginTop: 12, maxHeight: 240, overflow: 'auto' }}>
                {importResultado.detalhes.map((linha, idx) => (
                  <div key={`${idx}-${linha.slice(0, 40)}`}>{linha}</div>
                ))}
              </div>
            ) : null}
            <div className="form-actions" style={{ marginTop: 16 }}>
              <Button onClick={closeImportColaboradoresResultado} type="button">
                OK
              </Button>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
