import type { ConfiguracaoSecaoMeta } from '../constants/configuracoesSecoes.constants';

type Props = {
  secao: ConfiguracaoSecaoMeta;
};

/** Título curto + uma frase — prosa longa vai em ModuleHelp. */
export function ConfiguracoesSecaoIntro({ secao }: Props) {
  return (
    <header aria-labelledby="config-secao-titulo" className="config-secao-intro">
      <div className="config-secao-intro__head">
        <h2 className="config-secao-intro__title" id="config-secao-titulo">
          {secao.rotulo}
        </h2>
        {secao.adminOnly ? <span className="config-secao-intro__badge">Admin</span> : null}
      </div>
      <p className="config-secao-intro__lede">{secao.intro}</p>
    </header>
  );
}
