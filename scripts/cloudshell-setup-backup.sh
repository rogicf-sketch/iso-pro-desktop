#!/usr/bin/env bash
# Cole este ficheiro inteiro no Oracle Cloud Shell (sa-saopaulo-1) e execute:
#   bash cloudshell-setup-backup.sh
#
# Cria bucket iso-pro-backups (se nao existir) e faz upload de teste opcional.

set -euo pipefail

BUCKET=iso-pro-backups
PREFIX=iso-pro-snapshots

echo "==> Testando OCI CLI..."
NS=$(oci os ns get --query data --raw-output)
echo "    Namespace: $NS"

echo "==> Compartment (root tenancy)..."
TENANCY=$(oci iam tenancy get --query data.id --raw-output)
echo "    Tenancy OCID: $TENANCY"

echo "==> Bucket $BUCKET..."
if oci os bucket get --namespace-name "$NS" --bucket-name "$BUCKET" >/dev/null 2>&1; then
  echo "    Ja existe."
else
  oci os bucket create \
    --name "$BUCKET" \
    --compartment-id "$TENANCY" \
    --public-access-type NoPublicAccess
  echo "    Criado."
fi

echo "==> Upload de teste..."
TEST_FILE="/tmp/iso-pro-backup-teste-$(date +%Y%m%d-%H%M%S).txt"
echo "backup teste I.S.O PRO $(date -Is)" > "$TEST_FILE"
OBJECT="$PREFIX/teste/$(date +%Y/%m)/$(basename "$TEST_FILE")"
oci os object put \
  --namespace "$NS" \
  --bucket-name "$BUCKET" \
  --name "$OBJECT" \
  --file "$TEST_FILE" \
  --force
echo "    OK: oci://$BUCKET/$OBJECT"

echo ""
echo "==> Para usar no Windows:"
echo "    1) Cloud Shell: menu Actions > Download > ~/.oci/config e ~/.oci/*.pem"
echo "    2) No PC: scripts\\instalar-oci-config-windows.ps1 -ConfigZip caminho-do-zip"
echo "    3) No PC: npm run snapshot:export && npm run backup:upload-oci"
