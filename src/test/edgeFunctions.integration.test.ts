/**
 * Integração opcional com as Edge Functions **já em execução** (por exemplo `supabase functions serve`).
 *
 * Por padrão não roda no `npm test` (este arquivo está excluído no `vite.config.ts`).
 * Para rodar: `npm run test:integration:edge` com as variáveis abaixo definidas.
 *
 * Variáveis:
 * - ISO_PRO_EDGE_INTEGRATION=1  (obrigatório para não pular os testes)
 * - SUPABASE_EDGE_FUNCTIONS_URL  (opcional; padrão http://127.0.0.1:54321/functions/v1)
 * - SUPABASE_ANON_KEY            (obrigatório; ex.: saída de `npx supabase status`)
 * - ISO_PRO_LINK_AUTH_SECRET     (obrigatório; mesmo valor do segredo da função)
 * - ISO_PRO_ADMIN_USER_SECRET    (obrigatório; mesmo valor do segredo da função)
 */
import { describe, expect, it } from 'vitest';

const TENANT_PADRAO = '00000000-0000-0000-0000-000000000001';

const integracaoLigada =
  process.env.ISO_PRO_EDGE_INTEGRATION === '1' &&
  Boolean(process.env.SUPABASE_ANON_KEY?.trim()) &&
  Boolean(process.env.ISO_PRO_LINK_AUTH_SECRET?.trim()) &&
  Boolean(process.env.ISO_PRO_ADMIN_USER_SECRET?.trim());

const urlBase = (process.env.SUPABASE_EDGE_FUNCTIONS_URL ?? 'http://127.0.0.1:54321/functions/v1').replace(/\/$/, '');
const chaveAnon = process.env.SUPABASE_ANON_KEY?.trim() ?? '';
const segredoLink = process.env.ISO_PRO_LINK_AUTH_SECRET?.trim() ?? '';
const segredoAdmin = process.env.ISO_PRO_ADMIN_USER_SECRET?.trim() ?? '';

function chamarEdgePostJson(caminho: string, corpo: unknown, cabecalhosExtras?: Record<string, string>) {
  return fetch(`${urlBase}/${caminho}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${chaveAnon}`,
      apikey: chaveAnon,
      ...cabecalhosExtras,
    },
    body: JSON.stringify(corpo),
  });
}

describe.skipIf(!integracaoLigada)('Funções Edge — integração HTTP local', () => {
  it('iso_pro_link_auth_user: sem cabeçalho de segredo → 401', async () => {
    const res = await chamarEdgePostJson(
      'iso_pro_link_auth_user',
      { usuarioId: 'x', tenantId: TENANT_PADRAO, authUserId: null },
      {},
    );
    expect(res.status).toBe(401);
    const j = (await res.json()) as { ok?: boolean; message?: string };
    expect(j.ok).toBe(false);
  });

  it('iso_pro_link_auth_user: segredo incorreto → 401', async () => {
    const res = await chamarEdgePostJson(
      'iso_pro_link_auth_user',
      { usuarioId: 'x', tenantId: TENANT_PADRAO, authUserId: null },
      { 'x-iso-pro-link-secret': 'definitivamente-nao-e-o-segredo' },
    );
    expect(res.status).toBe(401);
  });

  it('iso_pro_link_auth_user: segredo correto e usuarioId vazio → 400', async () => {
    const res = await chamarEdgePostJson(
      'iso_pro_link_auth_user',
      { usuarioId: '', tenantId: TENANT_PADRAO, authUserId: null },
      { 'x-iso-pro-link-secret': segredoLink },
    );
    expect(res.status).toBe(400);
    const j = (await res.json()) as { ok?: boolean; message?: string };
    expect(j.ok).toBe(false);
    expect(String(j.message ?? '')).toMatch(/usuarioId/i);
  });

  it('iso_pro_admin_user: sem cabeçalho de segredo → 401', async () => {
    const res = await chamarEdgePostJson(
      'iso_pro_admin_user',
      {
        tenantId: TENANT_PADRAO,
        actorLogin: 'admin',
        actorSenha: 'x',
        mode: 'create',
        user: { login: 'a', nome: 'A', senha: '1234', perfil_id: 'p', ativo: true, colaborador_id: null },
        permissoes: [{ modulo: 'dashboard', acao: 'visualizar', permitido: true }],
      },
      {},
    );
    expect(res.status).toBe(401);
  });

  it('iso_pro_admin_user: segredo incorreto → 401', async () => {
    const res = await chamarEdgePostJson(
      'iso_pro_admin_user',
      {
        tenantId: TENANT_PADRAO,
        actorLogin: 'admin',
        actorSenha: 'x',
        mode: 'create',
        user: { login: 'a', nome: 'A', senha: '1234', perfil_id: 'p', ativo: true, colaborador_id: null },
        permissoes: [{ modulo: 'dashboard', acao: 'visualizar', permitido: true }],
      },
      { 'x-iso-pro-admin-user-secret': 'segredo-incorreto' },
    );
    expect(res.status).toBe(401);
  });

  it('iso_pro_admin_user: segredo correto e sem objeto user → 400', async () => {
    const res = await chamarEdgePostJson(
      'iso_pro_admin_user',
      {
        tenantId: TENANT_PADRAO,
        actorLogin: 'admin',
        actorSenha: 'x',
        mode: 'create',
        permissoes: [{ modulo: 'dashboard', acao: 'visualizar', permitido: true }],
      },
      { 'x-iso-pro-admin-user-secret': segredoAdmin },
    );
    expect(res.status).toBe(400);
    const j = (await res.json()) as { ok?: boolean; message?: string };
    expect(j.ok).toBe(false);
    expect(String(j.message ?? '')).toMatch(/user/i);
  });

  it('purge_cloud_data: tenantId inválido → 400', async () => {
    const res = await chamarEdgePostJson('purge_cloud_data', {
      tenantId: 'nao-e-uuid',
      login: 'admin',
      senha: 'x',
      confirmFraseOperacional: 'APAGAR_DADOS_NUVEM',
      incluirUtilizadoresEPerfis: false,
    });
    expect(res.status).toBe(400);
    const j = (await res.json()) as { ok?: boolean; message?: string };
    expect(j.ok).toBe(false);
  });
});
