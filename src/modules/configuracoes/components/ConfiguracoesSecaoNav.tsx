import type { ConfiguracaoSecaoId, ConfiguracaoSecaoMeta } from '../constants/configuracoesSecoes.constants';

type Props = {
  secoes: ConfiguracaoSecaoMeta[];
  secaoAtiva: ConfiguracaoSecaoId;
  onSecao: (id: ConfiguracaoSecaoId) => void;
};

export function ConfiguracoesSecaoNav({ secoes, secaoAtiva, onSecao }: Props) {
  return (
    <div className="config-tabs-wrap">
      <nav aria-label="Secções de configuração" className="config-tabs" role="tablist">
        {secoes.map((s) => {
          const ativa = s.id === secaoAtiva;
          return (
            <button
              key={s.id}
              aria-controls={`config-secao-${s.id}`}
              aria-selected={ativa}
              className={`config-tab${ativa ? ' config-tab--ativa' : ''}`}
              id={`config-tab-${s.id}`}
              onClick={() => onSecao(s.id)}
              role="tab"
              title={s.resumo}
              type="button"
            >
              <span className="config-tab__top">
                <span className="config-tab__rotulo">{s.rotulo}</span>
                {s.adminOnly ? <span className="config-tab__badge">Admin</span> : null}
              </span>
              <span className="config-tab__resumo">{s.resumo}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
