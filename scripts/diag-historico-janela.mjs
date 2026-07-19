/** Investiga janela sem historico: comandos + backup junho + CSV 12/07 para TB-002 / BV-002. */
import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnvFile } from './loadEnvFile.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
loadEnvFile(path.join(projectRoot, '.env'));

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const key =
  process.env.SUPABASE_SECRET_KEY ||
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY;
const TENANT = '00000000-0000-0000-0000-000000000001';
const supabase = createClient(url, key, { auth: { persistSession: false } });

async function main() {
  // 1. Intervalo do log de comandos
  const { data: minMax } = await supabase
    .from('iso_pro_atendimento_comandos')
    .select('created_at')
    .eq('tenant_id', TENANT)
    .order('created_at', { ascending: true })
    .limit(1);
  const { data: last } = await supabase
    .from('iso_pro_atendimento_comandos')
    .select('created_at')
    .eq('tenant_id', TENANT)
    .order('created_at', { ascending: false })
    .limit(1);
  const { count: totalCmds } = await supabase
    .from('iso_pro_atendimento_comandos')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', TENANT);
  console.log('[comandos] total:', totalCmds, '| primeiro:', minMax?.[0]?.created_at, '| ultimo:', last?.[0]?.created_at);

  // 2. Comandos que mencionam os docs/codigo
  const { data: cmds } = await supabase
    .from('iso_pro_atendimento_comandos')
    .select('id, created_at, payload')
    .eq('tenant_id', TENANT)
    .limit(1000);
  const alvos = ['TB-002-SS11', 'BV-002-SS11', 'PAEKA0C0B9-8033080'];
  let hits = 0;
  for (const c of cmds ?? []) {
    const s = JSON.stringify(c.payload ?? {}).toUpperCase();
    if (alvos.some((a) => s.includes(a.toUpperCase()))) {
      hits += 1;
      console.log('[comando-hit]', c.created_at, String(s).slice(0, 200));
    }
  }
  console.log('[comandos] hits para TB-002/BV-002/PAEKA:', hits);

  // 3. Backup de junho: esses docs ja tinham qAt=20?
  const backupPath = path.join(projectRoot, 'backups', 'iso-pro-snapshot-export-2026-06-12T02-14-00.json');
  if (fs.existsSync(backupPath)) {
    const bk = JSON.parse(fs.readFileSync(backupPath, 'utf8'));
    const payload = bk.payload ?? bk;
    const docs = payload.documentos ?? [];
    console.log('[backup 12/06] docs:', docs.length);
    for (const d of docs) {
      const n = String(d.numero ?? '');
      if (!(n.includes('TB-002-SS11') || n.includes('BV-002-SS11') || n.includes('TB-001-SS11'))) continue;
      for (const it of d.itens ?? []) {
        if (!String(it.codigo ?? '').includes('PAEKA0C0B9-8033080')) continue;
        console.log('[backup 12/06]', n, '→ qAt:', it.quantidadeAtendida ?? it.quantidade_atendida, '/', it.quantidade);
      }
    }
    const histJun = (payload.atendimentoHistorico ?? []).filter((h) =>
      JSON.stringify(h).includes('8033080'),
    );
    console.log('[backup 12/06] historico PAEKA linhas:', histJun.length, histJun.map((h) => `${h.loteNumero}:${h.quantidade}@${h.documento}`));
  } else {
    console.log('[backup 12/06] ficheiro nao encontrado:', backupPath);
  }

  // 4. CSV export 12/07 (pre-incidente): qAt dessas linhas
  const csvPath = 'C:/Users/rogic/Downloads/iso-pro-documentos-itens-2026-07-12T18-43-08.csv';
  if (fs.existsSync(csvPath)) {
    const lines = fs.readFileSync(csvPath, 'utf8').split('\n');
    const rel = lines.filter((l) => l.includes('8033080'));
    console.log('[csv 12/07] linhas PAEKA:', rel.length);
    for (const l of rel) console.log('  ', l.trim().slice(0, 220));
  } else {
    console.log('[csv 12/07] nao encontrado.');
  }
}

main().catch((e) => {
  console.error('FALHA:', e.message);
  process.exit(1);
});
