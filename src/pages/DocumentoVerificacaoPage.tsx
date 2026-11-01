import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  formatarEmitidoVerificacao,
  parseDocumentoVerificacaoPayloadLegado,
  parseDocumentoVerificacaoSearch,
  rotuloTipoDocumentoControle,
} from '@/lib/documentoVerificacao';
import { LOGO_INSTITUCIONAL_PADRAO_FABRICA } from '@/lib/logoInstitucional.constants';
import { normalizarUrlAssetPublicParaAmbiente } from '@/lib/logoInstitucional';
import { APP_VERSION } from '@/appMeta';

/**
 * Página pública (sem login): o QR dos relatórios aponta para aqui.
 * Mostra identidade do documento (tipo, código, emissão, versão do modelo).
 */
export function DocumentoVerificacaoPage() {
  const [params] = useSearchParams();
  const logoUrl = normalizarUrlAssetPublicParaAmbiente(LOGO_INSTITUCIONAL_PADRAO_FABRICA);

  const dados = useMemo(() => {
    const fromQuery = parseDocumentoVerificacaoSearch(params.toString());
    if (fromQuery) return fromQuery;
    const legado = params.get('p') || params.get('payload') || '';
    if (legado) return parseDocumentoVerificacaoPayloadLegado(legado);
    return null;
  }, [params]);

  return (
    <div className="doc-verify-page">
      <div className="doc-verify-card">
        <header className="doc-verify-card__head">
          <img className="doc-verify-card__logo" src={logoUrl} alt="I.S.O PRO" />
          <div>
            <p className="doc-verify-card__kicker">Verificação de documento</p>
            <h1>I.S.O PRO</h1>
          </div>
        </header>

        {dados ? (
          <>
            <div className="doc-verify-stamp" role="status">
              Documento controlado · QR válido
            </div>
            <dl className="doc-verify-dl">
              <div>
                <dt>Tipo</dt>
                <dd>
                  <strong>{dados.tipo}</strong>
                  <span className="doc-verify-dl__sub">{rotuloTipoDocumentoControle(dados.tipo)}</span>
                </dd>
              </div>
              <div>
                <dt>Código</dt>
                <dd className="doc-verify-code">{dados.codigo}</dd>
              </div>
              <div>
                <dt>Emitido em</dt>
                <dd>{formatarEmitidoVerificacao(dados.emitidoEm)}</dd>
              </div>
              <div>
                <dt>Modelo do relatório</dt>
                <dd>v{dados.versaoDoc}</dd>
              </div>
            </dl>
            <p className="doc-verify-note">
              Este QR identifica o documento impresso pelo I.S.O PRO (tipo, número e data de emissão). Não substitui
              assinaturas nem acesso autenticado ao sistema.
            </p>
          </>
        ) : (
          <>
            <div className="doc-verify-stamp doc-verify-stamp--warn" role="status">
              QR incompleto ou inválido
            </div>
            <p className="doc-verify-note">
              Não foi possível ler os dados do documento. Escaneie novamente o QR no rodapé do relatório (RIR, RNC ou
              relatório fotográfico) gerado pelo I.S.O PRO.
            </p>
          </>
        )}

        <footer className="doc-verify-foot">
          <span>I.S.O PRO · v{APP_VERSION}</span>
          <Link className="doc-verify-foot__link" to="/login">
            Entrar no sistema
          </Link>
        </footer>
      </div>

      <style>{`
        .doc-verify-page {
          min-height: 100vh;
          margin: 0;
          padding: 28px 16px 40px;
          box-sizing: border-box;
          display: flex;
          align-items: flex-start;
          justify-content: center;
          background:
            radial-gradient(ellipse 80% 50% at 50% -10%, rgba(4, 120, 87, 0.22), transparent 55%),
            #0c0c0c;
          color: #f5f5f4;
          font-family: 'Segoe UI', system-ui, sans-serif;
        }
        .doc-verify-card {
          width: min(440px, 100%);
          margin-top: 8vh;
          padding: 22px 22px 18px;
          border-radius: 16px;
          border: 1px solid rgba(255, 255, 255, 0.1);
          background: rgba(24, 24, 27, 0.92);
          box-shadow: 0 18px 48px rgba(0, 0, 0, 0.45);
        }
        .doc-verify-card__head {
          display: flex;
          gap: 14px;
          align-items: center;
          margin-bottom: 18px;
        }
        .doc-verify-card__logo {
          width: 56px;
          height: 56px;
          object-fit: contain;
          border-radius: 10px;
          background: #fff;
          padding: 4px;
        }
        .doc-verify-card__kicker {
          margin: 0 0 2px;
          font-size: 11px;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: #86efac;
          font-weight: 700;
        }
        .doc-verify-card h1 {
          margin: 0;
          font-size: 1.35rem;
          font-weight: 800;
          letter-spacing: 0.02em;
        }
        .doc-verify-stamp {
          margin: 0 0 16px;
          padding: 10px 12px;
          border-radius: 10px;
          background: rgba(4, 120, 87, 0.22);
          border: 1px solid rgba(134, 239, 172, 0.35);
          color: #bbf7d0;
          font-size: 13px;
          font-weight: 700;
          letter-spacing: 0.04em;
          text-transform: uppercase;
        }
        .doc-verify-stamp--warn {
          background: rgba(180, 83, 9, 0.2);
          border-color: rgba(251, 191, 36, 0.35);
          color: #fde68a;
        }
        .doc-verify-dl {
          margin: 0;
          display: grid;
          gap: 12px;
        }
        .doc-verify-dl > div {
          display: grid;
          gap: 2px;
          padding-bottom: 10px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.08);
        }
        .doc-verify-dl dt {
          font-size: 11px;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: #a8a29e;
        }
        .doc-verify-dl dd {
          margin: 0;
          font-size: 15px;
          color: #fafaf9;
        }
        .doc-verify-dl__sub {
          display: block;
          margin-top: 2px;
          font-size: 12px;
          color: #a8a29e;
          font-weight: 400;
        }
        .doc-verify-code {
          font-weight: 800;
          font-variant-numeric: tabular-nums;
          letter-spacing: 0.02em;
          color: #86efac;
        }
        .doc-verify-note {
          margin: 16px 0 0;
          font-size: 12.5px;
          line-height: 1.45;
          color: #a8a29e;
        }
        .doc-verify-foot {
          margin-top: 18px;
          padding-top: 12px;
          border-top: 1px solid rgba(255, 255, 255, 0.08);
          display: flex;
          justify-content: space-between;
          gap: 12px;
          align-items: center;
          font-size: 12px;
          color: #78716c;
        }
        .doc-verify-foot__link {
          color: #86efac;
          text-decoration: none;
          font-weight: 600;
        }
        .doc-verify-foot__link:hover { text-decoration: underline; }
      `}</style>
    </div>
  );
}
