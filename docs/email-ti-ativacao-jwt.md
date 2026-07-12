# Email / mensagem — Equipa TI (JWT Fase 3)

Copiar, preencher campos `[...]` quando for enviar, anexar `release/CHECKLIST-ATIVACAO-JWT.pdf`.

---

## Assunto

**I.S.O PRO — Activação JWT / RLS (Fase 3) — Obra produção · acção TI**

---

## Corpo (email)

Olá equipa de TI,

Segue o roteiro para activar **JWT forte** no I.S.O PRO, mantendo operação normal em modo compatível (`anon_compativel`) até concluirmos a ligação utilizador a utilizador.

### Dados do ambiente

| Campo | Valor |
|-------|--------|
| **Obra / ambiente** | I.S.O PRO — Produção |
| **URL web** | https://isoprogestaodemateriais.com.br |
| **Projecto Supabase** | `huvktaxsosxrfpvdigxq` |
| **URL Supabase** | https://huvktaxsosxrfpvdigxq.supabase.co |
| **Tenant principal** | `00000000-0000-0000-0000-000000000001` — *Organização principal* |
| **Versões mínimas** | PC/Web **0.1.75** · Mobile **1.0.43** |
| **Responsável TI** | [inserir nome] — [inserir email/telefone] |
| **Data alvo piloto** | [inserir data] |

> Existem 2 tenants na base (`default` + `nova-empresa`). Confirmar em SQL qual o tenant activo na obra.

### Documentos

- Página interactiva: https://isoprogestaodemateriais.com.br/checklist-ativacao-jwt.html
- PDF anexo: `CHECKLIST-ATIVACAO-JWT.pdf`

### Ordem de execução

1. Migrations Fase 1 (checklist)
2. Confirmar hook `custom_access_token_hook`
3. Secret `ISO_PRO_LINK_AUTH_SECRET` (Dashboard + Configurações PC)
4. Piloto: ligar utilizador **`admin`**
5. Validar painel **Dispositivos mobile** → `jwt_forte`
6. Teste PC + mobile; rollout em ondas

### Critério de pronto

- [ ] Migrations validadas
- [ ] Secret configurado
- [ ] ≥ 1 piloto em `jwt_forte`
- [ ] Setup 0.1.75 + APK 1.0.43

Quem **não** tiver `auth_user_id` continua em `anon_compativel`.

Obrigado,  
[Nome] · [Contacto]

---

## Versão curta (Teams / WhatsApp)

> **I.S.O PRO — JWT Fase 3**  
> Tenant: `00000000-0000-0000-0000-000000000001`  
> Checklist: https://isoprogestaodemateriais.com.br/checklist-ativacao-jwt.html  
> Ordem: migrations → hook → secret → piloto admin → painel sync.  
> Versões: PC **0.1.75**, mobile **1.0.43**.
