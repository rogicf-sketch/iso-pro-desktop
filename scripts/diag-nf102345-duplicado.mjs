import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadEnvFile } from './loadEnvFile.mjs';
loadEnvFile(path.resolve('.env'));
const sb = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
const T = '00000000-0000-0000-0000-000000000001';

const { data: snap } = await sb.from('iso_pro_snapshot').select('payload').eq('id','default').eq('tenant_id',T).maybeSingle();
const pl = typeof snap.payload === 'string' ? JSON.parse(snap.payload) : snap.payload;
const recs = (pl.recebimentos ?? []).filter((r) => String(r.nota ?? r.notaFiscal ?? '').includes('102345'));
console.log('na nuvem com NF-102345:', recs.length);
for (const r of recs) {
  console.log(JSON.stringify({
    id: r.id, nota: r.nota ?? r.notaFiscal, status: r.status, statusConf: r.statusConferencia,
    modo: r.modoRecebimento, data: r.data ?? r.dataRecebimento, dataConf: r.dataConferencia,
    conferente: r.conferenteNome ?? r.conferente, nItens: (r.itens ?? []).length,
  }));
}

const dump = JSON.parse(fs.readFileSync(path.join(os.tmpdir(), 'iso-recovery', 'recebimentos-dump-1.json'), 'utf8'));
const locais = dump.filter((r) => String(r.notaFiscal ?? r.nota ?? '').includes('102345'));
console.log('no dump local com NF-102345:', locais.length);
for (const r of locais) {
  console.log(JSON.stringify({ id: r.id, nota: r.notaFiscal ?? r.nota, status: r.status, modo: r.modoRecebimento, nItens: (r.itens ?? []).length }));
}
