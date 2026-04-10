import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Pagination } from '../../../components/tables/Pagination';
import { Button } from '../../../components/ui/Button';
import { Modal } from '../../../components/ui/Modal';
import { OperationalNotice } from '../../../components/ui/OperationalNotice';
import { getSupabaseOperationalStatus } from '../../../lib/supabase';
import { useAuth } from '../../auth/hooks/useAuth';
import { RncFilters } from '../components/RncFilters';
import { RncForm } from '../components/RncForm';
import { RncTable } from '../components/RncTable';
import { useRnc } from '../hooks/useRnc';
import type { RncRegistro } from '../types/qualidade.types';
import { imprimirRncHtml, montarHtmlRnc } from '../utils/imprimirRncHtml';

export function RncPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { canAccessAction } = useAuth();
  const cloudStatus = getSupabaseOperationalStatus();
  const [dicaRirTexto, setDicaRirTexto] = useState<string | null>(null);
  const [previewReg, setPreviewReg] = useState<RncRegistro | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);

  useEffect(() => {
    const st = location.state as { fromRirHint?: string } | null;
    if (st?.fromRirHint) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- consumir location.state e refletir na UI
      setDicaRirTexto(st.fromRirHint);
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location.pathname, location.state, navigate]);
  const {
    items,
    total,
    loading,
    error,
    success,
    fallbackReason,
    hasCloudConfig,
    senhaConfigurada,
    filters,
    formInitialValue,
    isModalOpen,
    selected,
    setFilters,
    openCreateModal,
    openEditModal,
    closeModal,
    load,
    submitRnc,
    recebimentoChoices,
    recebimentosChoicesLoading,
  } = useRnc();
  const canEdit = canAccessAction('rnc', 'editar');

  return (
    <div className="panel">
      <div className="panel-header panel-header--toolbar">
        <div>
          <p className="panel-kicker">Qualidade</p>
          <h2>RNC</h2>
        </div>
        {canEdit ? (
          <div className="panel-toolbar">
            <div className="panel-toolbar__group" role="group" aria-label="Cadastro">
              <span className="panel-toolbar__label">Registo</span>
              <div className="panel-toolbar__buttons">
                <Button onClick={openCreateModal}>Nova RNC</Button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
      <p className="panel-copy">
        Relatorio de nao conformidade no recebimento de materiais: vinculo a NF do modulo Recebimentos, registro profissional (segregacao, evidencias, causa
        raiz, plano de acao) e impressao para arquivo e fornecedor.
      </p>
      {dicaRirTexto ? <OperationalNotice>{dicaRirTexto}</OperationalNotice> : null}
      <OperationalNotice>
        {cloudStatus === 'ready' && hasCloudConfig
          ? 'Fonte atual: Supabase. RNC sincronizada com a base em nuvem.'
          : cloudStatus === 'partial'
            ? 'Fonte atual: fallback local. Configuracao do Supabase incompleta.'
            : 'Fonte atual: fallback local. Supabase ainda nao esta configurado.'}
      </OperationalNotice>
      {fallbackReason ? <OperationalNotice tone="warning">{`Fallback ativo por falha de consulta: ${fallbackReason}`}</OperationalNotice> : null}
      <RncFilters filters={filters} onChange={setFilters} />
      {error ? <div className="error-box">{error}</div> : null}
      {success ? <OperationalNotice>{success}</OperationalNotice> : null}
      {loading ? (
        <OperationalNotice>Carregando RNC...</OperationalNotice>
      ) : (
        <>
          <RncTable
            canEdit={canEdit}
            items={items}
            onEdit={openEditModal}
            onPrint={(item) => {
              if (!imprimirRncHtml(item)) {
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
      {!canEdit ? <OperationalNotice>Seu perfil pode consultar RNC, mas nao pode alterar registros.</OperationalNotice> : null}
      <Modal onClose={closeModal} open={isModalOpen && canEdit} title={selected ? 'Editar RNC' : 'Nova RNC'} wide>
        <RncForm
          key={selected?.id ?? 'rnc-novo'}
          editId={selected?.id}
          initialValue={formInitialValue}
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
          onSubmit={submitRnc}
          senhaHelp={senhaConfigurada ? 'Configuracao de senha preferencial ativa para salvar RNC.' : ''}
        />
      </Modal>

      <Modal onClose={() => setPreviewOpen(false)} open={previewOpen} title="Visualizar RNC (impressao)" wide>
        {previewReg ? (
          <>
            <OperationalNotice>
              Pre-visualizacao com os dados atuais do formulario (ainda nao gravados se nao clicou em Salvar). Use Imprimir / PDF para enviar ao browser.
            </OperationalNotice>
            <iframe
              className="rnc-preview-iframe"
              srcDoc={montarHtmlRnc(previewReg)}
              title="Relatorio RNC"
            />
            <div className="form-actions" style={{ marginTop: 16 }}>
              <Button onClick={() => setPreviewOpen(false)} type="button" variant="ghost">
                Fechar
              </Button>
              <Button
                onClick={() => {
                  if (previewReg && imprimirRncHtml(previewReg)) {
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
    </div>
  );
}
