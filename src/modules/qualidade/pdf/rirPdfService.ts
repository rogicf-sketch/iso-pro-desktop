import { readConfiguracoes } from '../../configuracoes/services/configuracoes.service';
import { segmentoInstituicaoRodapeEletronico } from '../../../lib/htmlRelatorioInstitucional';
import type { RirRegistro } from '../types/qualidade.types';
import { rirObraDefaultsFromConfig } from '../utils/rirConfigDefaults';
import { formatarDisciplinaExibicaoRir, resolverDisciplinaRir } from '../utils/rirDisciplina';
import { formatDateTimePtPdf } from './rirPdfText';
import { carregarBytesFontesRirPdf } from './rirPdfFonts';
import type { RirPdfBranding, RirPdfContexto } from './rirPdfDocument';
import { gerarRirPdfBytes } from './rirPdfDocument';
import { carregarLogoInstitucionalParaPdf } from './rirPdfLogo';

export { gerarRirPdfBytes } from './rirPdfDocument';

export async function montarContextoRirPdf(registro: RirRegistro): Promise<RirPdfContexto> {
  const cfg = readConfiguracoes();
  const obCfg = rirObraDefaultsFromConfig(cfg);
  const uoExibir = (registro.uo || '').trim() || obCfg.uo;
  const localExibir = (registro.localObra || '').trim() || obCfg.localObra;
  const contratoExibir = (registro.contratoNumero || '').trim() || obCfg.contratoNumero;
  const itens = registro.itensRir ?? [];
  const disciplinaSigla =
    (registro.disciplina ?? '').trim() ||
    resolverDisciplinaRir({
      procedimentoNumero: registro.procedimentoNumero,
      codigo: registro.codigo,
      itensRir: itens,
    });

  const escopoPartes = [cfg.cliente, cfg.projeto, uoExibir].filter((s) => !!String(s).trim());
  const escopoLinha = [...new Set(escopoPartes.map((s) => String(s).trim()))].join(' · ') || uoExibir || '—';

  const logo = await carregarLogoInstitucionalParaPdf(cfg.logoInstitucionalUrl);
  const fontes = await carregarBytesFontesRirPdf();

  const branding: RirPdfBranding = {
    logoPng: logo.png,
    logoJpg: logo.jpg,
    cliente: cfg.cliente || '',
    projeto: cfg.projeto || '',
    rodapeInstituicao: segmentoInstituicaoRodapeEletronico(cfg.documentoRodapeNome, cfg.documentoRodapeCnpj),
  };

  return {
    registro,
    branding,
    uoExibir,
    localExibir,
    contratoExibir,
    disciplinaExibir: formatarDisciplinaExibicaoRir(disciplinaSigla),
    escopoLinha,
    emitidoEm: formatDateTimePtPdf(),
    logoDataUrl: logo.dataUrl,
    fonteFamilia: fontes.familia,
  };
}

export async function gerarRirPdfDeRegistro(registro: RirRegistro): Promise<Uint8Array> {
  const ctx = await montarContextoRirPdf(registro);
  return gerarRirPdfBytes(ctx);
}

export function rirPdfBytesParaBase64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
  return btoa(bin);
}

export function rirPdfBase64ParaBytes(base64: string): Uint8Array {
  const bin = atob(base64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
