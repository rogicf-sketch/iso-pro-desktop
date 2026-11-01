#!/usr/bin/env node
/**
 * Barreira anti-split-brain: Histórico UI e Export devem usar a mesma fonte unificada.
 * Falha o CI se caminhos legados (snapshot-only / RPC tabular-only) voltarem no export/página.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const servicePath = path.join(root, 'src/modules/atendimento/services/atendimento.service.ts');
const src = fs.readFileSync(servicePath, 'utf8');

const checks = [
  {
    name: 'export usa listarHistoricoAtendimentos (nao so readRemoteState.atendimentos)',
    ok:
      /carregarAtendimentosEDocumentosParaExport[\s\S]*?listarHistoricoAtendimentos\(\)/.test(src) &&
      !/carregarAtendimentosEDocumentosParaExport[\s\S]*?atendimentos:\s*\[\.\.\.state\.atendimentos\]/.test(src),
  },
  {
    name: 'listarHistoricoAtendimentosPagina usa readRemoteHistoricoAtendimentos (merge)',
    ok:
      /listarHistoricoAtendimentosPagina[\s\S]*?readRemoteHistoricoAtendimentos\(\)/.test(src) &&
      !/listarHistoricoAtendimentosPagina[\s\S]*?readRemoteHistoricoAtendimentosFromLotes\(/.test(src),
  },
  {
    name: 'merge tabelas∪snapshot existe',
    ok: /function mergeHistoricoTabelasComSnapshot\(/.test(src),
  },
  {
    name: 'backfill heal de lotes so-snapshot existe',
    ok: /function backfillHistoricoLotesFromSnapshotBestEffort\(/.test(src),
  },
];

let failed = 0;
for (const c of checks) {
  if (!c.ok) {
    console.error(`[check-historico-single-source] FAIL: ${c.name}`);
    failed += 1;
  } else {
    console.log(`[check-historico-single-source] ok: ${c.name}`);
  }
}

if (failed > 0) {
  console.error(`\n${failed} barreira(s) de fonte unica do Historico falharam.`);
  process.exit(1);
}

console.log('\nHistorico: fonte unica (UI = Export = merge) — OK.');
