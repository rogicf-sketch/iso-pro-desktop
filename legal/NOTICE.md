# Avisos de terceiros (NOTICE)

O **I.S.O PRO Desktop** inclui bibliotecas de terceiros (npm). As licenças de cada pacote estão nos respectivos repositórios sob `node_modules/<nome>/LICENSE*` após `npm ci`.

## Gerar um resumo para auditoria ou release

Na raiz do projeto (ambiente de desenvolvimento):

```bash
npx license-checker --summary --production
```

Opcionalmente, listagem completa:

```bash
npx license-checker --production --csv > legal/third-party-licenses.csv
```

(O comando não faz parte do `npm run ci` obrigatório; use quando preparar distribuição ou resposta a auditoria.)

## Software proprietário

O código aplicacional próprio do I.S.O PRO Desktop não é open-source salvo indicação contrária no repositório. Ver também `legal/EULA.txt` e o campo `license` em `package.json`.
