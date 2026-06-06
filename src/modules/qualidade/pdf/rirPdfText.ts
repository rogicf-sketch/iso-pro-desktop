import type { PDFFont } from 'pdf-lib';



/** Quebra uma palavra longa (sem espaços) por caracteres até caber na largura. */

function quebrarPalavraLongaPdf(

  palavra: string,

  larguraMax: number,

  fonte: PDFFont,

  tamanho: number,

): string[] {

  if (!palavra) return [];

  if (fonte.widthOfTextAtSize(palavra, tamanho) <= larguraMax) return [palavra];



  const partes: string[] = [];

  let buf = '';

  for (const ch of palavra) {

    const cand = buf + ch;

    if (fonte.widthOfTextAtSize(cand, tamanho) <= larguraMax) {

      buf = cand;

    } else {

      if (buf) partes.push(buf);

      buf = ch;

    }

  }

  if (buf) partes.push(buf);

  return partes.length ? partes : [palavra.slice(0, 1)];

}



/** Quebra texto por largura (pt) usando metricas reais da fonte. */

export function quebrarTextoPdf(

  texto: string,

  larguraMax: number,

  fonte: PDFFont,

  tamanho: number,

): string[] {

  const bruto = String(texto ?? '')

    .replace(/\r\n/g, '\n')

    .trim();

  if (!bruto) return ['—'];

  if (larguraMax <= 0) return [bruto.slice(0, 32)];



  const linhas: string[] = [];



  const appendFragmento = (frag: string) => {

    const pedacos =

      fonte.widthOfTextAtSize(frag, tamanho) <= larguraMax

        ? [frag]

        : quebrarPalavraLongaPdf(frag, larguraMax, fonte, tamanho);



    for (const ped of pedacos) {

      if (!linhas.length) {

        linhas.push(ped);

        continue;

      }

      const ultima = linhas[linhas.length - 1]!;

      const candidato = ultima ? `${ultima} ${ped}` : ped;

      if (fonte.widthOfTextAtSize(candidato, tamanho) <= larguraMax) {

        linhas[linhas.length - 1] = candidato;

      } else {

        linhas.push(ped);

      }

    }

  };



  for (const paragrafo of bruto.split('\n')) {

    const palavras = paragrafo.split(/\s+/).filter(Boolean);

    if (palavras.length === 0) {

      if (linhas.length === 0 || linhas[linhas.length - 1] !== '') linhas.push('');

      continue;

    }

    for (const palavra of palavras) {

      appendFragmento(palavra);

    }

  }



  return linhas.length ? linhas : ['—'];

}



export function formatDatePtPdf(iso: string): string {

  if (!iso) return '—';

  const d = new Date(iso);

  if (Number.isNaN(d.getTime())) return iso;

  return d.toLocaleDateString('pt-BR');

}



export function formatDateTimePtPdf(): string {

  return new Date().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

}



export function sanitizarTextoPdf(s: string): string {

  return String(s ?? '')

    .replaceAll('\u0000', '')

    .replace(/\t/g, ' ')

    .trim();

}

