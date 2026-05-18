import type { ConfiguracaoSecaoMeta } from '../constants/configuracoesSecoes.constants';

type Props = {
  secao: ConfiguracaoSecaoMeta;
};

export function ConfiguracoesSecaoIntro({ secao }: Props) {
  return (
    <header aria-labelledby="config-secao-titulo" className="config-secao-intro">
      <div className="config-secao-intro__head">
        <h3 className="config-secao-intro__titulo" id="config-secao-titulo">
          {secao.rotulo}
        </h3>
        {secao.adminOnly ? <span className="config-secao-intro__badge">Administrador</span> : null}
      </div>
      <p className="config-secao-intro__texto">{secao.intro}</p>
    </header>
  );
}
