import { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import { Pagination } from '../../../components/tables/Pagination';
import { Button } from '../../../components/ui/Button';
import { Modal } from '../../../components/ui/Modal';
import { ModuleHelp } from '../../../components/ui/ModuleHelp';
import { OperationalNotice } from '../../../components/ui/OperationalNotice';
import { abrirPreVisualizacaoHtmlRelatorio } from '../../../lib/htmlRelatorioInstitucional';
import { getSupabaseOperationalStatus } from '../../../lib/supabase';
import { useAuth } from '../../auth/hooks/useAuth';
import { RirFilters } from '../components/RirFilters';
import { RirForm } from '../components/RirForm';
import { RirProcedimentoModal } from '../components/RirProcedimentoModal';
import { RirTable } from '../components/RirTable';
import { useRir } from '../hooks/useRir';
import type { RirRegistro } from '../types/qualidade.types';
import { obterRirPorId } from '../services/qualidade.service';
import { imprimirRirHtml, montarDocumentoHtmlImpressaoRir } from '../utils/imprimirRirHtml';

export function RirPage() {
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
    modoNumeracao,
    recebimentoChoices,
    recebimentosChoicesLoading,
    filters,
    formInitialValue,
    isModalOpen,
    selected,
    rirFormInstance,
    setFilters,
    openCreateModal,
    openEditModal,
    closeModal,
    load,
    submitRir,
    removeRir,
    exportarRirExcel,
    rirDestravarAlvo,
    rirDestravarSenha,
    rirDestravarBusy,
    setRirDestravarSenha,
    abrirDestravarRir,
    fecharDestravarRir,
    confirmarDestravarRir,
  } = useRir();
  const canEdit = canAccessAction('rir', 'editar');
  const canExportCsv = canAccessAction('rir', 'visualizar');
  const canAdministrarRir = canAccessAction('rir', 'administrar');
  const [procOpen, setProcOpen] = useState(false);
  const [rirExcluirAlvo, setRirExcluirAlvo] = useState<RirRegistro | null>(null);
  const [excluindoRir, setExcluindoRir] = useState(false);

  const fecharExcluirRir = useCallback(() => {
    if (excluindoRir) return;
    setRirExcluirAlvo(null);
  }, [excluindoRir]);

  const confirmarExcluirRir = useCallback(async () => {
    if (!rirExcluirAlvo) return;
    setExcluindoRir(true);
    try {
      const result = await removeRir(rirExcluirAlvo.id);
      if (result.success) setRirExcluirAlvo(null);
    } finally {
      setExcluindoRir(false);
    }
  }, [rirExcluirAlvo, removeRir]);

  const visualizarRirRelatorio = useCallback(async (reg: RirRegistro) => {
    const html = montarDocumentoHtmlImpressaoRir(reg);
    const res = await abrirPreVisualizacaoHtmlRelatorio(html);
    if (!res.ok) {
      window.alert(
        res.error ??
          'Nao foi possivel abrir a pre-visualizacao. Permita pop-ups ou use Imprimir na lista para o dialogo do sistema.',
      );
    }
  }, []);

  return (
    <div className="panel">
      <div className="panel-header panel-header--toolbar">
        <div>
          <p className="panel-kicker">Qualidade</p>
          <h2>RIR — Inspecao de recebimento</h2>
        </div>
        {canEdit || canExportCsv ? (
          <div className="panel-toolbar">
            {canExportCsv ? (
              <div className="panel-toolbar__group" role="group" aria-label="Exportacao">
                <span className="panel-toolbar__label">Exportacao</span>
                <div className="panel-toolbar__buttons">
                  <Button type="button" variant="ghost" onClick={() => void exportarRirExcel()}>
                    Excel (CSV) completo
                  </Button>
                </div>
              </div>
            ) : null}
            {canEdit ? (
              <div className="panel-toolbar__group" role="group" aria-label="Configuracao e novo RIR">
                <span className="panel-toolbar__label">RIR</span>
                <div className="panel-toolbar__buttons">
                  <Button onClick={() => setProcOpen(true)} type="button" variant="ghost">
                    Nº do procedimento
                  </Button>
                  <Button onClick={openCreateModal}>Novo RIR</Button>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      <ModuleHelp>
        <div className="rir-page-hero">
          <div className="rir-page-hero-text">
            <p className="rir-page-hero-lead">
              Documento de <strong>inspecao de recebimento</strong> com rastreio a NF, procedimento aplicavel, lista de materiais recebidos (com certificado quando
              aplicavel), evidencias (instrumentos e documentos de QC), <strong>laudo</strong> e <strong>assinaturas</strong>. Adequado para arquivo e auditoria
              do recebimento.
            </p>
            <ul className="rir-page-hero-steps">
              <li>
                <span>1</span> Lançar o recebimento em <Link to="/recebimentos">Recebimentos</Link>
              </li>
              <li>
                <span>2</span> Vincular o mesmo recebimento no RIR e preencher procedimento
              </li>
              <li>
                <span>3</span> Conferir itens da NF, certificados e laudo; use Visualizar (mesmo painel que o relatorio fotografico) antes de salvar
              </li>
              <li>
                <span>4</span> RIR em <strong>Tratado</strong> fica bloqueado para edicao; perfis com permissao de administracao podem usar{' '}
                <strong>Destravar</strong> (com a senha de sessao) para voltar a <strong>Em analise</strong> e corrigir dados se necessario
              </li>
            </ul>
          </div>
        </div>
      </ModuleHelp>
      <OperationalNotice>
        {cloudStatus === 'ready' && hasCloudConfig
          ? 'Fonte atual: Supabase. RIR sincronizado com a base em nuvem.'
          : cloudStatus === 'partial'
            ? 'Fonte atual: fallback local. Configuracao do Supabase incompleta.'
            : 'Fonte atual: fallback local. Supabase ainda nao esta configurado.'}
      </OperationalNotice>
      {fallbackReason ? <OperationalNotice tone="warning">{`Fallback ativo por falha de consulta: ${fallbackReason}`}</OperationalNotice> : null}
      <RirFilters filters={filters} onChange={setFilters} />
      {error ? <div className="error-box">{error}</div> : null}
      {success ? <OperationalNotice>{success}</OperationalNotice> : null}
      {loading ? (
        <OperationalNotice>Carregando RIR...</OperationalNotice>
      ) : (
        <>
          <RirTable
            canAdministrarRir={canAdministrarRir}
            canEdit={canEdit}
            items={items}
            onDelete={canEdit ? (item) => setRirExcluirAlvo(item) : undefined}
            onDestravar={canAdministrarRir ? abrirDestravarRir : undefined}
            onEdit={openEditModal}
            onVisualizar={(item) => {
              void visualizarRirRelatorio(item);
            }}
            onPrint={(item) => {
              if (!imprimirRirHtml(item)) {
                window.alert('Nao foi possivel abrir a impressao. Verifique se o navegador bloqueou pop-ups.');
              }
            }}
          />
          <Pagination
            onPageChange={(page) => setFilters({ ...filters, page })}
            page={filters.page}
            pageSize={filters.pageSize}
            total={total}
          />
        </>
      )}
      {!canEdit ? <OperationalNotice>Seu perfil pode consultar RIR, mas nao pode alterar registros.</OperationalNotice> : null}

      <Modal onClose={fecharDestravarRir} open={Boolean(rirDestravarAlvo) && canAdministrarRir} title="Destravar RIR (correcao)" wide>
        {rirDestravarAlvo ? (
          <div className="editor-block">
            <p>
              O RIR <strong>{rirDestravarAlvo.codigo}</strong> (NF{' '}
              <strong>{rirDestravarAlvo.recebimentoNotaFiscal?.trim() || '—'}</strong>) passara de <strong>Tratado</strong> para{' '}
              <strong>Em analise</strong>, permitindo editar ou excluir. A accao fica registada na auditoria.
            </p>
            <p className="panel-copy" style={{ marginTop: 8 }}>
              Confirme com a sua senha de utilizador. Com o foco no campo abaixo, pode premir <kbd>Enter</kbd> para confirmar.
            </p>
            <div style={{ marginTop: 12 }}>
              <label className="form-label" htmlFor="rir-destravar-senha">
                Senha
              </label>
              <input
                autoComplete="current-password"
                className="form-input"
                id="rir-destravar-senha"
                onChange={(e) => setRirDestravarSenha(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key !== 'Enter') return;
                  e.preventDefault();
                  if (rirDestravarBusy || !rirDestravarSenha.trim()) return;
                  void confirmarDestravarRir();
                }}
                type="password"
                value={rirDestravarSenha}
              />
            </div>
            {rirDestravarBusy ? (
              <div style={{ marginTop: 12 }}>
                <OperationalNotice>A processar...</OperationalNotice>
              </div>
            ) : null}
            <div className="form-actions" style={{ marginTop: 16 }}>
              <Button disabled={rirDestravarBusy} onClick={fecharDestravarRir} type="button" variant="ghost">
                Cancelar
              </Button>
              <Button
                disabled={rirDestravarBusy || !rirDestravarSenha.trim()}
                onClick={() => void confirmarDestravarRir()}
                type="button"
                variant="danger"
              >
                Destravar
              </Button>
            </div>
          </div>
        ) : null}
      </Modal>

      <Modal onClose={fecharExcluirRir} open={Boolean(rirExcluirAlvo) && canEdit} title="Excluir RIR" wide>
        {rirExcluirAlvo ? (
          <div className="editor-block">
            <OperationalNotice tone="critical">
              <p>
                Excluir permanentemente o RIR <strong>{rirExcluirAlvo.codigo}</strong>?
              </p>
              <p style={{ marginTop: 10 }}>
                Nota fiscal no recebimento:{' '}
                <strong>{rirExcluirAlvo.recebimentoNotaFiscal?.trim() || '—'}</strong>
              </p>
              <p style={{ marginTop: 10 }}>Esta acao nao pode ser desfeita.</p>
            </OperationalNotice>
            {excluindoRir ? <OperationalNotice>Excluindo...</OperationalNotice> : null}
            <div className="form-actions" style={{ marginTop: 16 }}>
              <Button disabled={excluindoRir} onClick={fecharExcluirRir} type="button" variant="ghost">
                Cancelar
              </Button>
              <Button disabled={excluindoRir} onClick={() => void confirmarExcluirRir()} type="button" variant="danger">
                {excluindoRir ? 'Excluindo...' : 'Excluir'}
              </Button>
            </div>
          </div>
        ) : null}
      </Modal>

      <Modal browserFullscreen onClose={closeModal} open={isModalOpen && canEdit} title={selected ? 'Editar RIR' : 'Novo RIR'} wide>
        <RirForm
          key={`${selected?.id ?? 'rir-novo'}-${rirFormInstance}`}
          codigoLocked={modoNumeracao !== 'manual' && !selected}
          editId={selected?.id}
          initialValue={formInitialValue}
          modoNumeracao={modoNumeracao}
          recebimentoChoices={recebimentoChoices}
          recebimentosChoicesLoading={recebimentosChoicesLoading}
          onCancel={closeModal}
          onPreview={(reg) => {
            void visualizarRirRelatorio(reg);
          }}
          onReloadAfterConflict={async () => {
            await load();
            closeModal();
          }}
          onAbrirRirExistente={async (rirId) => {
            const res = await obterRirPorId(rirId);
            if (!res.success) {
              window.alert(res.error ?? 'Nao foi possivel abrir o RIR.');
              return;
            }
            if (!res.data) {
              window.alert('RIR nao encontrado.');
              return;
            }
            const reg = res.data;
            closeModal();
            if (reg.status === 'tratado' || reg.status === 'cancelado') {
              void visualizarRirRelatorio(reg);
              return;
            }
            openEditModal(reg);
          }}
          onSubmit={submitRir}
        />
      </Modal>

      <RirProcedimentoModal canEdit={canEdit} onClose={() => setProcOpen(false)} open={procOpen} />
    </div>
  );
}
