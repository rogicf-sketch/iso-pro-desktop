import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AutocompleteField } from '../../../components/ui/AutocompleteField';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { Modal } from '../../../components/ui/Modal';
import { OperationalNotice } from '../../../components/ui/OperationalNotice';
import { Select } from '../../../components/ui/Select';
import { SnapshotConflictHint } from '../../../components/ui/SnapshotConflictHint';
import type { ServiceWriteResult } from '../../../types/common.types';
import { RecebimentoItensEditor } from './RecebimentoItensEditor';
import { listarColaboradores } from '../../colaboradores/services/colaboradores.service';
import { listarFornecedores } from '../../fornecedores/services/fornecedores.service';
import { enriquecerItensRecebimentoComPesoCadastroMateriais } from '../services/recebimentos.service';
import {
  mergeItensRecebimentoComImportacao,
  parseItensRecebimentoCsv,
  previewItensRecebimentoCsv,
  validarItensRecebimentoCsvContraCadastroMateriais,
} from '../services/recebimentos.import.csv';
import type { RecebimentoFormData } from '../types/recebimento.types';

type Props = {
  initialValue: RecebimentoFormData;
  onCancel: () => void;
  onSubmit: (data: RecebimentoFormData) => Promise<ServiceWriteResult>;
  onReloadAfterConflict?: () => void | Promise<void>;
  /** Importar itens por CSV apenas ao criar recebimento (nao na edicao). */
  allowImportItens?: boolean;
  /** Exibe cabecalho e itens sem permitir edicao (ex.: recebimento ja conferido). */
  readOnly?: boolean;
  /**
   * Na visualizacao, permite abrir edicao apenas da lista de itens (nota fiscal / materiais),
   * com cabecalho travado. So aplicavel quando o recebimento esta aguardando conferencia no servidor.
   */
  podeCorrigirItensNaVisualizacao?: boolean;
};

export function RecebimentoForm({
  initialValue,
  onCancel,
  onSubmit,
  onReloadAfterConflict,
  allowImportItens = false,
  readOnly = false,
  podeCorrigirItensNaVisualizacao = false,
}: Props) {
  const [form, setForm] = useState<RecebimentoFormData>(initialValue);
  const [editandoItensNf, setEditandoItensNf] = useState(false);
  const [error, setError] = useState('');
  const [snapshotConflict, setSnapshotConflict] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [importStaging, setImportStaging] = useState<{
    fileName: string;
    text: string;
    linhaCount: number;
  } | null>(null);
  const [importItensMerging, setImportItensMerging] = useState(false);
  const [importItensResultado, setImportItensResultado] = useState<{ linhaCount: number } | null>(null);
  const importItensInputRef = useRef<HTMLInputElement>(null);
  const errorBoxRef = useRef<HTMLDivElement>(null);
  const requiresConferencia = form.modoRecebimento === 'aguardando_conferencia';
  const itensEditaveis = !readOnly || (readOnly && podeCorrigirItensNaVisualizacao && editandoItensNf);
  const mostrarBlocoImportItens =
    (!readOnly && allowImportItens) || (readOnly && podeCorrigirItensNaVisualizacao && editandoItensNf);

  if (!podeCorrigirItensNaVisualizacao && editandoItensNf) {
    setEditandoItensNf(false);
  }

  const temDivergenciaConferenciaVsRecebido = useMemo(
    () =>
      form.modoRecebimento !== 'direto' &&
      form.itens.some(
        (i) => Number(i.quantidadeRecebida) > 0 && Number(i.quantidadeConferida) < Number(i.quantidadeRecebida),
      ),
    [form.itens, form.modoRecebimento],
  );

  const fetchFornecedorOptions = useCallback(async (query: string) => {
    const result = await listarFornecedores({
      busca: query,
      status: 'ativos',
      page: 1,
      pageSize: 50,
    });
    if (!result.success || !result.data) return [];
    return result.data.items.map((f) => f.nome);
  }, []);

  useEffect(() => {
    if (!error) return;
    errorBoxRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [error]);

  const fetchConferenteOptions = useCallback(async (query: string) => {
    const result = await listarColaboradores({
      busca: query,
      tipo: 'todos',
      status: 'ativos',
      page: 1,
      pageSize: 50,
    });
    if (!result.success || !result.data) return [];
    return result.data.items.map((c) => c.nome);
  }, []);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (readOnly) return;
    setError('');
    setSnapshotConflict(false);
    setIsSaving(true);
    const result = await onSubmit(form);

    if (!result.success) {
      setError(result.error ?? 'Nao foi possivel salvar o recebimento.');
      setSnapshotConflict(result.meta?.snapshotConflict === true);
    }

    setIsSaving(false);
  }

  async function handleSalvarSomenteItensNf() {
    setError('');
    setSnapshotConflict(false);
    setIsSaving(true);
    const result = await onSubmit(form);
    if (!result.success) {
      setError(result.error ?? 'Nao foi possivel salvar os itens.');
      setSnapshotConflict(result.meta?.snapshotConflict === true);
    } else {
      setEditandoItensNf(false);
    }
    setIsSaving(false);
  }

  function cancelarEdicaoItensNf() {
    setEditandoItensNf(false);
    setForm((current) => ({
      ...current,
      itens: initialValue.itens.map((i) => ({ ...i })),
    }));
  }

  function cabecalhoProntoParaImportItens() {
    return (
      Boolean(form.fornecedor.trim()) &&
      Boolean(form.dataRecebimento.trim()) &&
      Boolean(form.notaFiscal.trim() || form.romaneio.trim())
    );
  }

  async function stageImportItensFromFile(file: File | null) {
    if (!file) return;
    setError('');
    setImportItensResultado(null);

    if (!cabecalhoProntoParaImportItens()) {
      setError(
        'Preencha fornecedor, data e nota fiscal ou romaneio antes de importar os itens.',
      );
      return;
    }

    const lower = file.name.toLowerCase();
    if (!lower.endsWith('.csv') && file.type !== 'text/csv' && !lower.endsWith('.txt')) {
      setError('Selecione um arquivo CSV.');
      return;
    }

    let text: string;
    try {
      text = await file.text();
    } catch {
      setError('Nao foi possivel ler o arquivo selecionado.');
      return;
    }

    const preview = await previewItensRecebimentoCsv(text);
    if (!preview.ok) {
      setError(preview.error);
      return;
    }

    setImportStaging({ fileName: file.name, text, linhaCount: preview.linhaCount });
  }

  function cancelImportItensStaging() {
    if (importItensMerging) return;
    setImportStaging(null);
  }

  function closeImportItensResultado() {
    setImportItensResultado(null);
  }

  async function confirmImportItensStaging() {
    if (!importStaging) return;
    setImportItensMerging(true);
    const text = importStaging.text;
    const linhaCount = importStaging.linhaCount;

    const parsed = parseItensRecebimentoCsv(text);

    if (!parsed.ok) {
      setImportItensMerging(false);
      setImportStaging(null);
      setError(parsed.error);
      return;
    }

    const materialCheck = await validarItensRecebimentoCsvContraCadastroMateriais(parsed.itens);
    if (materialCheck) {
      setImportItensMerging(false);
      setImportStaging(null);
      setError(materialCheck);
      return;
    }

    if (parsed.itens.length === 0) {
      setImportItensMerging(false);
      setImportStaging(null);
      setError('Nenhum item valido encontrado no arquivo.');
      return;
    }

    setForm((current) => {
      const merged = mergeItensRecebimentoComImportacao(current.itens, parsed.itens);
      void enriquecerItensRecebimentoComPesoCadastroMateriais(merged)
        .then((itens) => {
          setForm((c) => ({ ...c, itens }));
        })
        .finally(() => {
          setImportItensMerging(false);
          setImportItensResultado({ linhaCount });
        });
      return { ...current, itens: merged };
    });
    setImportStaging(null);
  }

  return (
    <form className="form-grid rir-form-professional" onSubmit={handleSubmit}>
      {readOnly && podeCorrigirItensNaVisualizacao && editandoItensNf ? (
        <OperationalNotice tone="warning">
          Edicao dos <strong>itens da nota fiscal</strong> ativa: cabecalho (NF, fornecedor, romaneio, modo, conferente e observacoes gerais)
          permanece bloqueado. Grave com <strong>Salvar alteracoes nos itens</strong> ou cancele para descartar.
        </OperationalNotice>
      ) : null}
      {readOnly && !(podeCorrigirItensNaVisualizacao && editandoItensNf) ? (
        <OperationalNotice>
          Visualizacao somente leitura: nota fiscal, fornecedor, romaneio e lista de materiais abaixo.
          {podeCorrigirItensNaVisualizacao ? (
            <>
              {' '}
              Use <strong>Editar itens da nota fiscal</strong> para corrigir codigos, quantidades, quantidades conferidas, localizacao,
              observacao por linha ou importar CSV sem alterar o cabecalho.
            </>
          ) : null}
        </OperationalNotice>
      ) : null}
      {!readOnly ? (
        <>
          <OperationalNotice tone="warning">
            Regra operacional: todo recebimento deve possuir rastreabilidade minima por nota fiscal ou romaneio antes da confirmacao.
          </OperationalNotice>
          {requiresConferencia ? (
            <OperationalNotice tone="critical">
              Fluxo sensivel: modo aguardando conferencia exige conferente definido e validacao posterior antes da liberacao definitiva em
              estoque.
            </OperationalNotice>
          ) : (
            <OperationalNotice>
              Fluxo direto: utilize apenas quando a entrada puder ser liberada sem etapa adicional de conferencia.
            </OperationalNotice>
          )}
        </>
      ) : null}

      <section className="rir-card">
        <h4 className="rir-card-title">Dados do recebimento</h4>
        <div className="form-columns">
          <Input
            disabled={readOnly}
            label="Nota fiscal"
            onChange={(event) => setForm((current) => ({ ...current, notaFiscal: event.target.value }))}
            value={form.notaFiscal}
          />
          <Input
            disabled={readOnly}
            label="Data"
            onChange={(event) => setForm((current) => ({ ...current, dataRecebimento: event.target.value }))}
            type="date"
            value={form.dataRecebimento}
          />
          <Select
            disabled={readOnly}
            label="Modo"
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                modoRecebimento: event.target.value as RecebimentoFormData['modoRecebimento'],
              }))
            }
            value={form.modoRecebimento}
          >
            <option value="direto">Direto</option>
            <option value="aguardando_conferencia">Aguardando conferencia</option>
          </Select>
        </div>

        <div className="form-columns">
          <AutocompleteField
            disabled={readOnly}
            emptySuggestionsMessage="Nenhum fornecedor ativo encontrado com esse texto. O nome ao gravar deve existir no modulo Fornecedores (cadastro ativo), com a mesma grafia."
            fetchOptions={fetchFornecedorOptions}
            label="Fornecedor"
            onChange={(fornecedor) => setForm((current) => ({ ...current, fornecedor }))}
            placeholder="Digite para buscar no cadastro"
            value={form.fornecedor}
          />
          <Input
            disabled={readOnly}
            label="Romaneio"
            onChange={(event) => setForm((current) => ({ ...current, romaneio: event.target.value }))}
            value={form.romaneio}
          />
          <AutocompleteField
            disabled={readOnly}
            fetchOptions={fetchConferenteOptions}
            label="Conferente"
            onChange={(conferente) => setForm((current) => ({ ...current, conferente }))}
            placeholder="Digite para buscar no cadastro"
            value={form.conferente}
          />
        </div>

        <label className="field">
          <span>Observacoes</span>
          <textarea
            className="input-control text-area"
            disabled={readOnly}
            onChange={(event) => setForm((current) => ({ ...current, observacoes: event.target.value }))}
            rows={3}
            value={form.observacoes}
          />
        </label>
      </section>

      {mostrarBlocoImportItens ? (
        <section className="rir-card">
          <h4 className="rir-card-title">Importar itens (CSV)</h4>
          <div className="editor-block">
            <input
              accept=".csv,.txt,text/csv"
              onChange={(event) => {
                void stageImportItensFromFile(event.target.files?.[0] ?? null);
                event.target.value = '';
              }}
              ref={importItensInputRef}
              style={{ display: 'none' }}
              type="file"
            />
            <div className="editor-header">
              <span className="panel-copy" style={{ margin: 0 }}>
                Importe as linhas com colunas <strong>codigo</strong>, <strong>descricao</strong>, <strong>quantidade</strong>,{' '}
                <strong>unidade</strong>, <strong>localizacao</strong> e <strong>certificado</strong> (opcional). Separador ponto e
                virgula, como no Excel em portugues. Colunas antigas (ex.: codigo_material, quantidade_recebida, disciplina, pesos) ainda
                sao aceitas. O cabecalho do recebimento acima e usado ao salvar.
              </span>
              <Button
                disabled={!cabecalhoProntoParaImportItens()}
                onClick={() => importItensInputRef.current?.click()}
                type="button"
                variant="ghost"
              >
                Importar itens (CSV)
              </Button>
            </div>
          </div>
        </section>
      ) : null}

      <Modal
        onClose={() => {
          if (!importItensMerging) cancelImportItensStaging();
        }}
        open={Boolean(importStaging)}
        title="Confirmar importacao"
        wide
      >
        {importStaging ? (
          <div className="editor-block">
            <p>
              Importar <strong>{importStaging.linhaCount}</strong> linha(s) de dados do arquivo{' '}
              <strong>{importStaging.fileName}</strong>?
            </p>
            {importItensMerging ? (
              <OperationalNotice>Importando itens...</OperationalNotice>
            ) : null}
            <div className="form-actions" style={{ marginTop: 16 }}>
              <Button disabled={importItensMerging} onClick={cancelImportItensStaging} type="button" variant="ghost">
                Cancelar
              </Button>
              <Button disabled={importItensMerging} onClick={confirmImportItensStaging} type="button">
                Importar
              </Button>
            </div>
          </div>
        ) : null}
      </Modal>

      <Modal onClose={closeImportItensResultado} open={Boolean(importItensResultado)} title="Importacao concluida" wide>
        {importItensResultado ? (
          <div className="editor-block">
            <p>
              <strong>{importItensResultado.linhaCount}</strong> linha(s) processadas. Itens mesclados com a lista atual.
            </p>
            <div className="form-actions" style={{ marginTop: 16 }}>
              <Button onClick={closeImportItensResultado} type="button">
                OK
              </Button>
            </div>
          </div>
        ) : null}
      </Modal>

      {readOnly && temDivergenciaConferenciaVsRecebido ? (
        <OperationalNotice tone="critical">
          Este recebimento tem itens com quantidade conferida inferior à recebida (material não entregue ou entrega parcial). As linhas
          correspondentes estão em destaque a vermelho. Use as observações do recebimento para registar o motivo, se for política da obra.
        </OperationalNotice>
      ) : null}

      <section className="rir-card">
        <h4 className="rir-card-title">Itens do recebimento</h4>
        <RecebimentoItensEditor
          items={form.itens}
          modoRecebimento={form.modoRecebimento}
          onChange={(itens) => setForm((current) => ({ ...current, itens }))}
          readOnly={!itensEditaveis}
          showHeading={false}
        />
      </section>

      <SnapshotConflictHint show={snapshotConflict} onReload={onReloadAfterConflict} />
      {error ? (
        <div className="error-box" ref={errorBoxRef}>
          {error}
        </div>
      ) : null}

      <div className="form-actions">
        <Button onClick={onCancel} type="button" variant="ghost">
          {readOnly ? 'Fechar' : 'Cancelar'}
        </Button>
        {readOnly && podeCorrigirItensNaVisualizacao && !editandoItensNf ? (
          <Button onClick={() => setEditandoItensNf(true)} type="button">
            Editar itens da nota fiscal
          </Button>
        ) : null}
        {readOnly && podeCorrigirItensNaVisualizacao && editandoItensNf ? (
          <>
            <Button disabled={isSaving} onClick={cancelarEdicaoItensNf} type="button" variant="ghost">
              Cancelar edicao dos itens
            </Button>
            <Button disabled={isSaving} onClick={() => void handleSalvarSomenteItensNf()} type="button">
              {isSaving ? 'Salvando...' : 'Salvar alteracoes nos itens'}
            </Button>
          </>
        ) : null}
        {!readOnly ? (
          <Button disabled={isSaving} type="submit">
            {isSaving ? 'Salvando...' : 'Salvar recebimento'}
          </Button>
        ) : null}
      </div>
    </form>
  );
}
