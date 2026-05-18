#!/usr/bin/env bash
# bootstrap.sh — Installation complète depuis une VM Ubuntu vierge
#
# Usage :
#   git clone https://github.com/Rovel-Coder/GestionTchap.git
#   bash GestionTchap/ansible/bootstrap.sh
#
# L'utilisateur n'a qu'à répondre aux questions posées au démarrage.
# Tout le reste est automatique.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VARS_FILE="$SCRIPT_DIR/inventory/group_vars/all/vars.yml"
VAULT_FILE="$SCRIPT_DIR/inventory/group_vars/all/vault.yml"
VAULT_PASS_FILE="$(mktemp)"
trap 'rm -f "$VAULT_PASS_FILE"' EXIT

# ── Couleurs ─────────────────────────────────────────────────────────────────
BOLD='\033[1m'; CYAN='\033[0;36m'; GREEN='\033[0;32m'; RED='\033[0;31m'; RESET='\033[0m'

# ── Vérifications préalables ─────────────────────────────────────────────────

if [[ $EUID -eq 0 ]]; then
  echo -e "${RED}Erreur : ne pas lancer ce script en root. Utiliser un compte avec sudo.${RESET}" >&2
  exit 1
fi

if ! sudo -n true 2>/dev/null; then
  echo -e "${RED}Ce compte doit avoir les droits sudo. Vérifiez votre configuration.${RESET}" >&2
  exit 1
fi

# ── Collecte des informations ─────────────────────────────────────────────────

echo ""
echo -e "${BOLD}=== Configuration de Gestion Personnel Tchap ===${RESET}"
echo ""

# URL du repo Git
read -rp "URL du repo Git (ex: https://github.com/MonOrg/GestionTchap.git) : " GIT_REPO
while [[ -z "$GIT_REPO" ]]; do
  read -rp "  → Obligatoire. URL du repo : " GIT_REPO
done

# URL publique de l'application
LOCAL_IP=$(hostname -I | awk '{print $1}')
read -rp "URL publique de l'application [http://${LOCAL_IP}:8088] : " APP_URI
APP_URI="${APP_URI:-http://${LOCAL_IP}:8088}"

# Mot de passe PostgreSQL
while true; do
  read -rsp "Mot de passe PostgreSQL (choisir un mot de passe fort) : " DB_PASS; echo
  read -rsp "Confirmer le mot de passe PostgreSQL : " DB_PASS2; echo
  [[ "$DB_PASS" == "$DB_PASS2" && -n "$DB_PASS" ]] && break
  echo -e "${RED}  → Les mots de passe ne correspondent pas ou sont vides. Réessayez.${RESET}"
done

# Mot de passe vault
echo ""
echo -e "${CYAN}Le mot de passe vault chiffre les secrets (DB, clés API).${RESET}"
echo -e "${CYAN}Notez-le : il sera nécessaire pour les mises à jour futures.${RESET}"
while true; do
  read -rsp "Mot de passe vault Ansible : " VAULT_PASS; echo
  read -rsp "Confirmer le mot de passe vault : " VAULT_PASS2; echo
  [[ "$VAULT_PASS" == "$VAULT_PASS2" && -n "$VAULT_PASS" ]] && break
  echo -e "${RED}  → Les mots de passe ne correspondent pas ou sont vides. Réessayez.${RESET}"
done

echo "$VAULT_PASS" > "$VAULT_PASS_FILE"
chmod 600 "$VAULT_PASS_FILE"

# ── Patch de vars.yml ─────────────────────────────────────────────────────────

echo ""
echo -e "${BOLD}=== [1/5] Configuration ===${RESET}"

sed -i "s|app_repo:.*|app_repo: ${GIT_REPO}|" "$VARS_FILE"
sed -i "s|app_default_uri:.*|app_default_uri: ${APP_URI}|" "$VARS_FILE"
sed -i "s|app_cors_origin:.*|app_cors_origin: ${APP_URI}|" "$VARS_FILE"

# Activer git_use_ssh si l'URL utilise SSH (git@...)
if [[ "$GIT_REPO" == git@* ]]; then
  sed -i "s|git_use_ssh:.*|git_use_ssh: true|" "$VARS_FILE"
  # Extraire le hostname (ex: github.com depuis git@github.com:...)
  GIT_HOST=$(echo "$GIT_REPO" | sed 's/git@\([^:]*\):.*/\1/')
  sed -i "s|git_host:.*|git_host: ${GIT_HOST}|" "$VARS_FILE"
fi

echo "  ✓ vars.yml configuré"

# ── Installation d'Ansible ───────────────────────────────────────────────────

echo ""
echo -e "${BOLD}=== [2/5] Installation d'Ansible ===${RESET}"
sudo apt-get update -qq
sudo apt-get install -y -qq ansible python3-pip
echo "  ✓ Ansible $(ansible --version | head -1 | awk '{print $NF}')"

# ── Collections Ansible ──────────────────────────────────────────────────────

echo ""
echo -e "${BOLD}=== [3/5] Collections Ansible ===${RESET}"
ansible-galaxy collection install -r "$SCRIPT_DIR/requirements.yml" --quiet
echo "  ✓ Collections installées"

# ── Génération et chiffrement des secrets ────────────────────────────────────

echo ""
echo -e "${BOLD}=== [4/5] Génération des secrets ===${RESET}"

APP_SECRET=$(python3 -c "import secrets, base64; print(base64.b64encode(secrets.token_bytes(32)).decode())")
TCHAP_KEY=$(python3 -c "import secrets; print(secrets.token_hex(32))")

cat > "$VAULT_FILE" << EOF
---
vault_db_password: "${DB_PASS}"
vault_app_secret: "${APP_SECRET}"
vault_tchap_service_key: "${TCHAP_KEY}"
EOF
chmod 600 "$VAULT_FILE"

ansible-vault encrypt --vault-password-file "$VAULT_PASS_FILE" "$VAULT_FILE"
echo "  ✓ Secrets générés et chiffrés"

# ── Setup VM ─────────────────────────────────────────────────────────────────

echo ""
echo -e "${BOLD}=== [5a/5] Configuration de la VM ===${RESET}"
ansible-playbook "$SCRIPT_DIR/playbooks/setup.yml" \
  --vault-password-file "$VAULT_PASS_FILE"

# ── Déploiement ──────────────────────────────────────────────────────────────

echo ""
echo -e "${BOLD}=== [5b/5] Déploiement de l'application ===${RESET}"
ansible-playbook "$SCRIPT_DIR/playbooks/deploy.yml" \
  --vault-password-file "$VAULT_PASS_FILE"

# ── Résumé ───────────────────────────────────────────────────────────────────

echo ""
echo -e "${GREEN}=========================================================${RESET}"
echo -e "${GREEN} Installation terminée avec succès.${RESET}"
echo -e "${GREEN} → Application : ${APP_URI}${RESET}"
echo -e "${GREEN} → Login initial : Sic / SicGestionTchap${RESET}"
echo -e "${GREEN} → Logs : docker compose -f /opt/gestion-tchap/docker-compose.prod.yml logs -f${RESET}"
echo -e "${GREEN}=========================================================${RESET}"
echo ""
echo -e "${CYAN}Conservez votre mot de passe vault — il sera demandé lors des mises à jour manuelles :${RESET}"
echo -e "${CYAN}  ansible-playbook ansible/playbooks/deploy.yml --ask-vault-pass${RESET}"
