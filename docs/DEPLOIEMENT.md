# Déploiement — Gestion Personnel Tchap

Deux approches sont disponibles selon votre infrastructure :

---

## Avec Docker

Couvre le développement local et la production sur VM via Ansible.
Tous les services (PHP, Nginx, PostgreSQL, bridge Tchap) tournent dans des containers.

→ **[DEPLOIEMENT-DOCKER.md](DEPLOIEMENT-DOCKER.md)**

| Mode | Quand |
|------|-------|
| Docker local | Développement, test rapide sur un poste |
| Ansible (recommandé pour la prod) | Serveur de production — Docker installé et mis à jour automatiquement |

---

## Sans Docker

Installation native sur Ubuntu 24.04 LTS : PHP-FPM, Nginx, PostgreSQL et Node.js directement sur le système.
À privilégier uniquement si votre infrastructure interdit Docker.

→ **[DEPLOIEMENT-VM.md](DEPLOIEMENT-VM.md)**

---

## Configuration avancée de la VM

Réglages complémentaires (PHP-FPM, PostgreSQL, Nginx, sauvegardes, supervision) :

→ **[VM_CONFIGURATION.md](VM_CONFIGURATION.md)**
