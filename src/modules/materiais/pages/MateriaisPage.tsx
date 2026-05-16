import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Pagination } from '../../../components/tables/Pagination';
import { Button } from '../../../components/ui/Button';
import { Modal } from '../../../components/ui/Modal';
import { ModuleHelp } from '../../../components/ui/ModuleHelp';
import { OperationalNotice } from '../../../components/ui/OperationalNotice';
import { getSupabaseOperationalStatus } from '../../../lib/supabase';
import { useAuth } from '../../auth/hooks/useAuth';
import { MaterialFilters } from '../components/MaterialFilters';
import { MaterialForm } from '../components/MaterialForm';
import { MateriaisListasDominioModal } from '../components/MateriaisListasDominioModal';
import { MateriaisTable } from '../components/MateriaisTable';
import { useMateriais } from '../hooks/useMateriais';

const MAX_CODIGOS_NO_MODAL = 48;
const MAX_CARACTERES_POR_CODIGO = 44;

function encurtarCodigoParaLista(codigo: string) {
  if (codigo.length <= MAX_CARACTERES_POR_CODIGO) return codigo;
  return `${codigo.slice(0, MAX_CARACTERES_POR_CODIGO - 3)}...`;
}

export function MateriaisPage() {
  const { canAccessAction } = useAuth();
  const navigate = useNavigate();
  const cloudStatus = getSupabaseOperationalStatus();
  const {
    items,
    total,
    loading,
    error,
    success,
    hasCloudConfig,
    cloudMaterialsEnabled,
    filters,
    disciplinas,
    unidades,
    formInitialValue,
    isModalOpen,
    selected,
    setFilters,
    openCreateModal,
    openEditModal,
    closeModal,
    submitMaterial,
    handleToggleStatus,
    importInputRef,
    openImportMateriaisPicker,
    downloadModeloCsvImportacaoMateriais,
    importStaging,
    importingMateriais,
    importResultado,
    stageImportMateriaisFromFile,
    cancelImportMateriaisStaging,
    confirmImportMateriaisStaging,
    closeImportMateriaisResultado,
    exportMateriaisCsv,
    exportMateriaisCsvFiltrado,
    selectedMaterialIds,
    selectedMaterialIdSet,
    toggleSelectMaterialId,
    toggleSelectMateriaisPaginaAtual,
    selectAllMateriaisFiltered,
    selectAllFilteredBusy,
    clearMateriaisSelection,
    openDeleteDefinitivoModal,
    closeDeleteDefinitivoModal,
    confirmDeleteMateriaisDefinitivo,
    deleteDefinitivoOpen,
    deleteDefinitivoSenha,
    setDeleteDefinitivoSenha,
    deleteDefinitivoBusy,
    deleteModalCodigos,
    deleteModalCodigosLoading,
    deleteUsoMateriais,
    deleteUsoLoading,
    deleteUsoAnaliseOk,
    deleteExclusaoError,
    load,
    syncLocalModalOpen,
    syncLocalModalMessage,
    syncLocalBusy,
    closeSyncLocalModal,
    onSyncLocalFromCloud,
  } = useMateriais();
  const canEdit = canAccessAction('materiais', 'editar');
  const canAdminister = canAccessAction('materiais', 'administrar');
  const [dominioModal, setDominioModal] = useState<null | 'disciplinas' | 'unidades'>(null);

  const resumoCodigosExclusao = useMemo(() => {
    const total = deleteModalCodigos.length;
    const visiveis = deleteModalCodigos.slice(0, MAX_CODIGOS_NO_MODAL);
    const restantes = total - visiveis.length;
    return { total, visiveis, restantes };
  }, [deleteModalCodigos]);

  const resumoUsoExclusao = useMemo(() => {
    const comUso = deleteUsoMateriais.filter((u) => u.recebimentos || u.documentos || u.atendimento);
    return { comUso };
  }, [deleteUsoMateriais]);

  /** Nuvem: botao desativado ate analise OK e sem uso; local: so senha + busy. */
  const exclusaoNuvemBloqueada = useMemo(() => {
    if (!cloudMaterialsEnabled) return false;
    if (deleteUsoLoading || deleteUsoAnaliseOk === null) return true;
    if (deleteUsoAnaliseOk === false) return true;
    if (resumoUsoExclusao.comUso.length > 0) return true;
    return false;
  }, [
    cloudMaterialsEnabled,
    deleteUsoLoading,
    deleteUsoAnaliseOk,
    resumoUsoExclusao.comUso.length,
  ]);

  return (
    <div className="panel">
      <div className="panel-header panel-header--toolbar">
        <div>
          <p className="panel-kicker">Módulo</p>
          <h2>Cadastro de Materiais</h2>
        </div>
        {canEdit ? (
          <div className="panel-toolbar">
            <div className="panel-toolbar__group" role="group" aria-label="Cadastro e listas">
              <span className="panel-toolbar__label">Cadastro</span>
              <div className="panel-toolbar__buttons">
                <Button onClick={openCreateModal}>Novo material</Button>
                <Button type="button" variant="ghost" onClick={() => setDominioModal('disciplinas')}>
                  Disciplinas
                </Button>
                <Button type="button" variant="ghost" onClick={() => setDominioModal('unidades')}>
                  Unidades
                </Button>
              </div>
            </div>
            <div className="panel-toolbar__group" role="group" aria-label="Importar e exportar CSV">
              <span className="panel-toolbar__label">Planilha CSV</span>
              <div className="panel-toolbar__buttons">
                <Button type="button" variant="ghost" onClick={openImportMateriaisPicker}>
                  Importar
                </Button>
                <Button type="button" variant="ghost" onClick={downloadModeloCsvImportacaoMateriais}>
                  Modelo
                </Button>
                <Button type="button" variant="ghost" onClick={() => void exportMateriaisCsv()}>
                  Exportar tudo
                </Button>
                <Button type="button" variant="ghost" onClick={() => void exportMateriaisCsvFiltrado()}>
                  Exportar filtro
                </Button>
              </div>
            </div>
            <input
              accept=".csv,.txt,text/csv"
              onChange={(event) => {
                void stageImportMateriaisFromFile(event.target.files?.[0] ?? null);
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
          Cadastro de materiais preparado para operar localmente ou em nuvem, mantendo filtros, listagem paginada e edicao no mesmo padrao robusto. Use os botoes{' '}
          <strong>Disciplinas</strong> e <strong>Unidades</strong> para gerir as listas dos campos homonimos no formulario (equivalente ao I.S.O PRO antigo).
          Use <strong>Baixar modelo CSV</strong> para o cabecalho e linhas de exemplo. Importe planilhas CSV (separador ponto-e-virgula, compativel com Excel em portugues; UTF-8). Exporte a lista, edite e reimporte: codigo existente e atualizado, novo e incluido; linhas com o mesmo codigo no mesmo arquivo sao ignoradas apos a primeira. Na inclusao ou importacao, se a coluna <code>codigo_barras</code> estiver vazia, o sistema gera um EAN-13 interno automaticamente (prefixo 7899999 + sequencia). Cadastros antigos sem codigo recebem um ao abrir a lista (persistido no armazenamento local ou no Supabase, se a coluna existir).
        </p>
      </ModuleHelp>

      <OperationalNotice>
        {cloudMaterialsEnabled ? (
          'Fonte dos dados: Supabase (cadastro na nuvem ativo).'
        ) : cloudStatus === 'partial' ? (
          'Fonte atual: fallback local. Configuracao do Supabase incompleta.'
        ) : hasCloudConfig ? (
          <>
            Fonte atual: <strong>cadastro local neste navegador</strong>. A integracao com Supabase esta activa para
            planejamento e recebimentos, mas <strong>materiais em nuvem</strong> estao <strong>desactivados</strong> — por
            isso a lista vem do armazenamento local (em primeiro acesso costuma mostrar 3 itens de exemplo). Para usar o
            cadastro completo na nuvem, abra <strong>Configuracoes</strong>, active <strong>Materiais em nuvem</strong> e
            guarde.
          </>
        ) : (
          'Fonte atual: fallback local. Supabase ainda nao esta configurado.'
        )}
      </OperationalNotice>

      {hasCloudConfig && !cloudMaterialsEnabled && canAccessAction('configuracoes', 'visualizar') ? (
        <OperationalNotice tone="warning">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'center' }}>
            <span style={{ flex: '1 1 280px' }}>
              Para o cadastro <strong>não depender só deste navegador</strong> (limpar dados do site apaga a lista local),
              active <strong>Materiais em nuvem</strong> em Configurações e guarde. Quem administrar o sistema precisa de
              permissão para alterar essa opção.
            </span>
            <Button type="button" variant="primary" onClick={() => navigate('/configuracoes')}>
              Abrir Configurações
            </Button>
          </div>
        </OperationalNotice>
      ) : null}

      {cloudMaterialsEnabled && canEdit ? (
        <div className="editor-block" style={{ marginBottom: 12 }}>
          <ModuleHelp>
            <p className="panel-copy" style={{ marginBottom: 8 }}>
              Opcional: guardar neste navegador uma copia do cadastro que esta na nuvem (inclui saldos do movimento no
              snapshot). Serve para alinhar o armazenamento local <code>iso-pro-desktop-materiais</code> quando algum fluxo
              ainda ler dados gravados neste PC.
            </p>
          </ModuleHelp>
          <Button
            disabled={syncLocalBusy || loading}
            onClick={() => void onSyncLocalFromCloud(false)}
            type="button"
            variant="ghost"
          >
            {syncLocalBusy ? 'A gravar copia local...' : 'Gravar copia local a partir da nuvem'}
          </Button>
        </div>
      ) : null}

      <MaterialFilters disciplinas={disciplinas} filters={filters} onChange={setFilters} />

      {canAdminister ? (
        <div className="editor-block" style={{ marginBottom: 16 }}>
          <ModuleHelp>
            <p className="panel-copy" style={{ marginBottom: 8 }}>
              <strong>Administracao:</strong> selecione linhas para exclusao definitiva da base (nao apenas inativar). A acao e
              irreversivel e exige confirmar a sua senha.
            </p>
          </ModuleHelp>
          <div className="form-actions" style={{ flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ marginRight: 8, fontSize: '0.9rem' }}>
              {selectedMaterialIds.length} selecionado(s)
              {total > 0 ? ` · ${total} no filtro atual` : null}
            </span>
            <Button
              disabled={selectAllFilteredBusy || loading}
              onClick={() => void selectAllMateriaisFiltered()}
              type="button"
              variant="ghost"
            >
              {selectAllFilteredBusy ? 'A selecionar...' : 'Selecionar todos (filtro atual)'}
            </Button>
            <Button disabled={!selectedMaterialIds.length} onClick={clearMateriaisSelection} type="button" variant="ghost">
              Limpar selecao
            </Button>
            <Button
              disabled={!selectedMaterialIds.length}
              onClick={openDeleteDefinitivoModal}
              type="button"
              variant="danger"
            >
              Excluir definitivamente...
            </Button>
          </div>
        </div>
      ) : null}

      {error ? (
        <div className="error-box" style={{ whiteSpace: 'pre-line' }}>
          {error}
        </div>
      ) : null}
      {success ? <OperationalNotice>{success}</OperationalNotice> : null}

      {loading ? (
        <OperationalNotice>Carregando materiais...</OperationalNotice>
      ) : (
        <>
          <MateriaisTable
            canAdminister={canAdminister}
            canEdit={canEdit}
            items={items}
            onEdit={openEditModal}
            onToggleSelect={canAdminister ? toggleSelectMaterialId : undefined}
            onToggleSelectPagina={canAdminister ? toggleSelectMateriaisPaginaAtual : undefined}
            onToggleStatus={handleToggleStatus}
            selectedIds={canAdminister ? selectedMaterialIdSet : undefined}
          />
          <Pagination
            onPageChange={(page) => setFilters({ ...filters, page })}
            page={filters.page}
            pageSize={filters.pageSize}
            total={total}
          />
        </>
      )}

      {!canEdit && !canAdminister ? (
        <OperationalNotice>Seu perfil pode visualizar materiais, mas nao pode alterar cadastro.</OperationalNotice>
      ) : null}

      <Modal onClose={closeModal} open={isModalOpen && canEdit} title={selected ? 'Editar material' : 'Novo material'} wide>
        <MaterialForm
          key={selected?.id ?? 'new'}
          disciplinas={disciplinas}
          initialValue={formInitialValue}
          onCancel={closeModal}
          onSubmit={submitMaterial}
          unidades={unidades}
        />
      </Modal>

      <MateriaisListasDominioModal
        onClose={() => setDominioModal(null)}
        onSaved={() => void load()}
        open={Boolean(dominioModal)}
        tipo={dominioModal ?? 'disciplinas'}
      />

      <Modal onClose={closeSyncLocalModal} open={syncLocalModalOpen} title="Copia local nao gravada" wide>
        <div className="editor-block">
          <p className="panel-copy" style={{ marginBottom: 10 }}>
            Motivo:
          </p>
          <p style={{ whiteSpace: 'pre-line' }}>{syncLocalModalMessage}</p>
          <ModuleHelp>
            <p className="panel-copy" style={{ marginTop: 14 }}>
              Se ja fez backup (por exemplo exportou CSV) e aceita que linhas extra neste navegador deixem de existir, um
              administrador de Materiais pode confirmar a substituicao abaixo.
            </p>
          </ModuleHelp>
          <div className="form-actions" style={{ marginTop: 16 }}>
            <Button disabled={syncLocalBusy} onClick={closeSyncLocalModal} type="button" variant="ghost">
              Fechar
            </Button>
            {canAdminister ? (
              <Button
                disabled={syncLocalBusy}
                onClick={() => void onSyncLocalFromCloud(true)}
                type="button"
                variant="danger"
              >
                {syncLocalBusy ? 'A gravar...' : 'Substituir copia local e apagar linhas a mais neste PC'}
              </Button>
            ) : null}
          </div>
          {!canAdminister ? (
            <ModuleHelp>
              <p className="panel-copy" style={{ marginTop: 12 }}>
                O seu perfil nao inclui administracao de Materiais. Se for preciso forcar esta gravacao, peca a um
                administrador.
              </p>
            </ModuleHelp>
          ) : null}
        </div>
      </Modal>

      <Modal
        onClose={() => {
          if (!importingMateriais) cancelImportMateriaisStaging();
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
            {importingMateriais ? (
              <OperationalNotice>Importando materiais...</OperationalNotice>
            ) : null}
            <div className="form-actions" style={{ marginTop: 16 }}>
              <Button disabled={importingMateriais} onClick={cancelImportMateriaisStaging} type="button" variant="ghost">
                Cancelar
              </Button>
              <Button disabled={importingMateriais} onClick={() => void confirmImportMateriaisStaging()} type="button">
                Importar
              </Button>
            </div>
          </div>
        ) : null}
      </Modal>

      <Modal
        onClose={closeDeleteDefinitivoModal}
        open={deleteDefinitivoOpen && canAdminister}
        title="Confirmar exclusao definitiva"
        wide
      >
        <div className="editor-block">
          <p>
            Esta acao remove <strong>{selectedMaterialIds.length}</strong> material(is) do cadastro de forma permanente.
            Registos historicos em documentos podem manter referencias ao codigo; a linha deixara de existir na tabela de
            materiais.
          </p>
          <p className="panel-copy" style={{ marginTop: 8 }}>
            Confirme com a sua senha de utilizador. Com o foco no campo da senha, pode premir <kbd>Enter</kbd> para
            confirmar (equivalente ao botao vermelho).
          </p>
          <div style={{ marginTop: 12 }}>
            <p className="form-label" style={{ marginBottom: 6 }}>
              Codigos a remover
              {deleteModalCodigosLoading ? (
                <span className="panel-copy"> (a carregar...)</span>
              ) : (
                <span className="panel-copy">
                  {' '}
                  ({resumoCodigosExclusao.total} na base
                  {selectedMaterialIds.length !== resumoCodigosExclusao.total
                    ? ` · ${selectedMaterialIds.length} selecionado(s)`
                    : ''}
                  )
                </span>
              )}
            </p>
            {deleteModalCodigosLoading ? null : selectedMaterialIds.length > 0 &&
              resumoCodigosExclusao.total < selectedMaterialIds.length ? (
              <p className="panel-copy" style={{ marginBottom: 8 }}>
                Apenas {resumoCodigosExclusao.total} codigo(s) encontrados no cadastro atual para os IDs selecionados.
              </p>
            ) : null}
            {deleteModalCodigosLoading ? null : resumoCodigosExclusao.total > 0 ? (
              <div
                style={{
                  marginBottom: 12,
                  maxHeight: 200,
                  overflow: 'auto',
                  padding: '8px 10px',
                  fontSize: '0.88rem',
                  lineHeight: 1.45,
                  border: '1px solid var(--border-subtle, rgba(255,255,255,0.12))',
                  borderRadius: 6,
                  fontFamily: 'ui-monospace, monospace',
                }}
              >
                {resumoCodigosExclusao.visiveis.map((c, index) => (
                  <div key={`${index}-${c}`}>{encurtarCodigoParaLista(c)}</div>
                ))}
                {resumoCodigosExclusao.restantes > 0 ? (
                  <div style={{ marginTop: 6, fontStyle: 'italic' }}>
                    ... e mais {resumoCodigosExclusao.restantes} codigo(s).
                  </div>
                ) : null}
              </div>
            ) : (
              <p className="panel-copy" style={{ marginBottom: 12 }}>
                Nenhum codigo encontrado para os IDs selecionados (lista desatualizada ou dados em conflito).
              </p>
            )}
          </div>
          {deleteUsoLoading ? (
            <div style={{ marginTop: 14 }}>
              <OperationalNotice>A verificar se o codigo aparece em recebimentos, documentacao ou atendimento...</OperationalNotice>
            </div>
          ) : cloudMaterialsEnabled && deleteUsoAnaliseOk === false ? (
            <div style={{ marginTop: 14 }}>
              <OperationalNotice tone="critical">
                <p style={{ margin: 0 }}>
                  Nao foi possivel verificar referencias antes de excluir na nuvem. Feche e abra esta janela para tentar de
                  novo.
                </p>
              </OperationalNotice>
            </div>
          ) : resumoUsoExclusao.comUso.length > 0 ? (
            <div style={{ marginTop: 14 }}>
              <OperationalNotice tone="warning">
                <p style={{ margin: 0, fontWeight: 700 }}>Codigo em uso na operacao</p>
                <p className="panel-copy" style={{ marginTop: 8 }}>
                  Com base nos dados carregados neste ambiente, o(s) codigo(s) abaixo constam em pelo menos um destes
                  modulos: <strong>Recebimentos</strong>, <strong>Documentacao</strong> ou <strong>Atendimento</strong>.
                  {cloudMaterialsEnabled
                    ? ' Com cadastro na nuvem, a exclusao fica bloqueada nestes casos ate as referencias serem removidas ou ajustadas.'
                    : null}
                </p>
                <ul style={{ margin: '10px 0 0', paddingLeft: 18 }}>
                  {resumoUsoExclusao.comUso.map((u) => (
                    <li key={u.codigo}>
                      <strong>{encurtarCodigoParaLista(u.codigo)}</strong>
                      {': '}
                      {[
                        u.recebimentos ? 'Recebimentos' : null,
                        u.documentos ? 'Documentacao' : null,
                        u.atendimento ? 'Atendimento' : null,
                      ]
                        .filter(Boolean)
                        .join(', ')}
                    </li>
                  ))}
                </ul>
              </OperationalNotice>
            </div>
          ) : null}
          <div style={{ marginTop: 12 }}>
            <label className="form-label" htmlFor="materiais-delete-senha">
              Senha
            </label>
            <input
              autoComplete="current-password"
              className="form-input"
              id="materiais-delete-senha"
              onChange={(e) => setDeleteDefinitivoSenha(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== 'Enter') return;
                e.preventDefault();
                if (deleteDefinitivoBusy || !deleteDefinitivoSenha.trim() || exclusaoNuvemBloqueada) return;
                void confirmDeleteMateriaisDefinitivo();
              }}
              type="password"
              value={deleteDefinitivoSenha}
            />
          </div>
          {deleteDefinitivoBusy ? (
            <div style={{ marginTop: 12 }}>
              <OperationalNotice>A processar...</OperationalNotice>
            </div>
          ) : null}
          {deleteExclusaoError ? (
            <div className="error-box" style={{ marginTop: 12, whiteSpace: 'pre-line' }}>
              {deleteExclusaoError}
            </div>
          ) : null}
          <div className="form-actions" style={{ marginTop: 16 }}>
            <Button disabled={deleteDefinitivoBusy} onClick={closeDeleteDefinitivoModal} type="button" variant="ghost">
              Cancelar
            </Button>
            <Button
              disabled={deleteDefinitivoBusy || !deleteDefinitivoSenha.trim() || exclusaoNuvemBloqueada}
              onClick={() => void confirmDeleteMateriaisDefinitivo()}
              type="button"
              variant="danger"
            >
              Excluir definitivamente
            </Button>
          </div>
        </div>
      </Modal>

      <Modal onClose={closeImportMateriaisResultado} open={Boolean(importResultado)} title="Importacao concluida" wide>
        {importResultado ? (
          <div className="editor-block">
            <p>
              <strong>{importResultado.criados}</strong> novo(s), <strong>{importResultado.atualizados}</strong>{' '}
              atualizado(s), <strong>{importResultado.ignorados}</strong> ignorado(s).
              {importResultado.ignoradosPorDuplicidadeNoArquivo > 0 ? (
                <>
                  {' '}
                  Destes, <strong>{importResultado.ignoradosPorDuplicidadeNoArquivo}</strong> por codigo repetido no
                  arquivo.
                </>
              ) : null}
            </p>
            {importResultado.detalhes.length ? (
              <div style={{ marginTop: 12, maxHeight: 240, overflow: 'auto', fontSize: '0.9rem' }}>
                {importResultado.detalhes.map((linha) => (
                  <div key={linha}>{linha}</div>
                ))}
              </div>
            ) : null}
            <div className="form-actions" style={{ marginTop: 16 }}>
              <Button onClick={closeImportMateriaisResultado} type="button">
                OK
              </Button>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
