#!/usr/bin/env bash
# bootstrap.sh — Installation complète depuis une VM Ubuntu vierge
#
# Usage (depuis la VM, après avoir cloné le repo) :
#   bash ansible/bootstrap.sh
#
# Ce script installe tout sans intervention supplémentaire, sauf :
#   - le mot de passe PostgreSQL (votre choix)
#   - le mot de passe vault Ansible (à retenir pour les mises à jour futures)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ── Vérifications préalables ─────────────────────────────────────────────────

if [[ $EUID -eq 0 ]]; then
  echo "Erreur : ne pas lancer ce script en root. Utiliser un compte avec sudo." >&2
  exit 1
fi

if ! sudo -n true 2>/dev/null; then
  echo "Ce compte doit avoir les droits sudo. Vérifiez votre configuration." >&2
  exit 1
fi

# ── 1. Ansible ───────────────────────────────────────────────────────────────

echo ""
echo "=== [1/5] Installation d'Ansible ==="
sudo apt-get update -qq
sudo apt-get install -y -qq ansible python3-pip

# ── 2. Collections Ansible ───────────────────────────────────────────────────

echo ""
echo "=== [2/5] Installation des collections Ansible ==="
ansible-galaxy collection install -r "$SCRIPT_DIR/requirements.yml"

# ── 3. Secrets ───────────────────────────────────────────────────────────────

echo ""
echo "=== [3/5] Initialisation des secrets ==="
echo "→ Vous allez saisir le mot de passe PostgreSQL et le mot de passe vault."
ansible-playbook "$SCRIPT_DIR/playbooks/init-secrets.yml"

# ── 4. Configuration VM ──────────────────────────────────────────────────────

echo ""
echo "=== [4/5] Configuration de la VM (Docker, UFW, utilisateur deploy…) ==="
ansible-playbook "$SCRIPT_DIR/playbooks/setup.yml" --ask-vault-pass

# ── 5. Déploiement de l'application ─────────────────────────────────────────

echo ""
echo "=== [5/5] Déploiement de l'application ==="
ansible-playbook "$SCRIPT_DIR/playbooks/deploy.yml" --ask-vault-pass

# ── Résumé ───────────────────────────────────────────────────────────────────

LOCAL_IP=$(hostname -I | awk '{print $1}')
APP_PORT=$(grep 'app_port' "$SCRIPT_DIR/inventory/group_vars/all/vars.yml" | awk '{print $2}')

echo ""
echo "========================================================="
echo " Installation terminée avec succès."
echo " → Application : http://${LOCAL_IP}:${APP_PORT}"
echo " → Login initial : Sic / SicGestionTchap"
echo " → Logs : docker compose -f /opt/gestion-tchap/docker-compose.prod.yml logs -f"
echo "========================================================="
