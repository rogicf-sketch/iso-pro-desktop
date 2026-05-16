import { useEffect, useMemo, useState } from 'react';
import { collectAllPages } from '../../../lib/collectAllPages';
import { compressImageFileToJpeg } from '../../../lib/imageCompress';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { OperationalNotice } from '../../../components/ui/OperationalNotice';
import { Select } from '../../../components/ui/Select';
import { SnapshotConflictHint } from '../../../components/ui/SnapshotConflictHint';
import type { ServiceWriteResult } from '../../../types/common.types';
import { colaboradoresElegiveisAssinaturaRir, listarColaboradores } from '../../colaboradores/services/colaboradores.service';
import { buscarRecebimentoPorId } from '../../recebimentos/services/recebimentos.service';
import type { Recebimento } from '../../recebimentos/types/recebimento.types';
import { normalizeRncRegistro, obterSugestaoCodigoRnc } from '../services/qualidade.service';
import type { RncFormData, RncItemLinha, RncRegistro } from '../types/qualidade.types';
import { defaultRncPlanoLinhas } from '../types/qualidade.types';
import { mergeItensRncComRecebimento } from '../utils/rncItensRecebimento';

type Props = {
  initialValue: RncFormData;
  editId?: string;
  recebimentoChoices: Array<{ id: string; label: string; notaFiscal: string }>;
  recebimentosChoicesLoading?: boolean;
  senhaHelp?: string;
  onCancel: () => void;
  onSubmit: (data: RncFormData) => Promise<ServiceWriteResult>;
  onReloadAfterConflict?: () => void | Promise<void>;
  /** Abre visualizacao do relatorio (impressao) antes de gravar. */
  onPreview: (registro: RncRegistro) => void;
};

function linhaPlanoVazia() {
  return { acao: '', responsavel: '', prazo: '' };
}

const CAMPOS_TIPO_OCORRENCIA = [
  ['avariaFisica', 'Avaria fisica / dano'],
  ['quantidadeIncorreta', 'Quantidade incorreta (falta / excesso)'],
  ['materialIncorreto', 'Material incorreto (fora da especificacao)'],
  ['documentacaoFaltante', 'Documentacao / certificado faltante'],
  ['validadeExpirada', 'Prazo de validade expirado ou curto'],
] as const;

const MAX_FOTOS_POR_ITEM = 6;
const MAX_BYTES_FOTO_ORIGINAL = 12 * 1024 * 1024;

function textoBuscaRecebimentoInicial(iv: RncFormData): string {
  if (!iv.recebimentoId?.trim()) return '';
  const nf = iv.recebimentoNotaFiscal ?? '';
  const fo = iv.recebimentoFornecedor ?? '';
  return [nf, fo].filter(Boolean).join(' · ');
}

export function RncForm({
  initialValue,
  editId,
  recebimentoChoices,
  recebimentosChoicesLoading = false,
  senhaHelp = '',
  onCancel,
  onSubmit,
  onReloadAfterConflict,
  onPreview,
}: Props) {
  const [form, setForm] = useState<RncFormData>(initialValue);
  const [error, setError] = useState('');
  const [snapshotConflict, setSnapshotConflict] = useState(false);
  const [colabAssinaturaNomes, setColabAssinaturaNomes] = useState<string[]>([]);
  const [recSearch, setRecSearch] = useState(() => textoBuscaRecebimentoInicial(initialValue));
  const [recOpen, setRecOpen] = useState(false);
  const [recLoading, setRecLoading] = useState(false);
  const [recebimentoCarregado, setRecebimentoCarregado] = useState<Recebimento | null>(null);
  const [carregandoDetalheNf, setCarregandoDetalheNf] = useState(false);

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
      if (res.success && res.data) {
        const dados = res.data;
        setRecebimentoCarregado(dados);
        setForm((f) => ({
          ...f,
          itensRnc: mergeItensRncComRecebimento(dados.itens, f.itensRnc ?? []),
        }));
      } else {
        setRecebimentoCarregado(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [initialValue.recebimentoId]);

  const filtradosRecebimento = useMemo(() => {
    const t = recSearch.trim().toLowerCase();
    if (!t) return recebimentoChoices.slice(0, 40);
    return recebimentoChoices.filter((c) => c.label.toLowerCase().includes(t)).slice(0, 40);
  }, [recebimentoChoices, recSearch]);

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
    setRecebimentoCarregado(rec);
    setForm((f) => ({
      ...f,
      recebimentoId: rec.id,
      recebimentoNotaFiscal: rec.notaFiscal,
      recebimentoRomaneio: rec.romaneio,
      recebimentoData: rec.dataRecebimento,
      recebimentoFornecedor: rec.fornecedor,
      itemRecebimentoId: '',
      materialCodigo: '',
      materialDescricao: '',
      quantidadeRecebidaRef: 0,
      quantidadeRejeitada: f.quantidadeRejeitada,
      itensRnc: mergeItensRncComRecebimento(rec.itens, []),
    }));
    setRecSearch(`${rec.notaFiscal || '—'} · ${rec.fornecedor}`);
    setRecOpen(false);
    setError('');
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
      itemRecebimentoId: '',
      materialCodigo: '',
      materialDescricao: '',
      quantidadeRecebidaRef: 0,
      itensRnc: [],
    }));
    setRecSearch('');
  }

  function patchLinhaRnc(recebimentoItemId: string, patch: Partial<RncItemLinha>) {
    setForm((f) => ({
      ...f,
      itensRnc: (f.itensRnc ?? []).map((row) => (row.recebimentoItemId === recebimentoItemId ? { ...row, ...patch } : row)),
    }));
  }

  async function adicionarFotosItem(recebimentoItemId: string, files: FileList | null) {
    if (!files?.length) return;
    const row = form.itensRnc?.find((x) => x.recebimentoItemId === recebimentoItemId);
    if (!row) return;
    const restantes = MAX_FOTOS_POR_ITEM - row.fotosDataUrls.length;
    if (restantes <= 0) {
      setError(`Limite de ${MAX_FOTOS_POR_ITEM} fotos por item.`);
      return;
    }
    const list = Array.from(files).filter((file) => file.type.startsWith('image/')).slice(0, restantes);
    const novas: string[] = [];
    for (const file of list) {
      if (file.size > MAX_BYTES_FOTO_ORIGINAL) {
        setError('Imagem muito grande (max. ~12 MB por arquivo antes da compressão).');
        return;
      }
      try {
        const out = await compressImageFileToJpeg(file, {
          maxEdgePx: 1440,
          maxBytes: 420 * 1024,
          initialQuality: 0.76,
          minQuality: 0.42,
        });
        if (!out) {
          setError('Formato de imagem nao suportado (ex.: HEIC).');
          return;
        }
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const fr = new FileReader();
          fr.onload = () => resolve(String(fr.result));
          fr.onerror = () => reject(new Error('Leitura'));
          fr.readAsDataURL(out.blob);
        });
        novas.push(dataUrl);
      } catch {
        setError('Nao foi possivel ler uma das imagens.');
        return;
      }
    }
    setError('');
    setForm((f) => ({
      ...f,
      itensRnc: (f.itensRnc ?? []).map((r) =>
        r.recebimentoItemId === recebimentoItemId ? { ...r, fotosDataUrls: [...r.fotosDataUrls, ...novas] } : r,
      ),
    }));
  }

  function removerFotoItem(recebimentoItemId: string, index: number) {
    setForm((f) => ({
      ...f,
      itensRnc: (f.itensRnc ?? []).map((r) =>
        r.recebimentoItemId === recebimentoItemId
          ? { ...r, fotosDataUrls: r.fotosDataUrls.filter((_, i) => i !== index) }
          : r,
      ),
    }));
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setSnapshotConflict(false);
    const result = await onSubmit(form);
    if (!result.success) {
      setError(result.error ?? 'Nao foi possivel salvar a RNC.');
      setSnapshotConflict(result.meta?.snapshotConflict === true);
    }
  }

  async function sugerirNumero() {
    setError('');
    const s = await obterSugestaoCodigoRnc(form, editId);
    setForm((f) => ({ ...f, codigo: s }));
  }

  function visualizarRelatorio() {
    setError('');
    const reg = normalizeRncRegistro({
      ...(form as unknown as Omit<RncRegistro, 'id' | 'status'>),
      id: editId ?? 'preview-rnc',
      status: form.status ?? 'aberto',
    });
    onPreview(reg);
  }

  const isCriticalStatus = form.status === 'aberto' || form.status === 'cancelado';
  const linhasPlano = form.planoAcaoLinhas?.length ? form.planoAcaoLinhas : defaultRncPlanoLinhas();

  function setLinhaPlano(index: number, patch: Partial<(typeof linhasPlano)[0]>) {
    const next = [...linhasPlano];
    next[index] = { ...next[index], ...patch };
    setForm({ ...form, planoAcaoLinhas: next });
  }

  function addLinhaPlano() {
    setForm({ ...form, planoAcaoLinhas: [...linhasPlano, linhaPlanoVazia()] });
  }

  return (
    <form className="form-grid rir-form-professional" onSubmit={handleSubmit}>
      <OperationalNotice tone="warning">
        Relatorio de Nao Conformidade no recebimento de materiais: vincule a <strong>NF do modulo Recebimentos</strong>, descreva o desvio com evidencias e plano
        de acao. Numero no formato <strong>AAAA-NNN</strong> (ex.: 2026-001); deixe em branco para gerar ao salvar.
      </OperationalNotice>
      {senhaHelp ? (
        <OperationalNotice>
          Campo protegido: a senha preferencial deve ser usada apenas quando a politica administrativa exigir validacao reforcada.
        </OperationalNotice>
      ) : null}
      {isCriticalStatus ? (
        <OperationalNotice tone={form.status === 'cancelado' ? 'critical' : 'warning'}>
          {form.status === 'cancelado'
            ? 'RNC cancelada: confirme se o cancelamento possui justificativa administrativa antes de salvar.'
            : 'RNC em aberto: mantenha segregacao, evidencias e plano de acao ate o encerramento formal.'}
        </OperationalNotice>
      ) : null}

      <section className="rir-card">
        <h4 className="rir-card-title">Recebimento (origem da RNC)</h4>
        <p className="panel-copy" style={{ marginBottom: 10 }}>
          Pesquisa inteligente: digite NF, fornecedor ou data e escolha o recebimento — os dados da nota preenchem a identificacao geral.
        </p>
        <div className="rir-rec-wrap">
          <Input
            disabled={recebimentosChoicesLoading || recLoading}
            label="Buscar recebimento"
            onChange={(e) => {
              setRecSearch(e.target.value);
              setRecOpen(true);
            }}
            onFocus={() => setRecOpen(true)}
            placeholder="Ex.: numero da NF ou fornecedor"
            value={recSearch}
          />
          {recOpen && filtradosRecebimento.length > 0 ? (
            <div className="rir-rec-dropdown" role="listbox">
              {filtradosRecebimento.map((c) => (
                <button
                  className="rir-rec-option"
                  key={c.id}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => void aplicarRecebimento(c.id)}
                  type="button"
                >
                  {c.label}
                </button>
              ))}
            </div>
          ) : null}
        </div>
        {form.recebimentoId && carregandoDetalheNf ? <p className="panel-copy">Carregando recebimento...</p> : null}
        {form.recebimentoId && !carregandoDetalheNf && !recebimentoCarregado ? (
          <OperationalNotice tone="warning">
            Nao foi possivel carregar o recebimento. Verifique o cadastro ou troque o vinculo.
          </OperationalNotice>
        ) : null}
        {form.recebimentoId && recebimentoCarregado ? (
          <>
            <div className="rir-nf-vinculo-compact">
              <p className="rir-nf-vinculo-line">
                <strong>{recebimentoCarregado.notaFiscal || '—'}</strong>
                <span className="rir-nf-vinculo-sep"> · </span>
                <span>{recebimentoCarregado.fornecedor}</span>
                <span className="rir-nf-vinculo-sep"> · </span>
                <span>Rom. {recebimentoCarregado.romaneio || '—'}</span>
                <span className="rir-nf-vinculo-sep"> · </span>
                <span>{recebimentoCarregado.dataRecebimento || '—'}</span>
              </p>
              <div className="rir-nf-vinculo-actions">
                <Button onClick={trocarRecebimento} type="button" variant="ghost">
                  Trocar recebimento
                </Button>
              </div>
            </div>

            {recebimentoCarregado.itens.length > 0 ? (
              <div className="rnc-itens-recebimento">
                <h4 className="rir-card-title">Itens da nota fiscal (modelo recebimento)</h4>
                <p className="panel-copy" style={{ marginBottom: 12 }}>
                  Cada cartao espelha a linha do recebimento. Marque <strong>Incluir nao conformidade nesta linha</strong> apenas nos itens com problema —
                  cada um pode ter tipo de ocorrencia, descricao e fotos diferentes.
                </p>
                <div className="editor-list">
                  {(form.itensRnc ?? []).map((it, idx) => (
                    <div
                      className={`editor-item rnc-item-card${it.incluir ? ' rnc-item-card--ativo' : ''}`}
                      key={it.recebimentoItemId || idx}
                    >
                      <div className="editor-header rnc-item-card__header">
                        <strong>Item {idx + 1}</strong>
                        <label className="rnc-item-card__toggle panel-copy">
                          <input
                            checked={it.incluir}
                            onChange={(e) => patchLinhaRnc(it.recebimentoItemId, { incluir: e.target.checked })}
                            type="checkbox"
                          />
                          Incluir nao conformidade nesta linha
                        </label>
                      </div>
                      <div className="form-columns">
                        <Input disabled label="Codigo" onChange={() => {}} value={it.codigoMaterial} />
                        <Input disabled label="Descricao" onChange={() => {}} value={it.descricaoMaterial} />
                        <Input disabled label="Unidade" onChange={() => {}} value={it.unidade} />
                      </div>
                      <div className="form-columns">
                        <Input disabled label="Disciplina" onChange={() => {}} value={it.disciplina} />
                        <Input disabled label="Localizacao" onChange={() => {}} value={it.localizacao} />
                        <Input disabled label="Qtd. recebida" onChange={() => {}} type="number" value={String(it.quantidadeRecebida)} />
                        <Input disabled label="Qtd. conferida" onChange={() => {}} type="number" value={String(it.quantidadeConferida)} />
                        <Input disabled label="Peso unitario (kg)" onChange={() => {}} type="number" value={String(it.pesoUnitario ?? 0)} />
                        <Input disabled label="Peso total (kg)" onChange={() => {}} type="number" value={String(it.pesoTotal ?? 0)} />
                        <Input disabled label="Certificado" onChange={() => {}} value={it.certificado} />
                      </div>
                      {it.incluir ? (
                        <div className="rnc-item-ocorrencia">
                          <p className="panel-copy rnc-item-ocorrencia__title">Ocorrencia neste item</p>
                          <p className="panel-copy">Tipo de ocorrencia (pode marcar mais de uma):</p>
                          <div className="rnc-check-grid">
                            {CAMPOS_TIPO_OCORRENCIA.map(([key, label]) => (
                              <label className="panel-copy rnc-check" key={key}>
                                <input
                                  checked={!!it.tiposOcorrencia[key]}
                                  onChange={(e) =>
                                    patchLinhaRnc(it.recebimentoItemId, {
                                      tiposOcorrencia: { ...it.tiposOcorrencia, [key]: e.target.checked },
                                    })
                                  }
                                  type="checkbox"
                                />
                                {label}
                              </label>
                            ))}
                            <label className="panel-copy rnc-check rnc-check--full">
                              <input
                                checked={it.tiposOcorrencia.outro}
                                onChange={(e) =>
                                  patchLinhaRnc(it.recebimentoItemId, {
                                    tiposOcorrencia: { ...it.tiposOcorrencia, outro: e.target.checked },
                                  })
                                }
                                type="checkbox"
                              />
                              Outro
                              <input
                                className="input-control"
                                disabled={!it.tiposOcorrencia.outro}
                                onChange={(e) =>
                                  patchLinhaRnc(it.recebimentoItemId, {
                                    tiposOcorrencia: { ...it.tiposOcorrencia, outroTexto: e.target.value },
                                  })
                                }
                                placeholder="Descreva"
                                style={{ flex: 1, minWidth: 120 }}
                                value={it.tiposOcorrencia.outroTexto}
                              />
                            </label>
                          </div>
                          <Input
                            label="Quantidade rejeitada (nesta linha)"
                            min={0}
                            onChange={(e) =>
                              patchLinhaRnc(it.recebimentoItemId, { quantidadeRejeitada: Number(e.target.value) || 0 })
                            }
                            type="number"
                            value={it.quantidadeRejeitada}
                          />
                          <label className="field">
                            <span>Descricao detalhada do desvio (o que, onde, quando, como)</span>
                            <textarea
                              className="input-control text-area"
                              onChange={(e) => patchLinhaRnc(it.recebimentoItemId, { descricaoDetalhada: e.target.value })}
                              rows={4}
                              value={it.descricaoDetalhada}
                            />
                          </label>
                          <label className="field">
                            <span>Fotos da ocorrencia (ate {MAX_FOTOS_POR_ITEM} imagens)</span>
                            <input
                              accept="image/*"
                              className="input-control"
                              multiple
                              onChange={(e) => void adicionarFotosItem(it.recebimentoItemId, e.target.files)}
                              type="file"
                            />
                          </label>
                          {it.fotosDataUrls.length > 0 ? (
                            <div className="rnc-foto-previews">
                              {it.fotosDataUrls.map((url, fi) => (
                                <div className="rnc-foto-preview" key={fi}>
                                  <img alt="" src={url} />
                                  <Button onClick={() => removerFotoItem(it.recebimentoItemId, fi)} type="button" variant="ghost">
                                    Remover
                                  </Button>
                                </div>
                              ))}
                            </div>
                          ) : null}
                          <label className="panel-copy rnc-check" style={{ marginTop: 8 }}>
                            <input
                              checked={it.fotosDeclaradasSemArquivo}
                              onChange={(e) => patchLinhaRnc(it.recebimentoItemId, { fotosDeclaradasSemArquivo: e.target.checked })}
                              type="checkbox"
                            />
                            Evidencia fotografica registrada fora do sistema (pasta, e-mail, etc.)
                          </label>
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <OperationalNotice tone="warning">
                Este recebimento nao possui itens na lista. Cadastre as linhas no modulo Recebimentos ou preencha material manualmente na secao seguinte.
              </OperationalNotice>
            )}
          </>
        ) : null}
        {form.recebimentoId && !recebimentoCarregado && !carregandoDetalheNf ? (
          <Button onClick={trocarRecebimento} type="button" variant="ghost">
            Trocar recebimento
          </Button>
        ) : null}
      </section>

      <section className="rir-card">
        <h4 className="rir-card-title">1. Identificacao geral</h4>
        <div className="form-columns">
          <label className="field">
            <span>RNC Nº</span>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <input
                className="input-control"
                onChange={(e) => setForm({ ...form, codigo: e.target.value })}
                placeholder="Ex.: 2026-001 (vazio = automatico)"
                value={form.codigo}
              />
              <Button onClick={() => void sugerirNumero()} type="button" variant="ghost">
                Sugerir numero
              </Button>
            </div>
          </label>
          <Input
            label="Data de abertura"
            onChange={(e) => setForm({ ...form, dataRegistro: e.target.value })}
            type="date"
            value={form.dataRegistro}
          />
        </div>
        <div className="form-columns">
          <Input
            label="Fornecedor (da NF)"
            onChange={(e) => setForm({ ...form, recebimentoFornecedor: e.target.value })}
            value={form.recebimentoFornecedor ?? ''}
          />
          <Input
            label="NF / Fatura"
            onChange={(e) => setForm({ ...form, recebimentoNotaFiscal: e.target.value })}
            value={form.recebimentoNotaFiscal ?? ''}
          />
        </div>
        <div className="form-columns">
          <Input label="Pedido de compra" onChange={(e) => setForm({ ...form, pedidoCompra: e.target.value })} value={form.pedidoCompra} />
          <Input label="Setor / area" onChange={(e) => setForm({ ...form, setor: e.target.value })} value={form.setor} />
        </div>
        {!form.recebimentoId?.trim() ? (
          <p className="panel-copy">Apos vincular o recebimento, os itens da NF aparecem em cartoes para registrar a ocorrencia em cada linha.</p>
        ) : (form.itensRnc ?? []).length === 0 ? (
          <>
            <OperationalNotice tone="warning">
              Este recebimento nao tem linhas na lista. Preencha material e quantidades manualmente abaixo ou cadastre itens no modulo Recebimentos.
            </OperationalNotice>
            <div className="form-columns">
              <Input label="Codigo material" onChange={(e) => setForm({ ...form, materialCodigo: e.target.value })} value={form.materialCodigo} />
              <Input
                label="Descricao material"
                onChange={(e) => setForm({ ...form, materialDescricao: e.target.value })}
                value={form.materialDescricao}
              />
            </div>
            <div className="form-columns">
              <Input
                label="Quantidade recebida (referencia)"
                min={0}
                onChange={(e) => setForm({ ...form, quantidadeRecebidaRef: Number(e.target.value) || 0 })}
                type="number"
                value={form.quantidadeRecebidaRef}
              />
              <Input
                label="Quantidade rejeitada"
                min={0}
                onChange={(e) => setForm({ ...form, quantidadeRejeitada: Number(e.target.value) || 0 })}
                type="number"
                value={form.quantidadeRejeitada}
              />
            </div>
          </>
        ) : (
          <p className="panel-copy">
            Dados do material e da ocorrencia estao nos <strong>cartoes dos itens</strong> na secao Recebimento. A primeira linha incluida alimenta o resumo do
            cabecalho ao salvar.
          </p>
        )}
        <fieldset className="field" style={{ border: 'none', padding: 0, margin: 0 }}>
          <legend className="panel-copy" style={{ marginBottom: 8 }}>
            Local de armazenagem / segregacao
          </legend>
          <div className="form-columns" style={{ alignItems: 'center' }}>
            <label className="panel-copy" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                checked={form.localArmazenagem === 'almoxarifado'}
                name="rnc-local"
                onChange={() => setForm({ ...form, localArmazenagem: 'almoxarifado' })}
                type="radio"
              />
              Almoxarifado
            </label>
            <label className="panel-copy" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                checked={form.localArmazenagem === 'quarentena'}
                name="rnc-local"
                onChange={() => setForm({ ...form, localArmazenagem: 'quarentena' })}
                type="radio"
              />
              Area de quarentena
            </label>
            <label className="panel-copy" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                checked={form.localArmazenagem === 'outro'}
                name="rnc-local"
                onChange={() => setForm({ ...form, localArmazenagem: 'outro' })}
                type="radio"
              />
              Outro
            </label>
            <label className="panel-copy" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                checked={form.localArmazenagem === ''}
                name="rnc-local"
                onChange={() => setForm({ ...form, localArmazenagem: '' })}
                type="radio"
              />
              Nao informado
            </label>
          </div>
          {form.localArmazenagem === 'outro' ? (
            <Input
              label="Especificar local"
              onChange={(e) => setForm({ ...form, localArmazenagemOutro: e.target.value })}
              value={form.localArmazenagemOutro}
            />
          ) : null}
        </fieldset>
        <Input label="Responsavel pela RNC" onChange={(e) => setForm({ ...form, responsavel: e.target.value })} value={form.responsavel} />
      </section>

      {(form.itensRnc ?? []).length === 0 && !!form.recebimentoId?.trim() ? (
        <section className="rir-card">
          <h4 className="rir-card-title">2. Descricao da nao conformidade (sem itens na NF)</h4>
          <p className="panel-copy">Use quando o recebimento nao tiver linhas cadastradas. Caso contrario, preencha a ocorrencia em cada cartao acima.</p>
          <p className="panel-copy">Tipo de ocorrencia (pode marcar mais de uma):</p>
          <div className="rnc-check-grid">
            {CAMPOS_TIPO_OCORRENCIA.map(([key, label]) => (
              <label className="panel-copy rnc-check" key={key}>
                <input
                  checked={!!form.tiposOcorrencia[key]}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      tiposOcorrencia: { ...form.tiposOcorrencia, [key]: e.target.checked },
                    })
                  }
                  type="checkbox"
                />
                {label}
              </label>
            ))}
            <label className="panel-copy rnc-check rnc-check--full">
              <input
                checked={form.tiposOcorrencia.outro}
                onChange={(e) =>
                  setForm({
                    ...form,
                    tiposOcorrencia: { ...form.tiposOcorrencia, outro: e.target.checked },
                  })
                }
                type="checkbox"
              />
              Outro
              <input
                className="input-control"
                disabled={!form.tiposOcorrencia.outro}
                onChange={(e) =>
                  setForm({
                    ...form,
                    tiposOcorrencia: { ...form.tiposOcorrencia, outroTexto: e.target.value },
                  })
                }
                placeholder="Descreva"
                style={{ flex: 1, minWidth: 120 }}
                value={form.tiposOcorrencia.outroTexto}
              />
            </label>
          </div>
          <label className="field">
            <span>Descricao detalhada do desvio (o que, onde, quando, como)</span>
            <textarea
              className="input-control text-area"
              onChange={(e) => setForm({ ...form, descricaoDetalhada: e.target.value, descricao: e.target.value.slice(0, 280) })}
              rows={5}
              value={form.descricaoDetalhada}
            />
          </label>
        </section>
      ) : null}

      <section className="rir-card">
        <h4 className="rir-card-title">3. Evidencias objetivas</h4>
        <div className="rnc-check-grid">
          <label className="panel-copy rnc-check">
            <input
              checked={form.evidencias.fotosAnexadas}
              onChange={(e) => setForm({ ...form, evidencias: { ...form.evidencias, fotosAnexadas: e.target.checked } })}
              type="checkbox"
            />
            {(form.itensRnc ?? []).length > 0
              ? 'Fotos por item nos cartoes (ou declaracao por linha) — marque aqui se houver anexo extra geral'
              : 'Fotos anexadas (obrigatorio para concluir a RNC sem itens na lista)'}
          </label>
          <label className="panel-copy rnc-check">
            <input
              checked={form.evidencias.copiaPedido}
              onChange={(e) => setForm({ ...form, evidencias: { ...form.evidencias, copiaPedido: e.target.checked } })}
              type="checkbox"
            />
            Copia do pedido / especificacao tecnica
          </label>
          <label className="panel-copy rnc-check">
            <input
              checked={form.evidencias.copiaNf}
              onChange={(e) => setForm({ ...form, evidencias: { ...form.evidencias, copiaNf: e.target.checked } })}
              type="checkbox"
            />
            Copia da nota fiscal
          </label>
          <label className="panel-copy rnc-check">
            <input
              checked={form.evidencias.laudoConferencia}
              onChange={(e) => setForm({ ...form, evidencias: { ...form.evidencias, laudoConferencia: e.target.checked } })}
              type="checkbox"
            />
            Laudo tecnico de conferencia
          </label>
        </div>
        <label className="field">
          <span>Observacoes sobre evidencias / referencia de arquivos</span>
          <textarea
            className="input-control text-area"
            onChange={(e) => setForm({ ...form, evidenciasObservacao: e.target.value })}
            rows={2}
            value={form.evidenciasObservacao}
          />
        </label>
      </section>

      <section className="rir-card">
        <h4 className="rir-card-title">4. Acao imediata (segregacao)</h4>
        <div className="form-columns" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
          {(
            [
              ['devolvido_transportador', 'Material devolvido ao transportador'],
              ['quarentena_bloqueado', 'Material segregado em quarentena (etiqueta BLOQUEADO)'],
              ['parcial_item_defeito', 'Recebimento parcial (rejeitado apenas o item com defeito)'],
            ] as const
          ).map(([val, label]) => (
            <label className="panel-copy" key={val} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                checked={form.acaoImediataTipo === val}
                name="rnc-acao"
                onChange={() => setForm({ ...form, acaoImediataTipo: val })}
                type="radio"
              />
              {label}
            </label>
          ))}
          <label className="panel-copy" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              checked={form.acaoImediataTipo === ''}
              name="rnc-acao"
              onChange={() => setForm({ ...form, acaoImediataTipo: '' })}
              type="radio"
            />
            Nao se aplica / a definir
          </label>
        </div>
        <label className="field">
          <span>Observacoes da acao imediata</span>
          <textarea
            className="input-control text-area"
            onChange={(e) => setForm({ ...form, acaoImediataObservacoes: e.target.value })}
            rows={2}
            value={form.acaoImediataObservacoes}
          />
        </label>
      </section>

      <section className="rir-card">
        <h4 className="rir-card-title">5. Analise da causa raiz</h4>
        <p className="panel-copy">A ser preenchido pelo fornecedor ou GQ (5 porques, Ishikawa, etc.).</p>
        <label className="field">
          <span>Causa raiz</span>
          <textarea
            className="input-control text-area"
            onChange={(e) => setForm({ ...form, analiseCausaRaiz: e.target.value })}
            rows={4}
            value={form.analiseCausaRaiz}
          />
        </label>
      </section>

      <section className="rir-card">
        <h4 className="rir-card-title">6. Plano de acao (corretiva / preventiva)</h4>
        <div className="table-wrap" style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Acao (o que fazer)</th>
                <th>Responsavel</th>
                <th>Prazo</th>
              </tr>
            </thead>
            <tbody>
              {linhasPlano.map((row, index) => (
                <tr key={index}>
                  <td>
                    <input
                      className="input-control"
                      onChange={(e) => setLinhaPlano(index, { acao: e.target.value })}
                      value={row.acao}
                    />
                  </td>
                  <td>
                    <input
                      className="input-control"
                      onChange={(e) => setLinhaPlano(index, { responsavel: e.target.value })}
                      value={row.responsavel}
                    />
                  </td>
                  <td>
                    <input
                      className="input-control"
                      onChange={(e) => setLinhaPlano(index, { prazo: e.target.value })}
                      placeholder="AAAA-MM-DD"
                      type="text"
                      value={row.prazo}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Button onClick={addLinhaPlano} type="button" variant="ghost">
          Adicionar linha
        </Button>
      </section>

      <section className="rir-card">
        <h4 className="rir-card-title">7. Encerramento e status do registro</h4>
        <p className="panel-copy" style={{ marginBottom: 12 }}>
          <strong>Setor de materiais e Qualidade:</strong> use a pesquisa inteligente (lista de colaboradores ativos em Colaboradores).{' '}
          <strong>Ciencia da contraparte:</strong> digite livremente (ex.: Cliente, fornecedor ou terceiro — sem lista interna).
        </p>
        <datalist id="rnc-assinatura-colaboradores">
          {colabAssinaturaNomes.map((n) => (
            <option key={n} value={n} />
          ))}
        </datalist>
        <div className="form-columns">
          <Select
            label="Parecer de encerramento"
            onChange={(e) => setForm({ ...form, encerramentoParecer: e.target.value as RncFormData['encerramentoParecer'] })}
            value={form.encerramentoParecer || ''}
          >
            <option value="">Selecione ao concluir</option>
            <option value="aceito_desvio">Aceito (com desvio)</option>
            <option value="rejeitado">Rejeitado</option>
            <option value="reclassificado">Reclassificado</option>
          </Select>
          <Select
            label="Status do registro"
            onChange={(event) => setForm({ ...form, status: event.target.value as RncFormData['status'] })}
            value={form.status ?? 'aberto'}
          >
            <option value="aberto">Aberto</option>
            <option value="em_tratativa">Em tratativa</option>
            <option value="concluido">Fechado (concluido)</option>
            <option value="cancelado">Cancelado</option>
          </Select>
        </div>
        <div className="form-columns">
          <Input
            autoComplete="off"
            label="Assinatura — responsavel setor de materiais"
            list="rnc-assinatura-colaboradores"
            onChange={(e) =>
              setForm({
                ...form,
                assinaturaResponsavelRnc: { ...form.assinaturaResponsavelRnc, nome: e.target.value },
              })
            }
            title="Pesquisa inteligente: digite para filtrar colaboradores ativos (exceto funcao Cliente na lista interna)"
            value={form.assinaturaResponsavelRnc.nome}
          />
          <Input
            label="Data"
            onChange={(e) =>
              setForm({
                ...form,
                assinaturaResponsavelRnc: { ...form.assinaturaResponsavelRnc, data: e.target.value },
              })
            }
            type="date"
            value={form.assinaturaResponsavelRnc.data}
          />
        </div>
        <div className="form-columns">
          <Input
            autoComplete="off"
            label="Assinatura — qualidade"
            list="rnc-assinatura-colaboradores"
            onChange={(e) =>
              setForm({
                ...form,
                assinaturaQualidade: { ...form.assinaturaQualidade, nome: e.target.value },
              })
            }
            title="Pesquisa inteligente: digite para filtrar colaboradores ativos (exceto funcao Cliente na lista interna)"
            value={form.assinaturaQualidade.nome}
          />
          <Input
            label="Data"
            onChange={(e) =>
              setForm({
                ...form,
                assinaturaQualidade: { ...form.assinaturaQualidade, data: e.target.value },
              })
            }
            type="date"
            value={form.assinaturaQualidade.data}
          />
        </div>
        <div className="form-columns">
          <Input
            autoComplete="off"
            label="Ciencia da contraparte"
            onChange={(e) =>
              setForm({
                ...form,
                assinaturaFornecedor: { ...form.assinaturaFornecedor, nome: e.target.value },
              })
            }
            placeholder="Ex.: Cliente"
            title="Digite o nome da contraparte (sem lista de colaboradores internos)"
            value={form.assinaturaFornecedor.nome}
          />
          <Input
            label="Data (ciencia)"
            onChange={(e) =>
              setForm({
                ...form,
                assinaturaFornecedor: { ...form.assinaturaFornecedor, data: e.target.value },
              })
            }
            type="date"
            value={form.assinaturaFornecedor.data}
          />
        </div>
      </section>

      {senhaHelp ? (
        <label className="field">
          <span>Senha preferencial RNC</span>
          <input
            className="input-control"
            onChange={(event) => setForm({ ...form, senhaPreferencial: event.target.value })}
            type="password"
            value={form.senhaPreferencial ?? ''}
          />
          <small className="panel-copy">{senhaHelp}</small>
        </label>
      ) : null}

      <label className="field">
        <span>Observacoes gerais / administrativo</span>
        <textarea
          className="input-control text-area"
          onChange={(event) => setForm({ ...form, observacoes: event.target.value })}
          rows={2}
          value={form.observacoes}
        />
      </label>

      <OperationalNotice>
        Boas praticas: abrir a RNC na conferencia fisica; segregar com etiqueta visivel; notificar compras e registrar no ERP; na causa raiz, ir alem da troca do
        material.
      </OperationalNotice>

      <SnapshotConflictHint show={snapshotConflict} onReload={onReloadAfterConflict} />
      {error ? <div className="error-box">{error}</div> : null}
      <div className="form-actions">
        <Button onClick={onCancel} variant="ghost">
          Cancelar
        </Button>
        <Button onClick={visualizarRelatorio} type="button" variant="ghost">
          Visualizar
        </Button>
        <Button type="submit">Salvar RNC</Button>
      </div>
    </form>
  );
}
