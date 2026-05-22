import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useModalFormDirty, useModalGuardedClose } from '../../../components/ui/modalFormGuard';
import { collectAllPages } from '../../../lib/collectAllPages';
import { isPlainFormDirty } from '../../../lib/isPlainFormDirty';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { Select } from '../../../components/ui/Select';
import { OperationalNotice } from '../../../components/ui/OperationalNotice';
import { SnapshotConflictHint } from '../../../components/ui/SnapshotConflictHint';
import { colaboradoresElegiveisAssinaturaRir, listarColaboradores } from '../../colaboradores/services/colaboradores.service';
import { readConfiguracoes } from '../../configuracoes/services/configuracoes.service';
import { buscarRecebimentoPorId } from '../../recebimentos/services/recebimentos.service';
import type { Recebimento } from '../../recebimentos/types/recebimento.types';
import type { ServiceWriteResult } from '../../../types/common.types';
import { normalizeRirRegistro, obterSugestaoCodigoRir, validateRir } from '../services/qualidade.service';
import type { RirFormData, RirItemLinha, RirRecebimentoChoice, RirRegistro } from '../types/qualidade.types';
import { codigoHelpLinhaRir } from '../utils/rirNumeracaoCopy';
import {
  mapRecebimentoItensParaRirItens,
  montarCorpoObservacoesItensRecebimento,
  substituirBlocoObservacoesItensNoTexto,
} from '../utils/rirMapeamento';

function textoBuscaRecebimentoInicialRir(iv: RirFormData): string {
  if (!iv.recebimentoId?.trim()) return '';
  const nf = iv.recebimentoNotaFiscal ?? '';
  const fo = iv.recebimentoFornecedor ?? '';
  return [nf, fo].filter(Boolean).join(' · ');
}

function recebimentoDisponivelSomenteSemRir(c: RirRecebimentoChoice, editId?: string): boolean {
  if (!c.possuiRirNaoCancelado) return true;
  if (!editId) return false;
  const outros = c.rirExistentes.filter((r) => r.id !== editId);
  return outros.length === 0;
}

type Props = {
  initialValue: RirFormData;
  codigoLocked?: boolean;
  editId?: string;
  recebimentoChoices: RirRecebimentoChoice[];
  recebimentosChoicesLoading?: boolean;
  modoNumeracao: 'auto' | 'disciplina' | 'manual';
  onCancel: () => void;
  onSubmit: (data: RirFormData) => Promise<ServiceWriteResult>;
  onReloadAfterConflict?: () => void | Promise<void>;
  onPreview: (registro: RirRegistro) => void;
  /** Abre o RIR existente (edição ou só visualização se finalizado). */
  onAbrirRirExistente?: (rirId: string) => void | Promise<void>;
};

function linhaVazia(): RirItemLinha {
  return {
    id: crypto.randomUUID(),
    codigoMaterial: '',
    quantidade: 0,
    unidade: '',
    descricaoMaterial: '',
    certificado: 'N/A',
    linhaOrigemRecebimento: false,
  };
}

export function RirForm({
  initialValue,
  codigoLocked = false,
  editId,
  recebimentoChoices,
  recebimentosChoicesLoading = false,
  modoNumeracao,
  onCancel,
  onSubmit,
  onReloadAfterConflict,
  onPreview,
  onAbrirRirExistente,
}: Props) {
  const [form, setForm] = useState<RirFormData>(initialValue);
  const [error, setError] = useState('');
  const [snapshotConflict, setSnapshotConflict] = useState(false);
  const guardedCancel = useModalGuardedClose(onCancel);
  useModalFormDirty(isPlainFormDirty(initialValue, form));
  /** Por defeito ligado em novo RIR: esconde NFs que já têm RIR ativo. */
  const [somenteSemRir, setSomenteSemRir] = useState(() => !editId);
  const [recSearch, setRecSearch] = useState(() => textoBuscaRecebimentoInicialRir(initialValue));
  const [recOpen, setRecOpen] = useState(false);
  const [recLoading, setRecLoading] = useState(false);
  const [recebimentoCarregado, setRecebimentoCarregado] = useState<Recebimento | null>(null);
  const [carregandoDetalheNf, setCarregandoDetalheNf] = useState(false);
  const identificacaoRirRef = useRef<HTMLElement | null>(null);
  const certificadoInputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const [colabAssinaturaNomes, setColabAssinaturaNomes] = useState<string[]>([]);

  useLayoutEffect(() => {
    certificadoInputRefs.current.length = form.itensRir.length;
  }, [form.itensRir.length]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const items = await collectAllPages(async (page, pageSize) => {
          const r = await listarColaboradores({
            busca: '',
            tipo: 'todos',
            status: 'ativos',
            page,
            pageSize,
          });
          if (!r.success || !r.data) return { data: undefined };
          return { data: r.data };
        });
        if (cancelled) return;
        setColabAssinaturaNomes(colaboradoresElegiveisAssinaturaRir(items));
      } catch {
        if (!cancelled) setColabAssinaturaNomes([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const id = initialValue.recebimentoId?.trim();
      if (!id) {
        if (!cancelled) {
          setRecebimentoCarregado(null);
          setCarregandoDetalheNf(false);
        }
        return;
      }
      setCarregandoDetalheNf(true);
      const res = await buscarRecebimentoPorId(id);
      if (cancelled) return;
      setCarregandoDetalheNf(false);
      if (res.success && res.data) setRecebimentoCarregado(res.data);
      else setRecebimentoCarregado(null);
    })();
    return () => {
      cancelled = true;
    };
  }, [initialValue.recebimentoId]);

  const procedimentoDatalist = useMemo(() => readConfiguracoes().rirProcedimentosCadastro ?? [], []);

  const filtradosRecebimento = useMemo(() => {
    const base = recebimentoChoices.filter((c) => {
      if (!somenteSemRir) return true;
      return recebimentoDisponivelSomenteSemRir(c, editId);
    });
    const t = recSearch.trim().toLowerCase();
    if (!t) return base.slice(0, 40);
    return base.filter((c) => c.label.toLowerCase().includes(t)).slice(0, 40);
  }, [recebimentoChoices, recSearch, somenteSemRir, editId]);

  const avisoRirDuplicado = useMemo(() => {
    const rid = form.recebimentoId?.trim();
    if (!rid) return null;
    const choice = recebimentoChoices.find((c) => c.id === rid);
    if (!choice?.possuiRirNaoCancelado || choice.rirExistentes.length === 0) return null;
    if (editId) {
      const outros = choice.rirExistentes.filter((r) => r.id !== editId);
      if (outros.length === 0) return null;
      return outros;
    }
    return choice.rirExistentes;
  }, [form.recebimentoId, recebimentoChoices, editId]);

  async function aplicarRecebimento(id: string) {
    if (!id) return;
    setRecLoading(true);
    const result = await buscarRecebimentoPorId(id);
    setRecLoading(false);
    if (!result.success || !result.data) {
      setError(result.error ?? 'Recebimento nao encontrado.');
      return;
    }
    const rec = result.data;
    const itens = mapRecebimentoItensParaRirItens(rec);
    const corpoObsItens = montarCorpoObservacoesItensRecebimento(rec);
    setRecebimentoCarregado(rec);
    setForm((f) => ({
      ...f,
      recebimentoId: rec.id,
      recebimentoNotaFiscal: rec.notaFiscal,
      recebimentoRomaneio: rec.romaneio,
      recebimentoData: rec.dataRecebimento,
      recebimentoFornecedor: rec.fornecedor,
      fornecedorNome: rec.fornecedor,
      obsCurta: rec.observacoes?.trim() ? rec.observacoes : f.obsCurta,
      observacoesQc: substituirBlocoObservacoesItensNoTexto(f.observacoesQc ?? '', corpoObsItens),
      origem: f.origem.trim() ? f.origem : `Recebimento · NF ${rec.notaFiscal || '—'}`,
      itensRir: itens.length ? itens : [linhaVazia()],
    }));
    setRecSearch(`${rec.notaFiscal || '—'} · ${rec.fornecedor}`);
    setRecOpen(false);
    setError('');
    window.requestAnimationFrame(() => {
      identificacaoRirRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  function trocarRecebimento() {
    setRecebimentoCarregado(null);
    setForm((f) => ({
      ...f,
      recebimentoId: '',
      recebimentoNotaFiscal: '',
      recebimentoRomaneio: '',
      recebimentoData: '',
      recebimentoFornecedor: '',
      itensRir: [],
      observacoesQc: substituirBlocoObservacoesItensNoTexto(f.observacoesQc ?? '', ''),
    }));
    setRecSearch('');
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setSnapshotConflict(false);
    const result = await onSubmit(form);
    if (!result.success) {
      setError(result.error ?? 'Nao foi possivel salvar o RIR.');
      setSnapshotConflict(result.meta?.snapshotConflict === true);
    }
  }

  function preview() {
    setError('');
    const err = validateRir(form);
    if (err) {
      setError(err);
      return;
    }
    onPreview(normalizeRirRegistro({ ...form, id: 'preview', status: form.status ?? 'aberto' }));
  }

  async function sugerirNumero() {
    setError('');
    const s = await obterSugestaoCodigoRir(form, editId);
    if (!s) {
      setError('Nao foi possivel sugerir numero. Verifique modo de numeracao e procedimento.');
      return;
    }
    setForm((f) => ({ ...f, codigo: s }));
  }

  const isCriticalStatus = form.status === 'aberto' || form.status === 'cancelado';
  const vinculoNf = !!form.recebimentoId?.trim();
  const bloquearMaterialLinha = (it: RirItemLinha) => vinculoNf && it.linhaOrigemRecebimento !== false;

  return (
    <form className="form-grid rir-form-professional" onSubmit={handleSubmit}>
      {!editId ? (
        <OperationalNotice tone="warning">
          Escolha o recebimento abaixo e siga para <strong>nº RIR</strong>, procedimento, itens e laudo — tudo editavel nesta tela.
        </OperationalNotice>
      ) : (
        <OperationalNotice tone="warning">
          Ajuste procedimento, inspecao, laudo e assinaturas conforme o recebimento vinculado.
        </OperationalNotice>
      )}
      {codigoLocked ? (
        <OperationalNotice>Numeracao controlada pela configuracao do sistema.</OperationalNotice>
      ) : null}
      {isCriticalStatus ? (
        <OperationalNotice tone={form.status === 'cancelado' ? 'critical' : 'warning'}>
          {form.status === 'cancelado'
            ? 'RIR cancelado: confirme justificativa administrativa.'
            : 'RIR em aberto: acompanhe ate analise ou tratamento formal.'}
        </OperationalNotice>
      ) : null}

      <section className="rir-card">
        <h4 className="rir-card-title">1) Recebimento (origem)</h4>
        <p className="panel-copy" style={{ marginBottom: 10 }}>
          Digite a NF, romaneio ou fornecedor e escolha na lista — os campos do RIR abaixo ficam prontos para editar e salvar.
        </p>
        {!recebimentosChoicesLoading ? (
          <label className="rir-rec-filter">
            <input
              checked={somenteSemRir}
              onChange={(e) => setSomenteSemRir(e.target.checked)}
              type="checkbox"
            />
            <span>
              Mostrar apenas recebimentos <strong>sem RIR</strong> (evita duplicar relatório). Desmarque para ver todas as NFs.
            </span>
          </label>
        ) : null}
        <div className="rir-rec-wrap">
          <Input
            disabled={recebimentosChoicesLoading || recLoading}
            label="Buscar recebimento"
            onChange={(e) => {
              setRecSearch(e.target.value);
              setRecOpen(true);
            }}
            onFocus={() => setRecOpen(true)}
            placeholder="Ex.: NF-2544 ou fornecedor"
            value={recSearch}
          />
          {recOpen && filtradosRecebimento.length === 0 && recSearch.trim() && !recebimentosChoicesLoading ? (
            <div className="rir-rec-dropdown rir-rec-dropdown--empty" role="status">
              Nenhum recebimento corresponde à busca
              {somenteSemRir ? ' com o filtro «sem RIR». Desmarque o filtro ou altere o texto.' : '.'}
            </div>
          ) : null}
          {recOpen && filtradosRecebimento.length > 0 ? (
            <div className="rir-rec-dropdown" role="listbox">
              {filtradosRecebimento.map((c) => (
                <button
                  className={`rir-rec-option${c.possuiRirNaoCancelado ? ' rir-rec-option--ja-rir' : ''}`}
                  key={c.id}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => void aplicarRecebimento(c.id)}
                  type="button"
                >
                  <span className="rir-rec-option-label">{c.label}</span>
                  {c.possuiRirNaoCancelado ? (
                    <span className="rir-rec-option-badge">Já tem RIR</span>
                  ) : null}
                </button>
              ))}
            </div>
          ) : null}
        </div>
        {form.recebimentoId && carregandoDetalheNf ? (
          <p className="panel-copy" style={{ marginTop: 8 }}>
            Carregando recebimento...
          </p>
        ) : null}
        {form.recebimentoId && !carregandoDetalheNf && !recebimentoCarregado ? (
          <OperationalNotice tone="warning">
            Nao foi possivel carregar o recebimento para exibir a NF completa. Verifique o cadastro ou troque o vinculo.
          </OperationalNotice>
        ) : null}
        {form.recebimentoId && recebimentoCarregado ? (
          <div className="rir-nf-vinculo-compact">
            <p className="rir-nf-vinculo-line">
              <strong>{recebimentoCarregado.notaFiscal || '—'}</strong>
              <span className="rir-nf-vinculo-sep"> · </span>
              <span>{recebimentoCarregado.fornecedor}</span>
              <span className="rir-nf-vinculo-sep"> · </span>
              <span>Rom. {recebimentoCarregado.romaneio || '—'}</span>
              <span className="rir-nf-vinculo-sep"> · </span>
              <span>{recebimentoCarregado.dataRecebimento || '—'}</span>
              <span className="rir-nf-vinculo-sep"> · </span>
              <span>
                {recebimentoCarregado.itens.length} linha(s) importada(s) para inspecao
              </span>
            </p>
            <p className="panel-copy" style={{ marginTop: 8, marginBottom: 0 }}>
              Edite procedimento, itens, certificados e laudo nas secoes abaixo.{' '}
              <span className="rir-nf-vinculo-id">ID recebimento: {recebimentoCarregado.id}</span>
            </p>
            <div className="rir-nf-vinculo-actions">
              <Button onClick={trocarRecebimento} type="button" variant="ghost">
                Trocar recebimento
              </Button>
            </div>
            {avisoRirDuplicado && avisoRirDuplicado.length > 0 ? (
              <div className="rir-duplicado-banner" role="status">
                <p>
                  <strong>Atenção:</strong> já existe relatório RIR para este recebimento:{' '}
                  {avisoRirDuplicado.map((r) => r.codigo).join(', ')}. Evite duplicar salvo exceção documentada.
                </p>
                {onAbrirRirExistente ? (
                  <div className="rir-duplicado-banner-actions">
                    {avisoRirDuplicado.map((r) => (
                      <Button
                        key={r.id}
                        onClick={() => void onAbrirRirExistente(r.id)}
                        type="button"
                        variant="ghost"
                      >
                        Abrir {r.codigo}
                      </Button>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}
        {form.recebimentoId && !recebimentoCarregado && !carregandoDetalheNf ? (
          <Button onClick={trocarRecebimento} type="button" variant="ghost">
            Trocar recebimento
          </Button>
        ) : null}
      </section>

      <section className="rir-card" ref={identificacaoRirRef}>
        <h4 className="rir-card-title">Identificacao do RIR</h4>
        <div className="form-columns">
          <label className="field">
            <span>Nº RIR *</span>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                className="input-control"
                onChange={(e) => setForm({ ...form, codigo: e.target.value })}
                readOnly={codigoLocked}
                style={{ flex: 1 }}
                value={form.codigo}
              />
              <Button onClick={() => void sugerirNumero()} type="button" variant="ghost">
                Sugerir
              </Button>
            </div>
            <small className="panel-copy">{codigoHelpLinhaRir(modoNumeracao)}</small>
          </label>
          <Input
            label="Data *"
            onChange={(e) => setForm({ ...form, dataRegistro: e.target.value })}
            type="date"
            value={form.dataRegistro}
          />
        </div>
      </section>

      <section className="rir-card">
        <h4 className="rir-card-title">Obra / contrato</h4>
        {!editId ? (
          <p className="panel-copy" style={{ marginBottom: 10 }}>
            UO, Local e Contrato são sugeridos a partir de Configurações (centro de custo) e podem ser alterados neste RIR.
          </p>
        ) : null}
        <div className="form-columns">
          <Input label="UO (Obra / Depto)" onChange={(e) => setForm({ ...form, uo: e.target.value })} value={form.uo} />
          <Input label="Local" onChange={(e) => setForm({ ...form, localObra: e.target.value })} value={form.localObra} />
          <Input label="Contrato Nº" onChange={(e) => setForm({ ...form, contratoNumero: e.target.value })} value={form.contratoNumero} />
        </div>
      </section>

      <section className="rir-card">
        <h4 className="rir-card-title">Fornecedor e tipo de inspecao</h4>
        <Input
          label="Fornecedor *"
          onChange={(e) => setForm({ ...form, fornecedorNome: e.target.value })}
          readOnly={vinculoNf}
          title={vinculoNf ? 'Sincronizado com o recebimento vinculado.' : undefined}
          value={form.fornecedorNome}
          className={vinculoNf ? 'rir-input-readonly' : undefined}
        />
        <p className="panel-copy" style={{ marginTop: 8 }}>
          Tipos de inspecao aplicados:
        </p>
        <div className="rir-check-row">
          <label>
            <input
              checked={form.inspecaoQuantitativa}
              onChange={(e) => setForm({ ...form, inspecaoQuantitativa: e.target.checked })}
              type="checkbox"
            />{' '}
            Quantitativa
          </label>
          <label>
            <input
              checked={form.inspecaoQualitativa}
              onChange={(e) => setForm({ ...form, inspecaoQualitativa: e.target.checked })}
              type="checkbox"
            />{' '}
            Qualitativa
          </label>
          <label>
            <input
              checked={form.inspecaoDimensional}
              onChange={(e) => setForm({ ...form, inspecaoDimensional: e.target.checked })}
              type="checkbox"
            />{' '}
            Dimensional
          </label>
        </div>
      </section>

      <section className="rir-card">
        <h4 className="rir-card-title">Documentos (NF / recebimento)</h4>
        {vinculoNf ? (
          <OperationalNotice>
            Nº NF e romaneio seguem o recebimento vinculado (bloqueados). Ajuste apenas o <strong>procedimento</strong> e observacoes proprias do RIR.
          </OperationalNotice>
        ) : null}
        <div className="form-columns">
          <Input
            className={vinculoNf ? 'rir-input-readonly' : undefined}
            label="Nº Nota Fiscal"
            onChange={(e) => setForm({ ...form, recebimentoNotaFiscal: e.target.value })}
            readOnly={vinculoNf}
            value={form.recebimentoNotaFiscal ?? ''}
          />
          <Input
            className={vinculoNf ? 'rir-input-readonly' : undefined}
            label="Nº Romaneio"
            onChange={(e) => setForm({ ...form, recebimentoRomaneio: e.target.value })}
            readOnly={vinculoNf}
            value={form.recebimentoRomaneio ?? ''}
          />
        </div>
        <label className="field">
          <span>Nº Procedimento *</span>
          <input
            className="input-control"
            list="rir-procedimento-datalist"
            onChange={(e) => setForm({ ...form, procedimentoNumero: e.target.value })}
            placeholder="Ex.: PE-TUB-003 REV.2"
            value={form.procedimentoNumero}
          />
          <datalist id="rir-procedimento-datalist">
            {procedimentoDatalist.map((p) => (
              <option key={p.id} value={`${p.base} ${p.revisao}`.trim()} />
            ))}
          </datalist>
          <small className="panel-copy">Sugestoes do cadastro em &quot;Nº do procedimento&quot; (toolbar do RIR).</small>
        </label>
        <Input
          label="Sol. compra / Pack-list"
          onChange={(e) => setForm({ ...form, solCompraPackList: e.target.value })}
          placeholder="Ex.: MTC-PC-29823/811/727"
          value={form.solCompraPackList}
        />
        <Input label="Obs. (curta)" onChange={(e) => setForm({ ...form, obsCurta: e.target.value })} value={form.obsCurta} />
      </section>

      <section className="rir-card">
        <h4 className="rir-card-title">Itens para inspecao</h4>
        <p className="panel-copy">
          {vinculoNf
            ? 'Dados da NF: codigo, descricao e quantidade (somente leitura). O unico campo editavel por item e o certificado.'
            : 'Sem recebimento vinculado, preencha codigo, descricao e quantidade em cada linha; o certificado continua editavel.'}{' '}
          <span className="rir-cert-enter-hint">Enter no certificado avanca para o item seguinte.</span>
        </p>
        {!vinculoNf ? (
          <div style={{ marginBottom: 8 }}>
            <Button
              onClick={() => setForm((f) => ({ ...f, itensRir: [...f.itensRir, linhaVazia()] }))}
              type="button"
              variant="ghost"
            >
              + Linha
            </Button>
          </div>
        ) : null}
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table rir-itens-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Codigo</th>
                <th>Descricao</th>
                <th className="rir-num-col">Quantidade</th>
                <th>Certificado *</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {form.itensRir.map((it, idx) => {
                const ro = bloquearMaterialLinha(it);
                const qtdLabel =
                  typeof it.quantidade === 'number' && Number.isFinite(it.quantidade)
                    ? `${it.quantidade}${it.unidade?.trim() ? ` ${it.unidade.trim()}` : ''}`
                    : '—';
                return (
                  <tr key={it.id}>
                    <td>{idx + 1}</td>
                    {ro ? (
                      <>
                        <td className="rir-item-cell-ro" title="Dado da NF — altere em Recebimentos se necessario.">
                          {it.codigoMaterial || '—'}
                        </td>
                        <td className="rir-item-cell-ro rir-item-desc-cell">{it.descricaoMaterial?.trim() || '—'}</td>
                        <td className="rir-item-cell-ro rir-num-col">{qtdLabel}</td>
                      </>
                    ) : (
                      <>
                        <td>
                          <input
                            className="input-control input-table"
                            onChange={(e) => {
                              const next = [...form.itensRir];
                              next[idx] = { ...it, codigoMaterial: e.target.value };
                              setForm({ ...form, itensRir: next });
                            }}
                            value={it.codigoMaterial}
                          />
                        </td>
                        <td>
                          <textarea
                            className="input-control input-table"
                            onChange={(e) => {
                              const next = [...form.itensRir];
                              next[idx] = { ...it, descricaoMaterial: e.target.value };
                              setForm({ ...form, itensRir: next });
                            }}
                            rows={2}
                            value={it.descricaoMaterial}
                          />
                        </td>
                        <td>
                          <div className="rir-qtd-manual-row">
                            <input
                              className="input-control input-table rir-num-col"
                              inputMode="decimal"
                              onChange={(e) => {
                                const next = [...form.itensRir];
                                next[idx] = { ...it, quantidade: Number(e.target.value) || 0 };
                                setForm({ ...form, itensRir: next });
                              }}
                              type="number"
                              value={it.quantidade}
                            />
                            <input
                              className="input-control input-table rir-unidade-inline"
                              onChange={(e) => {
                                const next = [...form.itensRir];
                                next[idx] = { ...it, unidade: e.target.value };
                                setForm({ ...form, itensRir: next });
                              }}
                              placeholder="Un."
                              title="Unidade"
                              value={it.unidade}
                            />
                          </div>
                        </td>
                      </>
                    )}
                    <td>
                      <input
                        ref={(el) => {
                          certificadoInputRefs.current[idx] = el;
                        }}
                        autoComplete="off"
                        className="input-control input-table rir-cert-input"
                        onChange={(e) => {
                          const next = [...form.itensRir];
                          next[idx] = { ...it, certificado: e.target.value };
                          setForm({ ...form, itensRir: next });
                        }}
                        onKeyDown={(e) => {
                          if (e.key !== 'Enter') return;
                          e.preventDefault();
                          const nextIdx = idx + 1;
                          if (nextIdx >= form.itensRir.length) return;
                          window.requestAnimationFrame(() => {
                            const nextEl = certificadoInputRefs.current[nextIdx];
                            nextEl?.focus();
                            nextEl?.select();
                          });
                        }}
                        placeholder="Nº certificado"
                        title="Enter: proximo certificado"
                        type="text"
                        value={it.certificado}
                      />
                    </td>
                    <td>
                      {ro ? (
                        <span className="rir-linha-bloq" title="Linha da NF">
                          —
                        </span>
                      ) : (
                        <Button
                          onClick={() =>
                            setForm((f) => ({
                              ...f,
                              itensRir: f.itensRir.filter((row) => row.id !== it.id),
                            }))
                          }
                          type="button"
                          variant="ghost"
                        >
                          Remover
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rir-card">
        <h4 className="rir-card-title">Inspecao de recebimento</h4>
        <p className="panel-copy" style={{ margin: '0 0 10px', fontSize: 12 }}>
          Ao escolher o recebimento acima, as <strong>observações por item</strong> (conferência no Recebimentos / campo) são reunidas num bloco no
          início deste campo; pode editar ou acrescentar texto. Se mudar de recebimento, o bloco é atualizado; observações que escrever à parte
          mantêm-se abaixo do bloco.
        </p>
        <label className="field">
          <span>Observacoes da inspecao</span>
          <textarea
            className="input-control text-area"
            onChange={(e) => setForm({ ...form, observacoesQc: e.target.value })}
            rows={5}
            value={form.observacoesQc}
          />
        </label>
      </section>

      <section className="rir-card">
        <h4 className="rir-card-title">Laudo</h4>
        <div className="rir-laudo-row">
          <label>
            <input
              checked={form.laudo === 'aprovado'}
              name="rirLaudo"
              onChange={() => setForm({ ...form, laudo: 'aprovado' })}
              type="radio"
            />{' '}
            Aprovado
          </label>
          <label>
            <input
              checked={form.laudo === 'reprovado'}
              name="rirLaudo"
              onChange={() => setForm({ ...form, laudo: 'reprovado' })}
              type="radio"
            />{' '}
            Reprovado
          </label>
          <label>
            <input
              checked={form.laudo === 'observacoes'}
              name="rirLaudo"
              onChange={() => setForm({ ...form, laudo: 'observacoes' })}
              type="radio"
            />{' '}
            Conforme observacoes
          </label>
        </div>
      </section>

      <section className="rir-card">
        <h4 className="rir-card-title">Fluxo do registro</h4>
        <p className="panel-copy">
          O <strong>laudo</strong> (Aprovado / Reprovado) descreve o resultado da inspecao. O <strong>status</strong> na lista indica o andamento administrativo do RIR:
          em aberto, em analise, tratado (encerrado) ou cancelado. Para &quot;finalizar&quot; o processo, escolha <strong>Tratado</strong> e salve.
        </p>
        <div className="form-columns">
          <Select
            label="Status do RIR"
            onChange={(e) => setForm({ ...form, status: e.target.value as RirFormData['status'] })}
            value={form.status ?? 'aberto'}
          >
            <option value="aberto">Aberto</option>
            <option value="em_analise">Em analise</option>
            <option value="tratado">Tratado (finalizado)</option>
            <option value="cancelado">Cancelado</option>
          </Select>
        </div>
        <label className="field">
          <span>Observacoes — tratativa / justificativa</span>
          <textarea
            className="input-control text-area"
            onChange={(e) => setForm({ ...form, observacoes: e.target.value })}
            placeholder="Registo interno, NC relacionada, motivo de cancelamento, etc."
            rows={3}
            value={form.observacoes ?? ''}
          />
        </label>
      </section>

      <section className="rir-card">
        <h4 className="rir-card-title">Assinaturas</h4>
        <p className="panel-copy" style={{ marginBottom: 12 }}>
          Responsavel recebimento e Controle de qualidade: digite ou escolha na lista dos colaboradores ativos (cadastro em Colaboradores). Quem tem funcao
          &quot;Cliente&quot; nao aparece aqui. O campo Cliente abaixo continua livre, sem lista.
        </p>
        <datalist id="rir-assinatura-colaboradores">
          {colabAssinaturaNomes.map((n) => (
            <option key={n} value={n} />
          ))}
        </datalist>
        <div className="form-columns">
          <Input
            autoComplete="off"
            label="Responsavel recebimento"
            list="rir-assinatura-colaboradores"
            onChange={(e) => setForm({ ...form, assinaturaRecebimento: { ...form.assinaturaRecebimento, nome: e.target.value } })}
            title="Sugestoes: colaboradores ativos (exceto funcao Cliente)"
            value={form.assinaturaRecebimento.nome}
          />
          <Input
            label="Data"
            onChange={(e) => setForm({ ...form, assinaturaRecebimento: { ...form.assinaturaRecebimento, data: e.target.value } })}
            type="date"
            value={form.assinaturaRecebimento.data}
          />
          <Input
            autoComplete="off"
            label="Controle de qualidade"
            list="rir-assinatura-colaboradores"
            onChange={(e) => setForm({ ...form, assinaturaCq: { ...form.assinaturaCq, nome: e.target.value } })}
            title="Sugestoes: colaboradores ativos (exceto funcao Cliente)"
            value={form.assinaturaCq.nome}
          />
          <Input
            label="Data"
            onChange={(e) => setForm({ ...form, assinaturaCq: { ...form.assinaturaCq, data: e.target.value } })}
            type="date"
            value={form.assinaturaCq.data}
          />
          <Input
            label="Cliente"
            onChange={(e) => setForm({ ...form, assinaturaCliente: { ...form.assinaturaCliente, nome: e.target.value } })}
            value={form.assinaturaCliente.nome}
          />
          <Input
            label="Data"
            onChange={(e) => setForm({ ...form, assinaturaCliente: { ...form.assinaturaCliente, data: e.target.value } })}
            type="date"
            value={form.assinaturaCliente.data}
          />
        </div>
      </section>

      <SnapshotConflictHint onReload={onReloadAfterConflict} show={snapshotConflict} />
      {error ? <div className="error-box">{error}</div> : null}
      <div className="form-actions">
        <Button onClick={guardedCancel} type="button" variant="ghost">
          Cancelar
        </Button>
        <Button onClick={() => preview()} type="button" variant="ghost">
          Visualizar
        </Button>
        <Button type="submit">Salvar RIR</Button>
      </div>
    </form>
  );
}
