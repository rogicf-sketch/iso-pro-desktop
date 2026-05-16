import { useState } from 'react';
import { Button } from '../../../components/ui/Button';
import { OperationalNotice } from '../../../components/ui/OperationalNotice';
import { getSupabaseConfigDiagnostics } from '../../../lib/supabase';
import { testSupabaseDispositivosMobile } from '../services/mobileDevices.service';

type Props = {
  canAdministerConfiguracoes: boolean;
};

export function SupabaseMobileDiagnostics({ canAdministerConfiguracoes }: Props) {
  const diag = getSupabaseConfigDiagnostics();
  const [testLine, setTestLine] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);

  async function runTest() {
    setTesting(true);
    setTestLine(null);
    try {
      const r = await testSupabaseDispositivosMobile();
      setTestLine(`${r.ok ? 'Sucesso' : 'Falha'}: ${r.message}`);
    } catch (e) {
      setTestLine(e instanceof Error ? e.message : 'Erro desconhecido ao testar.');
    } finally {
      setTesting(false);
    }
  }

  const ok = diag.hasUrl && diag.hasKey;

  return (
    <div className="stack-grid" style={{ gap: 12 }}>
      <OperationalNotice tone={ok ? 'neutral' : 'warning'}>
        <strong>Ligacao Supabase neste browser</strong>
        <br />
        URL:{' '}
        {diag.hasUrl ? (
          <>
            sim (origem: <strong>{diag.urlFrom}</strong>) — host oculto por seguranca
          </>
        ) : (
          <strong>nao configurada</strong>
        )}
        <br />
        Chave anon/publicavel:{' '}
        {diag.hasKey ? (
          <>
            sim (origem: <strong>{diag.keyFrom}</strong>) — valor nao e mostrado aqui
          </>
        ) : (
          <strong>nao configurada</strong>
        )}
        {!ok ? (
          <>
            <br />
            <br />
            Se ja preencheste os campos em <strong>Configuracoes do sistema → Supabase e nuvem</strong>, confirma: (1) clicaste{' '}
            <strong>Salvar</strong> no fundo dessa pagina; (2) os campos nao estao desativados — se estiverem cinzentos, o teu perfil{' '}
            <strong>nao pode administrar configuracoes</strong> e precisas de um administrador.
            {!canAdministerConfiguracoes ? (
              <>
                {' '}
                <strong>O teu utilizador nao tem permissao para gravar Configuracoes.</strong>
              </>
            ) : null}
          </>
        ) : null}
      </OperationalNotice>

      <div className="inline-actions" style={{ flexWrap: 'wrap' }}>
        <Button disabled={testing} onClick={() => void runTest()} variant="ghost">
          {testing ? 'A testar…' : 'Testar leitura da tabela dispositivos_mobile'}
        </Button>
      </div>

      {testLine ? (
        <OperationalNotice tone={testLine.startsWith('Sucesso') ? 'neutral' : 'warning'}>{testLine}</OperationalNotice>
      ) : null}
    </div>
  );
}
