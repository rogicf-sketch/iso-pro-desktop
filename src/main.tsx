import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';
import {
  carregarConfiguracoes,
  readConfiguracoes,
  salvarConfiguracoes,
} from '@/modules/configuracoes/services/configuracoes.service';
import { AuthProvider } from '@/store/authStore';

/** Migração única: quem ainda estava em "Padrao escuro" passa a ver o tema Neon uma vez; depois pode voltar em Configurações. */
const NEON_PREVIEW_MIGRATION_KEY = 'iso-pro-neon-preview-migrado-v1';

void (async () => {
  try {
    await carregarConfiguracoes();
    if (typeof localStorage !== 'undefined' && !localStorage.getItem(NEON_PREVIEW_MIGRATION_KEY)) {
      const config = readConfiguracoes();
      if (config.tema === 'padrao') {
        await salvarConfiguracoes({ ...config, tema: 'neon' });
      }
      localStorage.setItem(NEON_PREVIEW_MIGRATION_KEY, '1');
    }
  } catch (err) {
    console.error('Falha ao carregar configuracoes antes do primeiro render:', err);
  }

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <AuthProvider>
        <App />
      </AuthProvider>
    </StrictMode>,
  );
})();
