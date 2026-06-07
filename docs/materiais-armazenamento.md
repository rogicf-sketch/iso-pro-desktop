# Materiais — snapshot vs tabela `materiais`

## Regra recomendada (produção)

- **Padrão:** materiais no JSON `iso_pro_snapshot` (mesmo modelo do mobile e da web).
- **Opcional:** `materiaisNuvem` em Configurações grava também na tabela `materiais` (consultas SQL, integrações).

## Evitar

- Alternar `materiaisNuvem` ligado/desligado em produção sem migração — pode duplicar ou divergir listas.
- Import CSV grande com os dois modos ativos sem validar unicidade por tenant.

## Próximo passo (roadmap)

Unificar num único caminho: snapshot **ou** tabela, com script de migração documentado.
