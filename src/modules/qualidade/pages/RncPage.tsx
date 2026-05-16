import { useCallback, useEffect, useState } from 'react';
import { hydrateRncRegistro } from '../utils/rncFotoIdb';
import { useLocation, useNavigate } from 'react-router-dom';
import { Pagination } from '../../../components/tables/Pagination';
import { Button } from '../../../components/ui/Button';
import { Modal } from '../../../components/ui/Modal';
import { ModuleHelp } from '../../../components/ui/ModuleHelp';
import { OperationalNotice } from '../../../components/ui/OperationalNotice';
import { abrirPreVisualizacaoHtmlRelatorio } from '../../../lib/htmlRelatorioInstitucional';
import { getSupabaseOperationalStatus } from '../../../lib/supabase';
import { useAuth } from '../../auth/hooks/useAuth';
import { RncFilters } from '../components/RncFilters';
import { RncForm } from '../components/RncForm';
import { RncTable } from '../components/RncTable';
import { useRnc } from '../hooks/useRnc';
import type { RncRegistro } from '../types/qualidade.types';
import { imprimirRncHtmlAsync, montarHtmlRnc } from '../utils/imprimirRncHtml';

export function RncPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { canAccessAction } = useAuth();
  const cloudStatus = getSupabaseOperationalStatus();
  const [dicaRirTexto, setDicaRirTexto] = useState<string | null>(null);

  useEffect(() => {
    const st = location.state as { fromRirHint?: string } | null;
    if (st?.fromRirHint) {
      setDicaRirTexto(st.fromRirHint);
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location.pathname, location.state, navigate]);

  const visualizarRncRelatorio = useCallback(async (reg: RncRegistro) => {
    const h = await hydrateRncRegistro(reg);
    const html = montarHtmlRnc(h);
    const res = await abrirPreVisualizacaoHtmlRelatorio(html);
    if (!res.ok) {
      window.alert(
        res.error ??
          'Nao foi possivel abrir a pre-visualizacao. Permita pop-ups ou use Imprimir na lista para o dialogo do sistema.',
      );
    }
  }, []);

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
    rncFormInstance,
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
      <ModuleHelp>
        <p className="panel-copy">
          Relatorio de nao conformidade no recebimento de materiais: vinculo a NF do modulo Recebimentos, registro profissional (segregacao, evidencias, causa
          raiz, plano de acao) e impressao para arquivo e fornecedor.
        </p>
      </ModuleHelp>
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
            onVisualizar={(item) => {
              void visualizarRncRelatorio(item);
            }}
            onPrint={(item) => {
              void (async () => {
                const ok = await imprimirRncHtmlAsync(item);
                if (!ok) {
                  window.alert('Nao foi possivel abrir a impressao. Verifique se o navegador bloqueou pop-ups.');
                }
              })();
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
      <Modal browserFullscreen onClose={closeModal} open={isModalOpen && canEdit} title={selected ? 'Editar RNC' : 'Nova RNC'} wide>
        <RncForm
          key={`${selected?.id ?? 'rnc-novo'}-${rncFormInstance}`}
          editId={selected?.id}
          initialValue={formInitialValue}
          recebimentoChoices={recebimentoChoices}
          recebimentosChoicesLoading={recebimentosChoicesLoading}
          onCancel={closeModal}
          onPreview={(reg) => {
            void visualizarRncRelatorio(reg);
          }}
          onReloadAfterConflict={async () => {
            await load();
            closeModal();
          }}
          onSubmit={submitRnc}
          senhaHelp={senhaConfigurada ? 'Configuracao de senha preferencial ativa para salvar RNC.' : ''}
        />
      </Modal>
    </div>
  );
}
