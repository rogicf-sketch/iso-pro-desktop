#!/usr/bin/env bash
# Correr na VM Ubuntu (Oracle) como utilizador com sudo.
# Pode enviar esta pasta inteira (oracle-cloud) para a VM e correr daí, ou só colocar
# nginx-isopro.conf em /tmp/nginx-isopro.conf

set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)
CONF_SRC=""
if [[ -f "$SCRIPT_DIR/nginx-isopro.conf" ]]; then
  CONF_SRC="$SCRIPT_DIR/nginx-isopro.conf"
elif [[ -f /tmp/nginx-isopro.conf ]]; then
  CONF_SRC="/tmp/nginx-isopro.conf"
fi

echo "==> Pacotes (Nginx + Certbot)"
sudo apt-get update -y
sudo apt-get install -y nginx certbot python3-certbot-nginx

echo "==> Pasta do site"
sudo mkdir -p /var/www/iso-pro
sudo chown -R "$USER":"$USER" /var/www/iso-pro

if [[ -n "$CONF_SRC" ]]; then
  echo "==> Desativar site por defeito do Nginx (evita conflito na porta 80)"
  if [[ -e /etc/nginx/sites-enabled/default ]]; then
    sudo rm -f /etc/nginx/sites-enabled/default
  fi
  echo "==> Instalar nginx a partir de $CONF_SRC"
  sudo cp "$CONF_SRC" /etc/nginx/sites-available/isopro
  sudo ln -sf /etc/nginx/sites-available/isopro /etc/nginx/sites-enabled/isopro
  sudo nginx -t
  sudo systemctl enable --now nginx
  sudo systemctl reload nginx
  echo "OK: Nginx ativo. Envie o conteúdo de dist/ para /var/www/iso-pro (index.html + assets/)."
  echo "DNS a apontar para este IP → depois:"
  echo "  sudo certbot --nginx -d isoprogestaodemateriais.com.br -d www.isoprogestaodemateriais.com.br"
else
  echo "ERRO: nginx-isopro.conf não encontrado."
  echo "  Opção A: correr este script dentro da pasta oracle-cloud na VM."
  echo "  Opção B: copiar nginx-isopro.conf para /tmp/nginx-isopro.conf e voltar a correr."
  exit 1
fi
