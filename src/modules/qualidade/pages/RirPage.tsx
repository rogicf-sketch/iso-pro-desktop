import { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import { Pagination } from '../../../components/tables/Pagination';
import { Button } from '../../../components/ui/Button';
import { Modal } from '../../../components/ui/Modal';
import { OperationalNotice } from '../../../components/ui/OperationalNotice';
import { getSupabaseOperationalStatus } from '../../../lib/supabase';
import { useAuth } from '../../auth/hooks/useAuth';
import { RirFilters } from '../components/RirFilters';
import { RirForm } from '../components/RirForm';
import { RirProcedimentoModal } from '../components/RirProcedimentoModal';
import { RirTable } from '../components/RirTable';
import { useRir } from '../hooks/useRir';
import type { RirRegistro } from '../types/qualidade.types';
import { imprimirRirHtml, montarHtmlRelatorioRirCompleto } from '../utils/imprimirRirHtml';

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
    setFilters,
    openCreateModal,
    openEditModal,
    closeModal,
    load,
    submitRir,
    removeRir,
  } = useRir();
  const canEdit = canAccessAction('rir', 'editar');
  const [previewReg, setPreviewReg] = useState<RirRegistro | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
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

  return (
    <div className="panel">
      <div className="panel-header panel-header--toolbar">
        <div>
          <p className="panel-kicker">Qualidade</p>
          <h2>RIR — Inspecao de recebimento</h2>
        </div>
        {canEdit ? (
          <div className="panel-toolbar">
            <div className="panel-toolbar__group" role="group" aria-label="Configuracao e novo RIR">
              <span className="panel-toolbar__label">RIR</span>
              <div className="panel-toolbar__buttons">
                <Button onClick={() => setProcOpen(true)} type="button" variant="ghost">
                  Nº do procedimento
                </Button>
                <Button onClick={openCreateModal}>Novo RIR</Button>
              </div>
            </div>
          </div>
        ) : null}
      </div>

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
              <span>3</span> Conferir itens da NF, certificados e laudo; visualizar o relatorio antes de salvar
            </li>
          </ul>
        </div>
      </div>
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
            canEdit={canEdit}
            items={items}
            onDelete={canEdit ? (item) => setRirExcluirAlvo(item) : undefined}
            onEdit={openEditModal}
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

      <Modal onClose={fecharExcluirRir} open={Boolean(rirExcluirAlvo) && canEdit} title="Excluir RIR">
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

      <Modal onClose={closeModal} open={isModalOpen && canEdit} title={selected ? 'Editar RIR' : 'Novo RIR'} wide>
        <RirForm
          key={selected?.id ?? 'rir-novo'}
          codigoLocked={modoNumeracao !== 'manual' && !selected}
          editId={selected?.id}
          initialValue={formInitialValue}
          modoNumeracao={modoNumeracao}
          recebimentoChoices={recebimentoChoices}
          recebimentosChoicesLoading={recebimentosChoicesLoading}
          onCancel={closeModal}
          onPreview={(reg) => {
            setPreviewReg(reg);
            setPreviewOpen(true);
          }}
          onReloadAfterConflict={async () => {
            await load();
            closeModal();
          }}
          onSubmit={submitRir}
        />
      </Modal>

      <Modal onClose={() => setPreviewOpen(false)} open={previewOpen} title="Relatorio RIR" wide>
        {previewReg ? (
          <>
            <div dangerouslySetInnerHTML={{ __html: montarHtmlRelatorioRirCompleto(previewReg) }} />
            <div className="form-actions" style={{ marginTop: 16 }}>
              <Button onClick={() => setPreviewOpen(false)} type="button" variant="ghost">
                Fechar
              </Button>
              <Button
                onClick={() => {
                  if (previewReg && imprimirRirHtml(previewReg)) {
                    setPreviewOpen(false);
                  }
                }}
                type="button"
              >
                Imprimir / PDF
              </Button>
            </div>
          </>
        ) : null}
      </Modal>

      <RirProcedimentoModal canEdit={canEdit} onClose={() => setProcOpen(false)} open={procOpen} />
    </div>
  );
}
