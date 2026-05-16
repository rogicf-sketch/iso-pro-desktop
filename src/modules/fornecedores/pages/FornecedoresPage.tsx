import { Pagination } from '../../../components/tables/Pagination';
import { Button } from '../../../components/ui/Button';
import { Modal } from '../../../components/ui/Modal';
import { ModuleHelp } from '../../../components/ui/ModuleHelp';
import { OperationalNotice } from '../../../components/ui/OperationalNotice';
import { getSupabaseOperationalStatus } from '../../../lib/supabase';
import { useAuth } from '../../auth/hooks/useAuth';
import { FornecedorFilters } from '../components/FornecedorFilters';
import { FornecedorForm } from '../components/FornecedorForm';
import { FornecedoresTable } from '../components/FornecedoresTable';
import { useFornecedores } from '../hooks/useFornecedores';

export function FornecedoresPage() {
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
    submitFornecedor,
    handleToggleStatus,
    importInputRef,
    importStaging,
    importingFornecedores,
    importResultado,
    openImportFornecedoresPicker,
    baixarModeloCsvImportacaoFornecedores,
    stageImportFornecedoresFromFile,
    cancelImportFornecedoresStaging,
    confirmImportFornecedoresStaging,
    closeImportFornecedoresResultado,
    exportFornecedoresCsv,
    exportFornecedoresCsvFiltrado,
  } = useFornecedores();

  const canEdit = canAccessAction('fornecedores', 'editar');
  const canAdminister = canAccessAction('fornecedores', 'administrar');

  return (
    <div className="panel">
      <div className="panel-header panel-header--toolbar">
        <div>
          <p className="panel-kicker">Modulo</p>
          <h2>Fornecedores</h2>
        </div>
        {canEdit ? (
          <div className="panel-toolbar">
            <div className="panel-toolbar__group" role="group" aria-label="Cadastro">
              <span className="panel-toolbar__label">Cadastro</span>
              <div className="panel-toolbar__buttons">
                <Button onClick={openCreateModal}>Novo fornecedor</Button>
              </div>
            </div>
            <div className="panel-toolbar__group" role="group" aria-label="Planilha CSV">
              <span className="panel-toolbar__label">Planilha CSV</span>
              <div className="panel-toolbar__buttons">
                <Button type="button" variant="ghost" onClick={openImportFornecedoresPicker}>
                  Importar
                </Button>
                <Button type="button" variant="ghost" onClick={baixarModeloCsvImportacaoFornecedores}>
                  Modelo
                </Button>
                <Button type="button" variant="ghost" onClick={() => void exportFornecedoresCsv()}>
                  Exportar tudo
                </Button>
                <Button type="button" variant="ghost" onClick={() => void exportFornecedoresCsvFiltrado()}>
                  Exportar filtro
                </Button>
              </div>
            </div>
            <input
              accept=".csv,.txt,text/csv"
              onChange={(event) => {
                void stageImportFornecedoresFromFile(event.target.files?.[0] ?? null);
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
          Cadastro base de fornecedores para recebimentos, qualidade, etiquetas e operacao futura do sistema. Importe planilhas CSV
          (separador ponto-e-virgula, compativel com Excel em portugues; UTF-8). Use <strong>Baixar modelo CSV</strong> para o cabecalho
          correto. Colunas: <code>nome</code>, <code>cnpj</code>, <code>telefone</code>, <code>email</code>, <code>endereco</code>,{' '}
          <code>ativo</code> (sim/nao). Nome ja cadastrado e atualizado; nome repetido no mesmo arquivo e ignorado apos a primeira linha.{' '}
          <strong>Excel — todos</strong> exporta o cadastro completo; <strong>Excel — filtro</strong> apenas o que esta visivel com os filtros da lista.
        </p>
      </ModuleHelp>

      <OperationalNotice>
        {cloudStatus === 'ready' && hasCloudConfig
          ? 'Fonte atual: Supabase. Fornecedores sincronizados com a base em nuvem.'
          : cloudStatus === 'partial'
            ? 'Fonte atual: fallback local. Configuracao do Supabase incompleta.'
            : 'Fonte atual: fallback local. Supabase ainda nao esta configurado.'}
      </OperationalNotice>
      {fallbackReason ? <OperationalNotice tone="warning">{`Fallback ativo por falha de consulta: ${fallbackReason}`}</OperationalNotice> : null}

      <FornecedorFilters filters={filters} onChange={setFilters} />

      {error ? <div className="error-box">{error}</div> : null}
      {success ? <OperationalNotice>{success}</OperationalNotice> : null}

      {loading ? (
        <OperationalNotice>Carregando fornecedores...</OperationalNotice>
      ) : (
        <>
          <FornecedoresTable
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
        <OperationalNotice>Seu perfil pode visualizar fornecedores, mas nao pode alterar cadastro.</OperationalNotice>
      ) : null}

      <Modal onClose={closeModal} open={isModalOpen && canEdit} title={selected ? 'Editar fornecedor' : 'Novo fornecedor'} wide>
        <FornecedorForm
          key={selected?.id ?? 'new-fornecedor'}
          initialValue={formInitialValue}
          onCancel={closeModal}
          onReloadAfterConflict={async () => {
            await load();
            closeModal();
          }}
          onSubmit={submitFornecedor}
        />
      </Modal>

      <Modal
        onClose={() => {
          if (!importingFornecedores) cancelImportFornecedoresStaging();
        }}
        open={Boolean(importStaging) && canEdit}
        title="Confirmar importacao"
        wide
      >
        {importStaging ? (
          <div className="editor-block">
            <p>
              Importar <strong>{importStaging.linhaCount}</strong> linha(s) de dados do arquivo <strong>{importStaging.fileName}</strong>?
            </p>
            {importingFornecedores ? <OperationalNotice>Importando fornecedores...</OperationalNotice> : null}
            <div className="form-actions" style={{ marginTop: 16 }}>
              <Button disabled={importingFornecedores} onClick={cancelImportFornecedoresStaging} type="button" variant="ghost">
                Cancelar
              </Button>
              <Button disabled={importingFornecedores} onClick={() => void confirmImportFornecedoresStaging()} type="button">
                Importar
              </Button>
            </div>
          </div>
        ) : null}
      </Modal>

      <Modal onClose={closeImportFornecedoresResultado} open={Boolean(importResultado)} title="Importacao concluida" wide>
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
              <Button onClick={closeImportFornecedoresResultado} type="button">
                OK
              </Button>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
