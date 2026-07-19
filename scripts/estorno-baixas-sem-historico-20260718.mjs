/**
 * Estorno das baixas-fantasma (atendido sem historico) de volta ao planejamento.
 *
 * Regra: para cada linha de documento, se quantidadeAtendida > soma do historico
 * (doc+codigo), reduz a quantidadeAtendida ate ao valor documentado pelo historico.
 *   - Linhas sem NENHUM historico: quantidadeAtendida -> 0
 *   - Linhas com historico parcial (ex.: TB-001 8/20 com hist=8): fica em 8 (preserva o documentado)
 *   - Linhas coerentes (qAt <= hist): NAO toca
 *
 * Nao cria historico, nao altera recebimentos, nao apaga desenhos nem quantidades previstas.
 * Escreve direto no snapshot (sem evento de auditoria) + sincroniza tabelas de escala + recalcula status.
 *
 * Uso:
 *   node --use-system-ca scripts/estorno-baixas-sem-historico-20260718.mjs           (dry-run)
 *   node --use-system-ca scripts/estorno-baixas-sem-historico-20260718.mjs --apply   (grava)
 */
import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnvFile } from './loadEnvFile.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
loadEnvFile(path.join(projectRoot, '.env'));

const APPLY = process.argv.includes('--apply');
const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const key =
  process.env.SUPABASE_SECRET_KEY ||
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY;
const TENANT = '00000000-0000-0000-0000-000000000001';
const supabase = createClient(url, key, { auth: { persistSession: false } });

const EPS = 1e-6;
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const norm = (v) => String(v ?? '').trim().toLowerCase();

async function main() {
  const { data: snap } = await supabase
    .from('iso_pro_snapshot')
    .select('payload, updated_at')
    .eq('id', 'default')
    .eq('tenant_id', TENANT)
    .maybeSingle();
  const baselineUpdatedAt = snap.updated_at;
  const pl = typeof snap.payload === 'string' ? JSON.parse(snap.payload) : snap.payload;
  const docs = pl.documentos ?? [];
  const hist = pl.atendimentoHistorico ?? [];

  // Soma do historico por doc(numero)+codigo
  const histPorDocCod = new Map();
  for (const h of hist) {
    const k = norm(h.documento) + '|' + norm(h.codigo);
    histPorDocCod.set(k, (histPorDocCod.get(k) ?? 0) + num(h.quantidade ?? h.quantidadeAtendida ?? h.qtd));
  }

  const alteracoes = [];
  let totalEstornado = 0;
  const docsAfetados = new Set();

  for (const d of docs) {
    for (const it of d.itens ?? []) {
      const qAt = num(it.quantidadeAtendida ?? it.quantidade_atendida);
      if (qAt <= EPS) continue;
      const hSum = histPorDocCod.get(norm(d.numero) + '|' + norm(it.codigo)) ?? 0;
      if (qAt > hSum + EPS) {
        const novo = hSum; // preserva a parte documentada
        alteracoes.push({
          doc: d.numero,
          rev: d.revisao,
          cod: it.codigo,
          de: qAt,
          para: novo,
          estornado: +(qAt - novo).toFixed(3),
        });
        totalEstornado += qAt - novo;
        docsAfetados.add(d.id);
      }
    }
  }

  console.log('Snapshot baseline updated_at:', baselineUpdatedAt);
  console.log('Documentos:', docs.length, '| Historico:', hist.length);
  console.log('');
  console.log('=== ESTORNO A APLICAR ===');
  console.log('Linhas a estornar:', alteracoes.length);
  console.log('Desenhos afetados:', docsAfetados.size);
  console.log('Quantidade total estornada (volta ao planejamento):', +totalEstornado.toFixed(1));
  console.log('');
  console.log('Amostra (primeiras 25):');
  for (const a of alteracoes.slice(0, 25)) {
    console.log(`  ${a.doc} rev${a.rev} | ${a.cod} | atendido ${a.de} -> ${a.para} (estorna ${a.estornado})`);
  }

  // Relatorio completo
  const outPath = path.join(projectRoot, 'release', 'estorno-baixas-sem-historico-20260718.json');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify({ geradoEm: new Date().toISOString(), baselineUpdatedAt, totalLinhas: alteracoes.length, desenhos: docsAfetados.size, totalEstornado: +totalEstornado.toFixed(1), alteracoes }, null, 1));
  console.log('\nRelatorio completo:', outPath);

  if (!APPLY) {
    console.log('\nDRY-RUN concluido. Nada foi gravado. Rode com --apply para estornar.');
    return;
  }

  // Aplica no payload (so as linhas divergentes)
  const setNovo = new Map();
  for (const a of alteracoes) setNovo.set(norm(a.doc) + '|' + norm(a.rev) + '|' + norm(a.cod), a.para);
  let aplicadas = 0;
  for (const d of docs) {
    for (const it of d.itens ?? []) {
      const k = norm(d.numero) + '|' + norm(d.revisao) + '|' + norm(it.codigo);
      if (setNovo.has(k)) {
        const novo = setNovo.get(k);
        const atual = num(it.quantidadeAtendida ?? it.quantidade_atendida);
        if (atual > novo + EPS) {
          it.quantidadeAtendida = novo;
          if ('quantidade_atendida' in it) it.quantidade_atendida = novo;
          aplicadas += 1;
        }
      }
    }
  }
  console.log('\n[apply] linhas alteradas no payload:', aplicadas);

  const nextPayload = { ...pl, documentos: docs, dataAtualizacao: new Date().toISOString() };
  const { error: writeErr, count } = await supabase
    .from('iso_pro_snapshot')
    .update({ payload: nextPayload, updated_at: new Date().toISOString() }, { count: 'exact' })
    .eq('id', 'default')
    .eq('tenant_id', TENANT)
    .eq('updated_at', baselineUpdatedAt);
  if (writeErr) throw new Error('Falha ao gravar snapshot: ' + writeErr.message);
  if (!count) throw new Error('Snapshot mudou entretanto (conflito) — nada gravado. Repita.');
  console.log('[apply] snapshot gravado.');

  // Sincroniza tabelas de escala (le as novas quantidades)
  const { data: syncData, error: syncErr } = await supabase.rpc(
    'iso_pro_sync_documentos_planejamento_from_snapshot',
    { p_tenant_id: TENANT },
  );
  console.log('[apply] sync tabelas:', syncErr ? 'ERRO ' + syncErr.message : JSON.stringify(syncData));
}

main().catch((e) => {
  console.error('FALHA:', e.message);
  process.exit(1);
});
