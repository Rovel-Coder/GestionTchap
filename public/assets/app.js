/* ============================================================
   Gestion Personnel Tchap — app.js
   Alpine.js 3 — Interactivité côté client
   ============================================================ */

// ── Constantes métier ──────────────────────────────────────
const GRADE_CATEGORIES = {
  gav: ['Gendarme adjoint volontaire','Gendarme adjoint volontaire brigadier','Gendarme adjoint volontaire brigadier-chef','Gendarme adjoint volontaire maréchal des logis'],
  soo: ['Élève gendarme','Gendarme','Maréchal des logis-chef','Adjudant','Adjudant-chef','Major'],
  off: ['Aspirant','Sous-lieutenant','Lieutenant','Capitaine',"Chef d'escadron",'Lieutenant-colonel','Colonel','Général de brigade','Général de division',"Général de corps d'armée","Général d'armée"],
  civ: ['Civil(e)'],
};

const CAT_LABELS = { gav: 'GAV', soo: 'Sous-officiers', off: 'Officiers', civ: 'Civils' };

const SUBDIVISION_LABELS = {
  dept: 'Gendarmerie départementale', mobile: 'Gendarmerie mobile',
  grepub: 'Garde républicaine', air: "Gendarmerie de l'air et de l'espace",
  maritime: 'Gendarmerie maritime', cta: 'Corps technique et administratif',
};

const GALONS_MAP = {
  'Gendarme adjoint volontaire':               { dept: 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/1a/Gendarme_adjoint_volontaire_gendarmerie_d%C3%A9partementale.svg/60px-Gendarme_adjoint_volontaire_gendarmerie_d%C3%A9partementale.svg.png' },
  'Gendarme adjoint volontaire brigadier':     { dept: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/81/Brigadier_gendarme_adjoint_volontaire_gendarmerie_d%C3%A9partementale.svg/60px-Brigadier_gendarme_adjoint_volontaire_gendarmerie_d%C3%A9partementale.svg.png' },
  'Gendarme':                                  { dept: 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/11/Gendarme_gendarmerie_d%C3%A9partementale.svg/60px-Gendarme_gendarmerie_d%C3%A9partementale.svg.png', mobile: 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/de/Gendarme_gendarmerie_mobile.svg/60px-Gendarme_gendarmerie_mobile.svg.png' },
  'Maréchal des logis-chef':                   { dept: 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/ea/Mar%C3%A9chal_des_logis-chef_gendarmerie_d%C3%A9partementale.svg/60px-Mar%C3%A9chal_des_logis-chef_gendarmerie_d%C3%A9partementale.svg.png' },
  'Adjudant':                                  { dept: 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/ff/Adjudant_gendarmerie_d%C3%A9partementale.svg/60px-Adjudant_gendarmerie_d%C3%A9partementale.svg.png' },
  'Adjudant-chef':                             { dept: 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/19/Adjudant-chef_gendarmerie_d%C3%A9partementale.svg/60px-Adjudant-chef_gendarmerie_d%C3%A9partementale.svg.png' },
  'Major':                                     { dept: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/8c/Major_gendarmerie_d%C3%A9partementale.svg/60px-Major_gendarmerie_d%C3%A9partementale.svg.png' },
  'Aspirant':                                  { dept: 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/eb/Aspirant_gendarmerie_d%C3%A9partementale.svg/60px-Aspirant_gendarmerie_d%C3%A9partementale.svg.png' },
  'Sous-lieutenant':                           { dept: 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/be/Sous-lieutenant_gendarmerie_d%C3%A9partementale.svg/60px-Sous-lieutenant_gendarmerie_d%C3%A9partementale.svg.png' },
  'Lieutenant':                                { dept: 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/1d/Lieutenant_gendarmerie_d%C3%A9partementale.svg/60px-Lieutenant_gendarmerie_d%C3%A9partementale.svg.png' },
  'Capitaine':                                 { dept: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/39/Capitaine_gendarmerie_d%C3%A9partementale.svg/60px-Capitaine_gendarmerie_d%C3%A9partementale.svg.png' },
  "Chef d'escadron":                           { dept: "https://upload.wikimedia.org/wikipedia/commons/thumb/e/ef/Chef_d%27escadron_gendarmerie_d%C3%A9partementale.svg/60px-Chef_d%27escadron_gendarmerie_d%C3%A9partementale.svg.png" },
  'Lieutenant-colonel':                        { dept: 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/ff/Lieutenant-colonel_gendarmerie_d%C3%A9partementale.svg/60px-Lieutenant-colonel_gendarmerie_d%C3%A9partementale.svg.png' },
  'Colonel':                                   { dept: 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/db/Colonel_gendarmerie_d%C3%A9partementale.svg/60px-Colonel_gendarmerie_d%C3%A9partementale.svg.png' },
  'Général de brigade':                        { dept: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a8/G%C3%A9n%C3%A9ral_de_brigade_gendarmerie.svg/60px-G%C3%A9n%C3%A9ral_de_brigade_gendarmerie.svg.png' },
};

const ALL_GRADES = [
  ...GRADE_CATEGORIES.gav,
  ...GRADE_CATEGORIES.soo,
  ...GRADE_CATEGORIES.off,
  ...GRADE_CATEGORIES.civ,
];

// ── Utilitaires API ────────────────────────────────────────
async function apiFetch(url, options = {}) {
  const method = (options.method || 'GET').toUpperCase();
  const csrfHeaders = !['GET', 'HEAD', 'OPTIONS'].includes(method) && window.CSRF_TOKEN
    ? { 'X-CSRF-Token': window.CSRF_TOKEN }
    : {};
  const res = await fetch(url, {
    ...options,
    headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest', ...csrfHeaders, ...(options.headers || {}) },
  });
  if (res.status === 204) return null;
  let data;
  try {
    data = await res.json();
  } catch (_) {
    throw new Error(`HTTP ${res.status}`);
  }
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

function toast(message, type = 'info') {
  window.dispatchEvent(new CustomEvent('toast', { detail: { message, type } }));
}

// Dérive le homeserver Tchap depuis un domaine email.
// Vérifie d'abord la liste configurée (window.TCHAP_SERVERS), puis dérivation algorithmique.
// ex: gendarmerie.interieur.gouv.fr → agent.interieur.tchap.gouv.fr
//     diplomatie.gouv.fr            → agent.diplomatie.tchap.gouv.fr
function domainToTchapHomeserver(domain) {
  domain = (domain || '').trim().toLowerCase();

  // 1. Chercher dans la liste configurée (TCHAP_SERVERS injectée par le serveur)
  const servers = window.TCHAP_SERVERS || [];
  for (const srv of servers) {
    const domains = (srv.domains || '').split(',').map(d => d.trim().toLowerCase()).filter(Boolean);
    for (const d of domains) {
      if (domain === d || domain.endsWith('.' + d)) {
        // Extraire le server_name Matrix depuis l'URL homeserver
        // ex: https://matrix.agent.diplomatie.tchap.gouv.fr → agent.diplomatie.tchap.gouv.fr
        try {
          const hn = new URL(srv.homeserver).hostname;
          return hn.startsWith('matrix.') ? hn.slice('matrix.'.length) : hn;
        } catch (_) { /* URL invalide, continuer */ }
      }
    }
  }

  // 2. Dérivation algorithmique pour les domaines .gouv.fr non configurés
  if (domain.endsWith('.gouv.fr')) {
    const withoutGouv = domain.slice(0, -'.gouv.fr'.length);
    const parts = withoutGouv.split('.');
    return `agent.${parts[parts.length - 1]}.tchap.gouv.fr`;
  }
  return 'agent.interieur.tchap.gouv.fr';
}

// Convertit une adresse email Tchap en Matrix ID
// ex: prenom.nom@gendarmerie.interieur.gouv.fr → @prenom.nom-gendarmerie.interieur.gouv.fr:agent.interieur.tchap.gouv.fr
function mailToTchapId(email) {
  email = (email || '').trim().toLowerCase();
  const at = email.indexOf('@');
  if (at < 1) return '';
  const local  = email.slice(0, at);
  const domain = email.slice(at + 1);
  return `@${local}-${domain}:${domainToTchapHomeserver(domain)}`;
}

function parseCsvLine(line, sep) {
  const result = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { inQuotes = !inQuotes; continue; }
    if (ch === sep && !inQuotes) { result.push(field.trim()); field = ''; continue; }
    field += ch;
  }
  result.push(field.trim());
  return result;
}

function parseCsv(text) {
  // Supprimer le BOM UTF-8 éventuel
  const clean = text.replace(/^﻿/, '');
  const lines = clean.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return [];
  // Détection automatique du séparateur : ';' si plus fréquent que ',' sur la première ligne
  const firstLine = lines[0];
  const sep = (firstLine.split(';').length > firstLine.split(',').length) ? ';' : ',';
  const headers = parseCsvLine(firstLine, sep).map(h => h.trim());
  return lines.slice(1).map(line => {
    const vals = parseCsvLine(line, sep);
    const obj = {};
    headers.forEach((h, i) => { obj[h] = vals[i] || ''; });
    return obj;
  });
}

// ── Composant racine ───────────────────────────────────────
function appRoot() {
  return {
    appReady: false,

    // ── Sync en arrière-plan ──────────────────────────────────────────────
    syncJob: null,       // { jobId, status, total, done, currentSalon, invited, reinvited, kicked, errors }
    _syncPollTimer: null,

    init() {
      this.appReady = true;
      // Reprendre un éventuel job interrompu (rechargement de page)
      const saved = sessionStorage.getItem('syncJobId');
      if (saved) this.startSyncPoll(saved);
    },

    // Démarre une sync en arrière-plan et lance le polling
    async startBackgroundSync(salonIds, agentIds = []) {
      try {
        const r = await apiFetch('/api/tchap/sync/start', {
          method: 'POST',
          body: JSON.stringify({ salonIds, agentIds }),
        });
        if (!r?.jobId) throw new Error('Pas de jobId dans la réponse');
        sessionStorage.setItem('syncJobId', r.jobId);
        this.syncJob = { jobId: r.jobId, status: 'pending', total: salonIds.length, done: 0, currentSalon: null, invited: 0, reinvited: 0, kicked: 0, errors: [] };
        this.startSyncPoll(r.jobId);
        return r.jobId;
      } catch (e) {
        toast(`Erreur démarrage sync : ${e.message}`, 'error');
        return null;
      }
    },

    startSyncPoll(jobId) {
      this.stopSyncPoll();
      this._syncPollTimer = setInterval(() => this.pollSyncJob(jobId), 2000);
      // Premier poll immédiat
      this.pollSyncJob(jobId);
    },

    stopSyncPoll() {
      if (this._syncPollTimer) { clearInterval(this._syncPollTimer); this._syncPollTimer = null; }
    },

    async pollSyncJob(jobId) {
      try {
        const r = await apiFetch(`/api/tchap/sync/progress/${encodeURIComponent(jobId)}`);
        this.syncJob = {
          jobId,
          status:       r.status,
          total:        r.total       ?? 0,
          done:         r.done        ?? 0,
          currentSalon: r.current_salon ?? null,
          invited:      r.invited     ?? 0,
          reinvited:    r.reinvited   ?? 0,
          kicked:       r.kicked      ?? 0,
          errors:       r.errors      ?? [],
        };
        if (r.status === 'done' || r.status === 'error') {
          this.stopSyncPoll();
          sessionStorage.removeItem('syncJobId');
          if (r.status === 'done') {
            const reinvMsg = this.syncJob.reinvited > 0 ? `, ${this.syncJob.reinvited} ré-invité(s)` : '';
            toast(`Sync terminée — ${this.syncJob.invited} invité(s)${reinvMsg}, ${this.syncJob.kicked} expulsé(s)${this.syncJob.errors.length ? ` — ${this.syncJob.errors.length} erreur(s)` : ''}`,
              this.syncJob.errors.length ? 'error' : 'success');
          } else {
            toast('Erreur pendant la synchronisation', 'error');
          }
          // Garder le widget visible 8 secondes après la fin
          setTimeout(() => { this.syncJob = null; }, 8000);
        }
      } catch (_) { /* réseau, on réessaie au prochain tick */ }
    },

    closeSyncWidget() {
      this.stopSyncPoll();
      sessionStorage.removeItem('syncJobId');
      this.syncJob = null;
    },

    get syncProgress() {
      if (!this.syncJob || !this.syncJob.total) return 0;
      return Math.round((this.syncJob.done / this.syncJob.total) * 100);
    },
  };
}

// ── Toast Manager ──────────────────────────────────────────
let _toastCounter = 0; // compteur global pour éviter les doublons de clé x-for

function toastManager() {
  return {
    toasts: [],
    show({ message, type = 'info' }) {
      const id = ++_toastCounter; // toujours unique, même si plusieurs toasts en même milliseconde
      this.toasts.push({ id, message, type, visible: true });
      setTimeout(() => this.dismiss(id), 4000);
    },
    dismiss(id) {
      const t = this.toasts.find(t => t.id === id);
      if (t) t.visible = false;
      setTimeout(() => { this.toasts = this.toasts.filter(t => t.id !== id); }, 400);
    },
  };
}

// ── Vue Personnel ──────────────────────────────────────────
function personnelView() {
  return {
    personnel: [],
    salons:    [],
    unites:    [],
    loading:   true,
    search:    '',
    filtersOpen: false,
    filters:   { categorie: {}, statut: {}, unite: {}, salons: {} },
    page:      1,
    perPage:   10,
    modalOpen: false,
    modalMode: 'create',
    modalError: null,
    saving:    false,
    deleteTarget:      null,
    deleteBulkIds:     [],
    selectMode:        false,
    selectedPersonnel: [],
    importOpen: false,
    csvPreview: [],
    csvData:    [],
    importError: null,
    importing:  false,
    form: {},
    mailToMatrixId(mail) {
        if (!mail || !mail.includes('@')) return '';
        return mailToTchapId(mail);
    },

    csvRows:      [],
    csvImporting: false,
    csvModalOpen: false,

    get allGrades() { return ALL_GRADES; },

    async load() {
      this.loading = true;
      try {
        const [p, s, u] = await Promise.all([
          apiFetch('/api/personnel'),
          apiFetch('/api/salons'),
          apiFetch('/api/unites'),
        ]);
        this.personnel = p || [];
        this.salons    = s || [];
        this.unites    = u || [];
      } catch (e) {
        toast(e.message, 'error');
      }
      this.loading = false;
    },

    get filtered() {
      let list = this.personnel;
      const q = this.search.toLowerCase();
      if (q) {
        list = list.filter(a =>
          [a.Nom, a.Prenom, a.Grade, a.Mail, a.NiGend, a.user_id]
            .some(v => (v || '').toLowerCase().includes(q))
        );
      }
      if (Object.keys(this.filters.categorie).length) {
        list = list.filter(a => {
          const cat = this.getCategorie(a.Grade);
          return this.filters.categorie[cat];
        });
      }
      if (Object.keys(this.filters.statut).length) {
        list = list.filter(a => this.filters.statut[(a.Statut || 'actif').toLowerCase()]);
      }
      if (Object.keys(this.filters.unite).length) {
        list = list.filter(a => (a.Unite || []).some(uid => this.filters.unite[uid]));
      }
      if (this.filters.salons['avec']) {
        list = list.filter(a => this.getSalonsForAgent(a).length > 0);
      } else if (this.filters.salons['sans']) {
        list = list.filter(a => this.getSalonsForAgent(a).length === 0);
      }
      return list;
    },

    get paginated() {
      const start = (this.page - 1) * this.perPage;
      return this.filtered.slice(start, start + this.perPage);
    },

    get totalPages() {
      return Math.max(1, Math.ceil(this.filtered.length / this.perPage));
    },

    get visiblePages() {
      const total = this.totalPages;
      const cur = this.page;
      if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
      if (cur <= 4) return [1, 2, 3, 4, 5, '...', total];
      if (cur >= total - 3) return [1, '...', total - 4, total - 3, total - 2, total - 1, total];
      return [1, '...', cur - 1, cur, cur + 1, '...', total];
    },

    get hasActiveFilters() {
      return Object.values(this.filters).some(f => Object.keys(f).length > 0);
    },

    get activeFilterCount() {
      return Object.values(this.filters).reduce((n, f) => n + Object.keys(f).length, 0);
    },

    toggleFilter(type, val, active) {
      if (active) this.filters[type] = { ...this.filters[type], [val]: true };
      else { const f = { ...this.filters[type] }; delete f[val]; this.filters[type] = f; }
      this.page = 1;
    },

    clearFilters() { this.filters = { categorie: {}, statut: {}, unite: {}, salons: {} }; },

    getCategorie(grade) {
      for (const [cat, grades] of Object.entries(GRADE_CATEGORIES)) {
        if (grades.includes(grade)) return cat;
      }
      return 'civ';
    },

    catLabel(cat) { return CAT_LABELS[cat] || cat; },
    statutLabel(s) {
      const m = { actif: 'Actif', reserve: 'Réserve', admin_civil: 'Admin Civil', admin_militaire: 'Admin Militaire' };
      return m[(s || 'actif').toLowerCase()] || s || 'Actif';
    },
    subdivLabel(s) { return SUBDIVISION_LABELS[s] || s || '—'; },

    countByCategorie(cat) {
      const grades = GRADE_CATEGORIES[cat] || [];
      return this.personnel.filter(a => grades.includes(a.Grade)).length;
    },
    countByStatut(s) {
      return this.personnel.filter(a => (a.Statut || 'actif').toLowerCase() === s).length;
    },
    countByUnite(uid) {
      return this.personnel.filter(a => (a.Unite || []).includes(Number(uid))).length;
    },

    getUniteName(id) {
      const u = this.unites.find(u => u.id === Number(id));
      return u ? u.Nom : `#${id}`;
    },

    getSalonsForAgent(agent) {
      const seen = {};
      (agent.Unite || []).forEach(uid => {
        const u = this.unites.find(u => u.id === Number(uid));
        if (u) (u.Salons || []).forEach(sid => { seen[sid] = true; });
      });
      (agent.Salons_Extra || []).forEach(sid => { seen[sid] = true; });
      return Object.keys(seen).map(Number);
    },

    getSalonsCount(agent) {
      return this.getSalonsForAgent(agent).length;
    },

    getAgentSalons(agent) {
      return this.getSalonsForAgent(agent)
        .map(sid => this.salons.find(s => s.id === Number(sid)))
        .filter(Boolean);
    },

    getGalon(agent) {
      const g = agent.Grade;
      const subdiv = (agent.Subdivision || 'dept').toLowerCase();
      return GALONS_MAP[g]?.[subdiv] || GALONS_MAP[g]?.dept || '';
    },

    openModal(mode, agent = null) {
      this.modalMode  = mode;
      this.modalError = null;
      this.form = agent ? { ...agent } : {
        NiGend: '', Nom: '', Prenom: '', Grade: '', Mail: '', user_id: '',
        Role: 'lecteur', Statut: 'actif', Subdivision: '',
        Unite: [], Salons_Extra: [],
      };
      this.modalOpen = true;
    },

    closeModal() { this.modalOpen = false; this.modalError = null; },

    toggleUnite(uid, checked) {
      if (!this.form.Unite) this.form.Unite = [];
      if (checked) this.form.Unite = [...this.form.Unite, uid];
      else this.form.Unite = this.form.Unite.filter(id => id !== uid);
    },

    toggleSalonExtra(sid, checked) {
      if (!this.form.Salons_Extra) this.form.Salons_Extra = [];
      if (checked) this.form.Salons_Extra = [...this.form.Salons_Extra, sid];
      else this.form.Salons_Extra = this.form.Salons_Extra.filter(id => id !== sid);
    },

    // Convertit une adresse email Tchap en Matrix ID si nécessaire
    mailToMatrixId(val) {
      if (!val) return val;
      val = val.trim();
      if (val.startsWith('@')) return val;  // déjà un Matrix ID
      if (!val.includes('@')) return val;   // ni email ni Matrix ID, laisser tel quel
      return mailToTchapId(val);
    },

    async save() {
      this.saving = true;
      this.modalError = null;
      try {
        const isEdit  = this.modalMode !== 'create';
        const agentId = this.form.id;
        // Normaliser le user_id avant envoi (au cas où le blur n'a pas été déclenché)
        if (this.form.user_id) {
          this.form.user_id = this.mailToMatrixId(this.form.user_id);
        }
        const userId  = this.form.user_id;
        const url     = isEdit ? `/api/personnel/${agentId}` : '/api/personnel';
        const method  = isEdit ? 'PATCH' : 'POST';
        const saved   = await apiFetch(url, { method, body: JSON.stringify(this.form) });
        toast(isEdit ? 'Agent mis à jour' : 'Agent ajouté', 'success');

        // ── Sync Tchap : inviter l'agent dans ses salons attendus ──
        if (userId) {
          const finalId   = isEdit ? agentId : saved?.id;
          const salonIds  = [...new Set([
            ...(this.form.Salons_Extra || []),
            ...(this.form.Unite || []).flatMap(uid => {
              const u = this.unites.find(u => u.id === Number(uid));
              return u ? (u.Salons || []) : [];
            }),
          ].map(Number))].filter(Boolean);

          if (salonIds.length && finalId) {
            apiFetch('/api/tchap/apply', {
              method: 'POST',
              body: JSON.stringify({ salonIds, agentIds: [finalId] }),
            }).then(r => {
              if (r?.invited > 0) toast(`${r.invited} invitation(s) Tchap envoyée(s)`, 'success');
              if (r?.errors?.length) r.errors.forEach(e => toast(`Tchap${e.user ? ' (' + e.user + ')' : ''} : ${e.error}`, 'error'));
            }).catch(() => {});
          }
        }

        this.closeModal();
        await this.load();
      } catch (e) {
        this.modalError = e.message;
      }
      this.saving = false;
    },

    toggleSelectMode() {
      this.selectMode = !this.selectMode;
      if (!this.selectMode) this.selectedPersonnel = [];
    },
    toggleSelectAgent(id) {
      if (this.selectedPersonnel.includes(id)) this.selectedPersonnel = this.selectedPersonnel.filter(i => i !== id);
      else                                      this.selectedPersonnel = [...this.selectedPersonnel, id];
    },
    selectAll()      { this.selectedPersonnel = this.filtered.map(a => a.id); },
    clearSelection() { this.selectedPersonnel = []; },

    confirmDelete(agent) { this.deleteTarget = agent; this.deleteBulkIds = []; },
    confirmBulkDelete()  { this.deleteTarget = null;  this.deleteBulkIds = [...this.selectedPersonnel]; },
    cancelDelete()       { this.deleteTarget = null;  this.deleteBulkIds = []; },

    async deleteAgent() {
      this.saving = true;
      try {
        if (this.deleteTarget) {
          await apiFetch(`/api/personnel/${this.deleteTarget.id}`, { method: 'DELETE' });
          toast('Agent supprimé', 'success');
        } else {
          const r = await apiFetch('/api/personnel', {
            method: 'DELETE',
            body: JSON.stringify({ ids: this.deleteBulkIds }),
          });
          toast(`${r.deleted} agent(s) supprimé(s)`, 'success');
          this.selectedPersonnel = [];
          this.selectMode        = false;
        }
        this.cancelDelete();
        await this.load();
      } catch (e) {
        toast(e.message, 'error');
      }
      this.saving = false;
    },

    openImportCsv() { this.importOpen = true; this.csvPreview = []; this.importError = null; },

    loadCsv(event) {
      const file = event.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = e => {
        this.csvData    = parseCsv(e.target.result);
        this.csvPreview = this.csvData;
      };
      reader.readAsText(file, 'UTF-8');
    },

    async importCsv() {
      this.importing  = true;
      this.importError = null;
      let ok = 0, errors = 0;
      for (const row of this.csvData) {
        try {
          await apiFetch('/api/personnel', { method: 'POST', body: JSON.stringify(row) });
          ok++;
        } catch (e) {
          errors++;
          if (!this.importError) this.importError = e.message;
        }
      }
      toast(`Import terminé : ${ok} ajouté(s), ${errors} erreur(s)`, errors ? 'error' : 'success');
      this.importing  = false;
      this.importOpen = false;
      await this.load();
    },

    loadCsvFile(event) {
      const file = event.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = e => {
        const rows = parseCsv(e.target.result);
        const emailDomain = 'gendarmerie.interieur.gouv.fr';
        this.csvRows = rows.map(r => {
          let email  = (r.Mail || r.Email || r.email || r['Adresse mail'] || r['Adresse e-mail'] || r['E-mail'] || '').trim().toLowerCase();
          let prenom = r.Prenom || r.prenom || r['Prénom'] || r['prénom'] || '';
          let nom    = r.Nom    || r.nom    || r['Nom de famille'] || '';
          let grade  = r.Grade  || r.grade  || r['Grade'] || '';
          let userId = r.user_id || r['Identifiant Matrix'] || r['ID Tchap'] || '';
          // user_id → email : @prenom.nom-domain.tld:homeserver → prenom.nom@domain.tld
          if (!email && userId && userId.startsWith('@') && userId.includes(':')) {
            const localPart = userId.slice(1).split(':')[0];
            const lastHyphen = localPart.lastIndexOf('-');
            if (lastHyphen > 0) {
              email = localPart.substring(0, lastHyphen) + '@' + localPart.substring(lastHyphen + 1);
            }
          }
          // email → user_id
          if (!userId && email) {
            userId = mailToTchapId(email);
          }
          // Extraire prénom depuis l'email si manquant (même si nom déjà connu)
          if (!prenom && email.includes('@')) {
            const local = email.split('@')[0];
            const parts = local.split('.');
            if (parts.length >= 2) {
              prenom = parts[0].charAt(0).toUpperCase() + parts[0].slice(1);
              if (!nom) nom = parts.slice(1).join(' ').toUpperCase();
            }
          }
          // Matcher unité par nom
          const uniteNom = (r['Unité'] || r["Unité d'affectation"] || r.Unite || r.unite || r.Groupe || '').trim();
          const matchedUnite = uniteNom
            ? this.unites.find(u => u.Nom.toLowerCase() === uniteNom.toLowerCase() || (u.code && u.code.toLowerCase() === uniteNom.toLowerCase()))
            : null;
          // Salons_Extra : liste de noms séparés par virgule dans le CSV
          const salonRaw = (r.Salons_Extra || r['Salons_Extra'] || r.Salon || r.Salons || r['Salon assigné'] || r.salon || '').trim();
          const salonNoms = salonRaw ? salonRaw.split(',').map(s => s.trim()).filter(Boolean) : [];
          const matchedSalons = salonNoms
            .map(nom => this.salons.find(s => s.Nom.toLowerCase() === nom.toLowerCase()))
            .filter(Boolean);
          const matchedSalonIds = matchedSalons.map(s => s.id);
          const valid = !!email;
          const existingAgent = valid ? (this.personnel.find(a => (a.Mail || '').toLowerCase() === email) || null) : null;
          const raw = [r.NiGend, r['Prénom'] || r.Prenom, r.Nom, r.Mail || r.Email].filter(Boolean).join(' ') || Object.values(r).find(v => v) || '(vide)';
          return {
            ...r,
            Mail: email, Prenom: prenom, Nom: nom, Grade: grade || r.Grade || '', user_id: userId, raw,
            Salons_Extra: matchedSalonIds,
            _uniteId:    matchedUnite?.id || null,
            _uniteNom:   uniteNom,
            _salonNom:   salonNoms.join(', '),
            _salonFound: matchedSalonIds.length,
            _salonTotal: salonNoms.length,
            valid, existingAgent,
          };
        });
        this.importOpen = true;
      };
      reader.readAsText(file, 'UTF-8');
    },

    get csvToAdd() {
      return this.csvRows.filter(r => r.valid && !r.existingAgent);
    },

    get csvToUpdate() {
      return this.csvRows.filter(r => r.valid && r.existingAgent);
    },

    get csvInvalid() {
  return (this.csvRows || []).filter(r => r && !r.valid);
},

    async confirmCsvImport() {
      this.csvImporting = true;
      let ok = 0, errors = 0, firstError = null;

      // Étape 1 : créer les unités manquantes (noms du CSV absents de this.unites)
      const uniteNomsManquants = [...new Set(
        this.csvRows.filter(r => r.valid && r._uniteNom && !r._uniteId).map(r => r._uniteNom)
      )];
      for (const nom of uniteNomsManquants) {
        try {
          const unite = await apiFetch('/api/unites', { method: 'POST', body: JSON.stringify({ Nom: nom }) });
          if (unite?.id) {
            this.unites.push(unite);
            this.csvRows.forEach(r => { if (r._uniteNom === nom) r._uniteId = unite.id; });
          }
        } catch (_) { /* non sysadmin ou autre erreur : on continue sans unité */ }
      }

      // Étape 2 : importer les agents
      for (const row of this.csvRows.filter(r => r.valid && !r.existingAgent)) {
        try {
          const { valid, existingAgent, _uniteId, _uniteNom, _salonNom, _salonFound, _salonTotal, ...data } = row;
          if (_uniteId) data.Unite = [_uniteId];
          const created = await apiFetch('/api/personnel', { method: 'POST', body: JSON.stringify(data) });
          if (_uniteId && created?.id) {
            await apiFetch(`/api/personnel/${created.id}/unites`, {
              method: 'POST',
              body: JSON.stringify({ unite_id: _uniteId, type: 'reel' }),
            }).catch(e => { firstError = firstError || `Unité : ${e.message}`; });
          }
          ok++;
        } catch (e) { errors++; firstError = firstError || e.message; }
      }
      for (const row of this.csvRows.filter(r => r.valid && r.existingAgent)) {
        try {
          const { valid, existingAgent, _uniteId, _uniteNom, _salonNom, _salonFound, _salonTotal, ...data } = row;
          if (_uniteId) data.Unite = [_uniteId];
          await apiFetch(`/api/personnel/${existingAgent.id}`, { method: 'PATCH', body: JSON.stringify(data) });
          if (_uniteId) {
            await apiFetch(`/api/personnel/${existingAgent.id}/unites`, {
              method: 'POST',
              body: JSON.stringify({ unite_id: _uniteId, type: 'reel' }),
            }).catch(e => { firstError = firstError || `Unité : ${e.message}`; });
          }
          ok++;
        } catch (e) { errors++; firstError = firstError || e.message; }
      }
      const msg = `Import terminé : ${ok} traité(s)${errors ? ', ' + errors + ' erreur(s)' : ''}`;
      toast(errors ? `${msg} — ${firstError}` : msg, errors ? 'error' : 'success');
      this.csvImporting = false;
      this.closeCsvModal();
      await this.load();
    },

    closeCsvModal() { this.importOpen = false; this.csvRows = []; },

    async syncFromTchap() {
      toast('Synchronisation Tchap → DB en cours…', 'info');
      try {
        const r = await apiFetch('/api/tchap/sync-all', { method: 'POST' });
        toast(`Sync terminée : ${r.updated} mis à jour${r.errors?.length ? ', ' + r.errors.length + ' erreur(s)' : ''}`, r.errors?.length ? 'error' : 'success');
        await this.load();
      } catch (e) {
        toast(e.message, 'error');
      }
    },

    async applyToTchap() {
      toast('Application DB → Tchap en cours…', 'info');
      // Normaliser les user_id en base avant le sync (email → Matrix ID)
      await apiFetch('/api/personnel/normalize-user-ids', { method: 'POST' }).catch(() => {});
      const salonIds = this.salons.map(s => s.id);
      try {
        const r = await apiFetch('/api/tchap/apply', { method: 'POST', body: JSON.stringify({ salonIds }) });
        const type = (r.errors && r.errors.length) ? 'error' : 'success';
        const reinvMsg = r.reinvited > 0 ? `, ${r.reinvited} ré-invité(s)` : '';
        toast(`Terminé : ${r.invited} invité(s)${reinvMsg}, ${r.kicked} expulsé(s)${r.errors && r.errors.length ? ` — ${r.errors.length} erreur(s)` : ''}`, type);
        if (r.errors && r.errors.length) {
          r.errors.forEach(err => toast(`${err.action ?? 'erreur'} ${err.user ?? ''} (${err.salon ?? ''}) : ${err.error}`, 'error'));
        }
      } catch (e) {
        toast(e.message, 'error');
      }
    },
  };
}

// ── Vue Salons ─────────────────────────────────────────────
function salonView() {
  return {
    salons:     [],
    unites:     [],
    personnel:  [],
    loading:    true,
    typeFilter: 'Tous',
    page:       1,
    perPage:    12,
    modalOpen:  false,
    modalMode:  'create',
    modalError: null,
    saving:     false,
    syncing:          false,
    // Suppression multi-étapes (single ou bulk)
    deleteStep:       0,      // 0=fermé 1=confirm 2=kicking 3=confirm bot 4=confirm app delete
    deleteTarget:     null,   // salon unique
    deleteBulkIds:    [],     // ids pour suppression en masse
    deleteKickResult: null,   // message résumé du kick
    // Sélection multiple
    selectMode:       false,
    selectedSalons:   [],
    // Modérateurs
    moderatorsOpen:   false,
    moderatorsSalon:  null,
    moderatorsList:   [],
    moderatorsLoading: false,
    moderatorsError:  null,
    // Autorisations
    permissionsOpen:   false,
    permissionsSalon:  null,
    permissionsData:   null,
    permissionsLoading: false,
    permissionsError:  null,
    permissionsSaving: false,
    // Définition des champs de permission
    permissionsTopFields: [
      { key: 'events_default', label: 'Envoyer des messages', default: 0 },
      { key: 'invite',         label: 'Inviter des membres',  default: 50 },
      { key: 'kick',           label: 'Expulser des membres', default: 50 },
      { key: 'ban',            label: 'Bannir des membres',   default: 50 },
      { key: 'redact',         label: 'Supprimer des messages (redact)', default: 50 },
    ],
    permissionsEventFields: [
      { key: 'm.room.name',              label: 'Modifier le nom du salon',          default: 50  },
      { key: 'm.room.avatar',            label: 'Modifier l\'avatar du salon',        default: 50  },
      { key: 'm.room.topic',             label: 'Modifier la description (topic)',    default: 100 },
      { key: 'm.room.canonical_alias',   label: 'Modifier l\'alias du salon',         default: 50  },
      { key: 'm.room.pinned_events',     label: 'Épingler des messages',             default: 100 },
      { key: 'm.room.history_visibility',label: 'Modifier la visibilité de l\'historique', default: 100 },
      { key: 'm.room.power_levels',      label: 'Modifier les autorisations',        default: 100 },
      { key: 'm.room.server_acl',        label: 'Modifier les ACL serveur',          default: 100 },
      { key: 'm.room.tombstone',         label: 'Mettre le salon en tombstone',      default: 100 },
      { key: 'm.reaction',               label: 'Envoyer des réactions',             default: 0   },
      { key: 'm.room.redaction',         label: 'Envoyer des événements de redaction', default: 0 },
      { key: 'im.vector.modular.widgets',label: 'Gérer les widgets',                 default: 100 },
    ],
    // Ajout de membres
    addMembersTarget:   null,
    addMembersTab:      'personnel', // 'personnel' | 'manual' | 'csv'
    addMembersInput:    '',
    addMembersSearch:   '',
    addMembersSelected: [],          // IDs personnel sélectionnés
    addMembersCsvRows:  [],          // lignes parsées depuis CSV
    addMembersCsvError: null,
    addMembersError:    null,
    addMembersResult:   null,
    importOpen: false,
    csvPreview: [],
    csvData:    [],
    importError: null,
    importing:  false,
    form:       {},

    async load() {
      this.loading = true;
      try {
        const [s, p, u] = await Promise.all([apiFetch('/api/salons'), apiFetch('/api/personnel'), apiFetch('/api/unites')]);
        this.salons    = (s || []).map(salon => ({ ...salon, _memberCount: undefined, _loading: false, _error: null }));
        this.personnel = p || [];
        this.unites    = u || [];
      } catch (e) {
        toast(e.message, 'error');
      }
      this.loading = false;
    },

    get filtered() {
      if (this.typeFilter === 'Tous') return this.salons;
      return this.salons.filter(s => s.Type === this.typeFilter);
    },

    get paginated() {
      return this.filtered.slice((this.page - 1) * this.perPage, this.page * this.perPage);
    },

    get totalPages() {
      return Math.max(1, Math.ceil(this.filtered.length / this.perPage));
    },

    get visiblePages() {
      const total = this.totalPages;
      const cur = this.page;
      if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
      if (cur <= 4) return [1, 2, 3, 4, 5, '...', total];
      if (cur >= total - 3) return [1, '...', total - 4, total - 3, total - 2, total - 1, total];
      return [1, '...', cur - 1, cur, cur + 1, '...', total];
    },

    getAgentCount(salonId) {
      return this.personnel.filter(a => {
        const extras = a.Salons_Extra || [];
        return extras.includes(salonId) || extras.includes(String(salonId));
      }).length;
    },

    async fetchMembers(salon) {
      if (!salon.room_id) { toast('room_id non configuré', 'error'); return; }
      salon._loading = true;
      salon._error   = null;
      try {
        const data    = await apiFetch(`/api/tchap/members/${encodeURIComponent(salon.room_id)}`);
        const raw     = Array.isArray(data) ? data : (data.members || []);
        const botId   = (Array.isArray(data) ? '' : data.botUserId) || '';
        // Stocker {userId, status} pour distinguer join / invite
        salon._members     = raw.map(m => ({
          userId: (m.state_key || m.userId || m.user_id || '').toLowerCase(),
          status: m.content?.membership ?? m.membership ?? 'join',
        })).filter(m => m.userId);
        salon._memberCount = salon._members.filter(m => m.status === 'join').length;
        salon._inviteCount = salon._members.filter(m => m.status === 'invite').length;
        salon._memberIds   = salon._members.map(m => m.userId);
        salon._botUserId   = botId || null;
        salon._botPresent  = botId ? salon._memberIds.includes(botId.toLowerCase()) : undefined;
      } catch (e) {
        salon._error = e.message;
      }
      salon._loading = false;
    },

    getMemberStatus(person) {
      const uid = (person.user_id || '').toLowerCase();
      if (!uid || !this.addMembersTarget?._members) return null;
      const found = this.addMembersTarget._members.find(m => m.userId === uid);
      return found ? found.status : null;
    },

    async kickMember(salon, userId) {
      if (!confirm(`Expulser ${userId} du salon ?`)) return;
      try {
        await apiFetch(`/api/tchap/kick`, {
          method: 'POST',
          body: JSON.stringify({ roomId: salon.room_id, userId, reason: 'Expulsion depuis la gestion' }),
        });
        salon._members     = (salon._members || []).filter(m => m.userId !== userId.toLowerCase());
        salon._memberIds   = salon._members.map(m => m.userId);
        salon._memberCount = salon._members.filter(m => m.status === 'join').length;
        salon._inviteCount = salon._members.filter(m => m.status === 'invite').length;
        toast(`${userId} expulsé`, 'success');
      } catch (e) {
        toast(e.message, 'error');
      }
    },

    async reinviteSalon(salon) {
      if (!salon.room_id) return;
      salon._loading = true;
      try {
        const r = await apiFetch('/api/tchap/reinvite', {
          method: 'POST',
          body: JSON.stringify({ roomId: salon.room_id }),
        });
        if (r.reinvited > 0) {
          toast(`${r.reinvited} invitation(s) renouvelée(s) dans "${salon.Nom}"`, 'success');
          // Rafraîchir le compteur
          await this.fetchMembers(salon);
        } else {
          toast(`Aucune invitation en attente dans "${salon.Nom}"`, 'info');
        }
        if (r.errors?.length) r.errors.forEach(e => toast(`${e.user}: ${e.error}`, 'error'));
      } catch (e) {
        toast(e.message, 'error');
      }
      salon._loading = false;
    },

    getUniteIdsForSalon(salonId) {
      return this.unites
        .filter(u => (u.Salons || []).includes(Number(salonId)))
        .map(u => u.id);
    },

    toggleUnite(uniteId, checked) {
      if (!this.form._uniteIds) this.form._uniteIds = [];
      if (checked) this.form._uniteIds = [...this.form._uniteIds, uniteId];
      else         this.form._uniteIds = this.form._uniteIds.filter(id => id !== uniteId);
    },

    openModal(mode, salon = null) {
      this.modalMode  = mode;
      this.modalError = null;
      const base = salon ? { ...salon } : { Nom: '', Description: '', Type: '', room_id: '' };
      base._uniteIds        = salon ? this.getUniteIdsForSalon(salon.id) : [];
      base._initialUniteIds = [...base._uniteIds];
      base._uniteSearch     = '';
      this.form = base;
      this.modalOpen = true;
    },

    closeModal() { this.modalOpen = false; },

    async save() {
      this.saving = true;
      this.modalError = null;
      try {
        const url    = this.modalMode === 'create' ? '/api/salons' : `/api/salons/${this.form.id}`;
        const method = this.modalMode === 'create' ? 'POST' : 'PATCH';
        const saved  = await apiFetch(url, { method, body: JSON.stringify(this.form) });

        // Si création sans room_id → tenter la création sur Tchap automatiquement
        if (this.modalMode === 'create' && saved?.id && !saved?.room_id) {
          try {
            await apiFetch(`/api/salons/${saved.id}/create-room`, { method: 'POST' });
            toast('Salon créé et room Tchap ouverte ✓', 'success');
          } catch (e) {
            toast(`Salon créé mais room Tchap échouée : ${e.message}`, 'error');
          }
        } else {
          toast(this.modalMode === 'create' ? 'Salon ajouté' : 'Salon mis à jour', 'success');
        }

        // ── Mise à jour des unités associées ──
        const salonId = saved?.id || this.form.id;
        const newIds  = this.form._uniteIds || [];
        const oldIds  = this.form._initialUniteIds || [];
        const toAdd   = newIds.filter(id => !oldIds.includes(id));
        const toRem   = oldIds.filter(id => !newIds.includes(id));
        for (const uid of toAdd) {
          const u = this.unites.find(u => u.id === uid);
          if (u) {
            const salons = [...new Set([...(u.Salons || []), Number(salonId)])];
            await apiFetch(`/api/unites/${uid}`, { method: 'PATCH', body: JSON.stringify({ Salons: salons }) });
          }
        }
        for (const uid of toRem) {
          const u = this.unites.find(u => u.id === uid);
          if (u) {
            const salons = (u.Salons || []).filter(sid => sid !== Number(salonId));
            await apiFetch(`/api/unites/${uid}`, { method: 'PATCH', body: JSON.stringify({ Salons: salons }) });
          }
        }

        // ── Sync Tchap : inviter les agents attendus dans ce salon ──
        apiFetch('/api/tchap/apply', {
          method: 'POST',
          body: JSON.stringify({ salonIds: [Number(salonId)] }),
        }).then(r => {
          if (r?.invited > 0) toast(`${r.invited} invitation(s) Tchap envoyée(s)`, 'success');
          if (r?.errors?.length) r.errors.forEach(e => toast(`Tchap${e.user ? ' (' + e.user + ')' : ''} : ${e.error}`, 'error'));
        }).catch(() => {});

        this.closeModal();
        await this.load();
      } catch (e) {
        this.modalError = e.message;
      }
      this.saving = false;
    },

    // ── Sélection multiple ──────────────────────────────────
    toggleSelectMode() {
      this.selectMode = !this.selectMode;
      if (!this.selectMode) this.selectedSalons = [];
    },
    toggleSelectSalon(id) {
      if (this.selectedSalons.includes(id)) this.selectedSalons = this.selectedSalons.filter(i => i !== id);
      else                                   this.selectedSalons = [...this.selectedSalons, id];
    },
    selectAll()      { this.selectedSalons = this.filtered.map(s => s.id); },
    clearSelection() { this.selectedSalons = []; },

    // ── Suppression multi-étapes ────────────────────────────
    startDeleteFlow(salon) {
      this.deleteTarget  = salon;
      this.deleteBulkIds = [];
      this.deleteStep    = 1;
    },
    confirmBulkDelete() {
      this.deleteTarget  = null;
      this.deleteBulkIds = [...this.selectedSalons];
      this.deleteStep    = 1;
    },
    cancelDelete() {
      this.deleteStep       = 0;
      this.deleteTarget     = null;
      this.deleteBulkIds    = [];
      this.deleteKickResult = null;
      this.saving           = false;
    },

    async runKickUsers() {
      const roomIds = this.deleteTarget
        ? (this.deleteTarget.room_id ? [this.deleteTarget.room_id] : [])
        : this.salons.filter(s => this.deleteBulkIds.includes(s.id) && s.room_id).map(s => s.room_id);

      if (roomIds.length === 0) {
        this.deleteStep = 4;
        return;
      }

      this.deleteStep = 2;
      this.saving     = true;
      let totalKicked = 0;
      const errors    = [];

      for (const roomId of roomIds) {
        try {
          const r = await apiFetch('/api/tchap/kick-all', {
            method: 'POST',
            body: JSON.stringify({ roomId, kickBot: false }),
          });
          totalKicked += r.kicked || 0;
          if (r.errors?.length) errors.push(...r.errors);
        } catch (e) {
          errors.push({ error: e.message });
        }
      }

      this.deleteKickResult = `${totalKicked} membre(s) expulsé(s) du salon Tchap` +
        (errors.length ? ` (${errors.length} erreur(s))` : '');
      this.saving     = false;
      this.deleteStep = 3;
    },

    async runBotLeave() {
      const roomIds = this.deleteTarget
        ? (this.deleteTarget.room_id ? [this.deleteTarget.room_id] : [])
        : this.salons.filter(s => this.deleteBulkIds.includes(s.id) && s.room_id).map(s => s.room_id);

      this.saving = true;
      for (const roomId of roomIds) {
        try {
          await apiFetch('/api/tchap/bot-leave', { method: 'POST', body: JSON.stringify({ roomId }) });
        } catch (e) {
          toast(`Bot-leave (${roomId}) : ${e.message}`, 'error');
        }
      }
      this.saving     = false;
      this.deleteStep = 4;
    },

    skipBotLeave() { this.deleteStep = 4; },

    async finishDelete() {
      this.saving = true;
      try {
        if (this.deleteTarget) {
          await apiFetch(`/api/salons/${this.deleteTarget.id}`, { method: 'DELETE' });
          toast('Salon supprimé', 'success');
        } else {
          await apiFetch('/api/salons', {
            method: 'DELETE',
            body: JSON.stringify({ ids: this.deleteBulkIds }),
          });
          toast(`${this.deleteBulkIds.length} salon(s) supprimé(s)`, 'success');
          this.selectedSalons = [];
          this.selectMode     = false;
        }
        this.cancelDelete();
        await this.load();
      } catch (e) {
        toast(e.message, 'error');
        this.saving = false;
      }
    },

    // ── Modérateurs ─────────────────────────────────────────
    async openModerators(salon) {
      this.moderatorsSalon  = salon;
      this.moderatorsList   = [];
      this.moderatorsError  = null;
      this.moderatorsLoading = true;
      this.moderatorsOpen   = true;

      try {
        // Charger membres + power levels en parallèle
        const [membersData, plData] = await Promise.all([
          apiFetch(`/api/tchap/members/${encodeURIComponent(salon.room_id)}`),
          apiFetch(`/api/tchap/power-levels/${encodeURIComponent(salon.room_id)}`),
        ]);

        const raw     = Array.isArray(membersData) ? membersData : (membersData.members || []);
        const botId   = (plData.botUserId || membersData.botUserId || '').toLowerCase();
        const levels  = plData.users || {};

        this.moderatorsList = raw
          .filter(m => (m.content?.membership ?? m.membership) === 'join')
          .map(m => {
            const userId = (m.state_key || m.userId || '').toLowerCase();
            return {
              userId,
              level:  levels[userId] ?? 0,
              isBot:  botId && userId === botId,
              saving: false,
            };
          })
          .sort((a, b) => b.level - a.level || a.userId.localeCompare(b.userId));
      } catch (e) {
        this.moderatorsError = e.message;
      }
      this.moderatorsLoading = false;
    },

    async setModerator(member, level) {
      member.saving = true;
      try {
        await apiFetch('/api/tchap/set-power-level', {
          method: 'POST',
          body: JSON.stringify({
            roomId: this.moderatorsSalon.room_id,
            userId: member.userId,
            level,
          }),
        });
        member.level = level;
        toast(level >= 50 ? `${member.userId} est maintenant modérateur` : `${member.userId} est repassé membre`, 'success');
      } catch (e) {
        toast(e.message, 'error');
      }
      member.saving = false;
    },

    // ── Autorisations ────────────────────────────────────────
    async openPermissions(salon) {
      this.permissionsSalon   = salon;
      this.permissionsData    = null;
      this.permissionsError   = null;
      this.permissionsLoading = true;
      this.permissionsOpen    = true;

      try {
        this.permissionsData = await apiFetch(`/api/tchap/room-permissions/${encodeURIComponent(salon.room_id)}`);
      } catch (e) {
        this.permissionsError = e.message;
      }
      this.permissionsLoading = false;
    },

    async permissionsSet(section, subKey, level) {
      if (!this.permissionsData) return;
      this.permissionsSaving = true;
      try {
        let updates;
        if (subKey === null) {
          // top-level field (events_default, invite, kick…)
          updates = { [section]: level };
          this.permissionsData[section] = level;
        } else {
          // nested field (events.*, notifications.*)
          updates = { [section]: { [subKey]: level } };
          this.permissionsData[section] = { ...(this.permissionsData[section] ?? {}), [subKey]: level };
        }
        await apiFetch(`/api/tchap/room-permissions/${encodeURIComponent(this.permissionsSalon.room_id)}`, {
          method: 'PUT',
          body: JSON.stringify(updates),
        });
        toast('Autorisation mise à jour', 'success');
      } catch (e) {
        toast(e.message, 'error');
        // Reload to resync on error
        try {
          this.permissionsData = await apiFetch(`/api/tchap/room-permissions/${encodeURIComponent(this.permissionsSalon.room_id)}`);
        } catch (_) { /* ignore */ }
      }
      this.permissionsSaving = false;
    },

    // ── Ajout de membres ────────────────────────────────────
    openAddMembers(salon) {
      this.addMembersTarget   = salon;
      this.addMembersTab      = 'personnel';
      this.addMembersInput    = '';
      this.addMembersSearch   = '';
      this.addMembersSelected = [];
      this.addMembersCsvRows  = [];
      this.addMembersCsvError = null;
      this.addMembersError    = null;
      this.addMembersResult   = null;
      // Charger les membres actuels si pas encore fait
      if (!salon._memberIds) this.fetchMembers(salon);
    },

    closeAddMembers() {
      this.addMembersTarget   = null;
      this.addMembersInput    = '';
      this.addMembersSearch   = '';
      this.addMembersSelected = [];
      this.addMembersCsvRows  = [];
      this.addMembersCsvError = null;
      this.addMembersError    = null;
      this.addMembersResult   = null;
    },

    // Exposer mailToTchapId dans le scope Alpine pour les templates
    mailToTchapId: (email) => mailToTchapId(email),

    // Personnel filtré pour l'onglet "Personnel"
    get addMembersPersonnel() {
      const q = (this.addMembersSearch || '').toLowerCase();
      return this.personnel.filter(p => {
        if (!q) return true;
        return `${p.Nom} ${p.Prenom} ${p.Grade || ''} ${p.Mail || ''}`.toLowerCase().includes(q);
      });
    },

    toggleAddMembersPerson(id) {
      if (this.addMembersSelected.includes(id))
        this.addMembersSelected = this.addMembersSelected.filter(x => x !== id);
      else
        this.addMembersSelected = [...this.addMembersSelected, id];
    },

    isAlreadyInRoom(person) {
      if (!this.addMembersTarget?._memberIds) return false;
      return this.addMembersTarget._memberIds.includes((person.user_id || '').toLowerCase());
    },

    // Parse un fichier CSV pour l'onglet "CSV"
    async parseCsvForMembers(event) {
      const file = event.target.files[0];
      if (!file) return;
      this.addMembersCsvError = null;
      this.addMembersCsvRows  = [];
      try {
        const text = await file.text();
        const seen = new Set();
        const rows = [];
        for (const rawLine of text.split(/\r?\n/)) {
          const line = rawLine.trim();
          if (!line) continue;
          // Découper par virgule ou point-virgule, nettoyer les guillemets
          const cells = line.split(/[,;]/).map(c => c.trim().replace(/^["']|["']$/g, ''));
          for (const cell of cells) {
            if (!cell) continue;
            // Matrix ID direct
            if (cell.startsWith('@') && cell.includes(':')) {
              if (!seen.has(cell.toLowerCase())) {
                seen.add(cell.toLowerCase());
                rows.push({ raw: cell, userId: cell, email: null, matched: true, name: cell });
              }
              break;
            }
            // Email → chercher dans le personnel, ou dériver le Matrix ID
            const at = cell.indexOf('@');
            if (at > 0 && cell.includes('.', at)) {
              const email = cell.toLowerCase();
              if (!seen.has(email)) {
                seen.add(email);
                const person  = this.personnel.find(p => (p.Mail || '').toLowerCase() === email);
                const userId  = person?.user_id || mailToTchapId(email);
                rows.push({
                  raw:     cell,
                  email,
                  userId,
                  matched: !!userId,
                  name:    person ? `${person.Prenom} ${person.Nom}` : email,
                  derived: !person?.user_id, // true = ID dérivé de l'email, non confirmé
                });
              }
              break;
            }
          }
        }
        if (!rows.length) { this.addMembersCsvError = 'Aucun email ou identifiant Matrix trouvé dans le fichier.'; return; }
        this.addMembersCsvRows = rows;
      } catch (e) {
        this.addMembersCsvError = 'Erreur de lecture : ' + e.message;
      }
    },

    async addMembers() {
      this.addMembersError  = null;
      this.addMembersResult = null;
      let userIds = [];

      if (this.addMembersTab === 'personnel') {
        userIds = this.addMembersSelected
          .map(id => {
            const p = this.personnel.find(p => p.id === id);
            return p?.user_id || (p?.Mail ? mailToTchapId(p.Mail) : null);
          })
          .filter(uid => uid && uid.startsWith('@') && uid.includes(':'));
      } else if (this.addMembersTab === 'manual') {
        userIds = this.addMembersInput.split('\n')
          .map(l => l.trim())
          .filter(Boolean)
          .map(l => {
            if (l.startsWith('@') && l.includes(':')) return l; // Matrix ID direct
            if (l.includes('@') && !l.startsWith('@')) return mailToTchapId(l); // email → ID
            return null;
          })
          .filter(Boolean);
      } else if (this.addMembersTab === 'csv') {
        userIds = this.addMembersCsvRows
          .filter(r => r.matched && r.userId?.startsWith('@'))
          .map(r => r.userId);
      }

      if (!userIds.length) {
        this.addMembersError = 'Aucun identifiant Matrix valide à inviter.';
        return;
      }

      this.saving = true;
      let ok = 0;
      const errors = [];
      for (const userId of userIds) {
        try {
          await apiFetch('/api/tchap/invite', {
            method: 'POST',
            body: JSON.stringify({ roomId: this.addMembersTarget.room_id, userId }),
          });
          ok++;
        } catch (e) {
          errors.push(`${userId} : ${e.message}`);
        }
      }
      this.addMembersResult = `${ok} membre(s) invité(s)` + (errors.length ? ` — ${errors.length} erreur(s)` : '');
      if (errors.length) this.addMembersError = errors.join('\n');
      this.saving = false;
      if (ok > 0) {
        if (this.addMembersTab === 'personnel') this.addMembersSelected = [];
        if (this.addMembersTab === 'manual')    this.addMembersInput = '';
        if (this.addMembersTab === 'csv')       this.addMembersCsvRows = [];
        await this.fetchMembers(this.addMembersTarget);
      }
    },

    loadCsv(event) {
      const file = event.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = e => { this.csvData = this.csvPreview = parseCsv(e.target.result); };
      reader.readAsText(file, 'UTF-8');
    },

    async importCsv() {
      this.importing = true;
      this.importError = null;
      let ok = 0, tchapOk = 0, errors = 0;
      for (const row of this.csvData) {
        // Extraire la colonne Unites avant d'envoyer à l'API
        const uniteNames = row.Unites ? String(row.Unites).split(/[|;]/).map(n => n.trim()).filter(Boolean) : [];
        const { Unites, ...salonRow } = row;
        try {
          const saved = await apiFetch('/api/salons', { method: 'POST', body: JSON.stringify(salonRow) });
          ok++;
          // Créer la room Tchap si aucun room_id dans le CSV
          if (saved?.id && !saved?.room_id) {
            try {
              await apiFetch(`/api/salons/${saved.id}/create-room`, { method: 'POST' });
              tchapOk++;
            } catch (_) { /* la room sera créée plus tard */ }
          }
          // ── Associer aux unités (créer si manquante) ──
          for (const uniteName of uniteNames) {
            let unite = this.unites.find(u => u.Nom.toLowerCase() === uniteName.toLowerCase());
            if (!unite) {
              try {
                unite = await apiFetch('/api/unites', { method: 'POST', body: JSON.stringify({ Nom: uniteName, code: '' }) });
                this.unites.push(unite);
              } catch (_) { continue; }
            }
            const salons = [...new Set([...(unite.Salons || []), Number(saved.id)])];
            try {
              const upd = await apiFetch(`/api/unites/${unite.id}`, { method: 'PATCH', body: JSON.stringify({ Salons: salons }) });
              const idx = this.unites.findIndex(u => u.id === unite.id);
              if (idx >= 0) this.unites[idx] = upd;
            } catch (_) {}
          }
        } catch (e) {
          errors++;
          if (!this.importError) this.importError = e.message;
        }
      }
      const tchapMsg = tchapOk > 0 ? `, ${tchapOk} room(s) Tchap créée(s)` : '';
      toast(`Import : ${ok} ajouté(s)${tchapMsg}, ${errors} erreur(s)`, errors ? 'error' : 'success');
      this.importing = false;
      this.importOpen = false;
      await this.load();
    },

    async syncAllToTchap() {
      const salonIds = this.salons.filter(s => s.room_id).map(s => s.id);
      if (!salonIds.length) { toast('Aucun salon avec room_id configuré', 'error'); return; }
      window.dispatchEvent(new CustomEvent('tchap-sync-start', { detail: { salonIds, label: 'Sync salons' } }));
      toast(`Sync lancée en arrière-plan (${salonIds.length} salon(s))`, 'info');
    },

    async createTchapRoom(salon) {
      salon._loading = true;
      try {
        const updated = await apiFetch(`/api/salons/${salon.id}/create-room`, { method: 'POST' });
        // Mettre à jour localement sans recharger toute la liste
        const idx = this.salons.findIndex(s => s.id === salon.id);
        if (idx >= 0) this.salons[idx] = { ...this.salons[idx], ...updated };
        toast(`Room Tchap créée : ${updated.room_id}`, 'success');
      } catch (e) {
        toast(e.message, 'error');
      }
      salon._loading = false;
    },
  };
}

// ── Vue Unités ─────────────────────────────────────────────
function uniteView() {
  return {
    unites:     [],
    niveaux:    [],
    salons:     [],
    personnel:  [],
    loading:         true,
    search:          '',
    activeTypeTab:   'reel',   // 'reel' = annuaire | 'virtuel' = temporaires
    annuaireCollapsed: {},
    modalOpen:  false,
    modalMode:  'create',
    modalError: null,
    saving:     false,
    deleteTarget:   null,
    deleteBulkIds:  [],
    selectMode:     false,
    selectedUnites: [],
    syncingAll:     false,
    // Modal détail (onglets)
    detailOpen:    false,
    detailUnite:   null,
    detailTab:     'fiche',
    detailSaving:  false,
    detailError:   null,
    detailForm:    {},
    quickSalon:    { Nom: '', Type: 'operationnel', Description: '' },
    addingSalon:   false,
    salonSearch:   '',
    bots:          [],
    importOpen: false,
    csvPreview: [],
    csvData:    [],
    importError: null,
    importing:  false,
    form:       {},
    importPersonnelOpen:   false,
    importTargetUnite:     null,
    importSelectedAgents:  [],
    importTab:             'email',
    importEmailText:       '',
    importAnalysed:        false,
    importFoundAgents:     [],
    importNewAgents:       [],
    importInvalidLines:    [],
    importRegistrySearch:  '',

    async load() {
      this.loading = true;
      try {
        const [u, s, p, b, n] = await Promise.all([apiFetch('/api/unites'), apiFetch('/api/salons'), apiFetch('/api/personnel'), apiFetch('/api/bots').catch(() => []), apiFetch('/api/niveaux').catch(() => [])]);
        this.unites    = (u || []).map(unite => ({ ...unite, _syncing: false }));
        this.salons    = s || [];
        this.personnel = p || [];
        this.bots      = b || [];
        this.niveaux   = n || [];
      } catch (e) {
        toast(e.message, 'error');
      }
      this.loading = false;
    },

    get detailPersonnelList() {
      if (!this.detailUnite) return [];
      return this.personnel.filter(a => (a.Unite || []).map(Number).includes(Number(this.detailUnite.id)));
    },

    get detailSalonsList() {
      if (!this.detailUnite || !this.detailForm.Salons) return [];
      return this.detailForm.Salons
        .map(sid => this.salons.find(s => s.id === Number(sid)))
        .filter(Boolean);
    },

    get detailSalonsClassificationList() {
      if (!this.detailUnite || !this.detailForm.Salons_Classification) return [];
      return this.detailForm.Salons_Classification
        .map(sid => this.salons.find(s => s.id === Number(sid)))
        .filter(Boolean);
    },

    get filtered() {
      const src = this.activeTypeTab === 'reel'
        ? this.unites.filter(u => u.type !== 'virtuel')
        : this.unites.filter(u => u.type === 'virtuel');
      if (!this.search) return src;
      const q = this.search.toLowerCase();
      return src.filter(u => u.Nom.toLowerCase().includes(q) || (u.code || '').toLowerCase().includes(q));
    },

    getSalonName(id) {
      const s = this.salons.find(s => s.id === Number(id));
      return s ? s.Nom : `#${id}`;
    },

    getSalonType(id) {
      const s = this.salons.find(s => s.id === Number(id));
      return s ? (s.Type || 'default').toLowerCase() : 'default';
    },

    get filteredImportPersonnel() {
      const q = (this.importRegistrySearch || '').toLowerCase();
      if (!q) return this.personnel;
      return this.personnel.filter(a =>
        (a.Nom || '').toLowerCase().includes(q) || (a.Prenom || '').toLowerCase().includes(q) || (a.Mail || '').toLowerCase().includes(q)
      );
    },

    openImportPersonnel(unite) {
      this.importTargetUnite    = unite;
      this.importSelectedAgents = [];
      this.importError          = null;
      this.importTab            = 'email';
      this.importEmailText      = '';
      this.importAnalysed       = false;
      this.importFoundAgents    = [];
      this.importNewAgents      = [];
      this.importInvalidLines   = [];
      this.importRegistrySearch = '';
      this.importPersonnelOpen  = true;
    },

    loadImportFile(event) {
      const file = event.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = e => {
        const text = e.target.result;
        const hasCols = text.includes(',') || text.includes(';') || text.includes('\t');
        if (hasCols) {
          const rows = parseCsv(text);
          const emails = rows.map(r =>
            r.Mail || r.mail || r.Email || r.email ||
            Object.values(r).find(v => v && typeof v === 'string' && v.includes('@')) || ''
          ).filter(Boolean);
          this.importEmailText = emails.join('\n');
        } else {
          this.importEmailText = text.trim();
        }
        event.target.value = '';
      };
      reader.readAsText(file, 'UTF-8');
    },

    analyseImport() {
      const lines = this.importEmailText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
      this.importFoundAgents  = [];
      this.importNewAgents    = [];
      this.importInvalidLines = [];
      lines.forEach(line => {
        const m = line.match(/[\w.+%-]+@[\w.-]+\.[a-z]{2,}/i);
        if (!m) { this.importInvalidLines.push(line); return; }
        const email = m[0].toLowerCase();
        const existing = this.personnel.find(a => (a.Mail || '').toLowerCase() === email);
        if (existing) {
          const already = (existing.Unite || []).map(Number).includes(Number(this.importTargetUnite.id));
          this.importFoundAgents.push({ agent: existing, already });
        } else {
  const local = email.replace('@', '-');
  const parts = email.split('@')[0].split('.');

  const prenom = parts.length >= 2
    ? parts[0].charAt(0).toUpperCase() + parts[0].slice(1)
    : '';

  const nom = parts.length >= 2
    ? parts.slice(1).join(' ').toUpperCase()
    : local.toUpperCase();

  this.importNewAgents.push({
    email,
    prenom,
    nom,
    user_id: mailToTchapId(email)
  });
}
      });
      this.importAnalysed = true;
    },

    async confirmEmailImport() {
      this.saving = true; this.importError = null;
      let ok = 0, errors = 0;
      for (const { agent, already } of this.importFoundAgents) {
        if (already) continue;
        try {
          const unites = [...new Set([...(agent.Unite || []).map(Number), Number(this.importTargetUnite.id)])];
          await apiFetch(`/api/personnel/${agent.id}`, { method: 'PATCH', body: JSON.stringify({ Unite: unites }) });
          ok++;
        } catch { errors++; }
      }
      for (const row of this.importNewAgents) {
        try {
          await apiFetch('/api/personnel', { method: 'POST', body: JSON.stringify({
            Nom: row.nom, Prenom: row.prenom, Mail: row.email, user_id: row.user_id,
            Unite: [Number(this.importTargetUnite.id)],
          }) });
          ok++;
        } catch { errors++; }
      }
      toast(`${ok} agent(s) traité(s)${errors ? ', ' + errors + ' erreur(s)' : ''}`, errors ? 'error' : 'success');
      this.saving = false;
      this.importPersonnelOpen = false;
      await this.load();
    },

    toggleImportAgent(id, checked) {
      if (checked) {
        if (!this.importSelectedAgents.includes(id)) this.importSelectedAgents = [...this.importSelectedAgents, id];
      } else {
        this.importSelectedAgents = this.importSelectedAgents.filter(i => i !== id);
      }
    },

    async saveImportPersonnel() {
      if (!this.importTargetUnite || !this.importSelectedAgents.length) return;
      this.saving = true; this.importError = null;
      try {
        for (const agentId of this.importSelectedAgents) {
          const agent = this.personnel.find(a => a.id === agentId);
          if (!agent) continue;
          const unites = [...new Set([...(agent.Unite || []).map(Number), Number(this.importTargetUnite.id)])];
          await apiFetch(`/api/personnel/${agentId}`, { method: 'PATCH', body: JSON.stringify({ Unite: unites }) });
        }
        toast(`${this.importSelectedAgents.length} agent(s) affecté(s) à ${this.importTargetUnite.Nom}`, 'success');
        this.importPersonnelOpen = false;
        await this.load();
      } catch (e) { this.importError = e.message; }
      this.saving = false;
    },

    getAgentCount(uniteId) {
      return this.personnel.filter(a => (a.Unite || []).includes(Number(uniteId))).length;
    },

    niveauLabel(niveauId) {
      return this.niveaux.find(n => n.id === Number(niveauId))?.nom ?? '';
    },

    niveauColor(niveauId) {
      const ordre = this.niveaux.find(n => n.id === Number(niveauId))?.ordre ?? 0;
      const colors = ['#c9a84c', '#2d6cdf', '#6ec38a', '#e07b54', '#a78bfa', '#f472b6'];
      return colors[(ordre - 1) % colors.length] || '#8888aa';
    },

    toggleAnnuaireCollapse(id) {
      this.annuaireCollapsed = { ...this.annuaireCollapsed, [id]: !this.annuaireCollapsed[id] };
    },

    get annuaireTree() {
      const q = this.search ? this.search.toLowerCase() : '';
      let source = this.unites.filter(u => u.type !== 'virtuel');
      if (q) {
        const matchIds = new Set(source.filter(u =>
          u.Nom.toLowerCase().includes(q) || (u.code || '').toLowerCase().includes(q)
        ).map(u => u.id));
        const withAncestors = new Set(matchIds);
        const addAncestors = id => {
          const u = source.find(x => x.id === id);
          if (u && u.parent_id && !withAncestors.has(u.parent_id)) {
            withAncestors.add(u.parent_id);
            addAncestors(u.parent_id);
          }
        };
        matchIds.forEach(id => addAncestors(id));
        source = source.filter(u => withAncestors.has(u.id));
      }
      const byParent = {};
      source.forEach(u => {
        const pid = u.parent_id ?? -1;
        (byParent[pid] = byParent[pid] || []).push(u);
      });
      Object.values(byParent).forEach(arr =>
        arr.sort((a, b) => (a.niveau_ordre ?? 999) - (b.niveau_ordre ?? 999) || a.Nom.localeCompare(b.Nom))
      );
      const result = [];
      const walk = (pid, depth) => {
        (byParent[pid] || []).forEach(u => {
          const hasChildren = (byParent[u.id] || []).length > 0;
          result.push({ ...u, _depth: depth, _hasChildren: hasChildren });
          if (!this.annuaireCollapsed[u.id]) walk(u.id, depth + 1);
        });
      };
      walk(-1, 0);
      return result;
    },

    openModal(mode, unite = null) {
      this.modalMode  = mode;
      this.modalError = null;
      this.form = unite
        ? { ...unite, Salons: [...(unite.Salons || [])], _salonSearch: '' }
        : { Nom: '', code: '', Salons: [], _salonSearch: '', parent_id: null, niveau_id: null, type: this.activeTypeTab };
      this.modalOpen = true;
    },

    closeModal() { this.modalOpen = false; },

    toggleSalon(sid, checked) {
      if (!this.form.Salons) this.form.Salons = [];
      if (checked) this.form.Salons = [...this.form.Salons, sid];
      else this.form.Salons = this.form.Salons.filter(id => id !== sid);
    },

    async save() {
      this.saving = true;
      this.modalError = null;
      try {
        const url    = this.modalMode === 'create' ? '/api/unites' : `/api/unites/${this.form.id}`;
        const method = this.modalMode === 'create' ? 'POST' : 'PATCH';
        await apiFetch(url, { method, body: JSON.stringify(this.form) });
        toast(this.modalMode === 'create' ? 'Unité ajoutée' : 'Unité mise à jour', 'success');
        this.closeModal();
        await this.load();
      } catch (e) {
        this.modalError = e.message;
      }
      this.saving = false;
    },

    toggleSelectMode() {
      this.selectMode = !this.selectMode;
      if (!this.selectMode) this.selectedUnites = [];
    },
    toggleSelectUnite(id) {
      if (this.selectedUnites.includes(id)) this.selectedUnites = this.selectedUnites.filter(i => i !== id);
      else                                   this.selectedUnites = [...this.selectedUnites, id];
    },
    selectAll()      { this.selectedUnites = this.filtered.map(u => u.id); },
    clearSelection() { this.selectedUnites = []; },

    confirmDelete(unite) { this.deleteTarget = unite; this.deleteBulkIds = []; },
    confirmBulkDelete()  { this.deleteTarget = null;  this.deleteBulkIds = [...this.selectedUnites]; },
    cancelDelete()       { this.deleteTarget = null;  this.deleteBulkIds = []; },

    async syncUnite(unite) {
      if (!unite.Salons || unite.Salons.length === 0) {
        toast('Aucun salon associé à cette unité', 'error');
        return;
      }
      unite._syncing = true;
      const salonIds = unite.Salons.map(Number);
      window.dispatchEvent(new CustomEvent('tchap-sync-start', { detail: { salonIds, label: unite.Nom } }));
      toast(`Sync "${unite.Nom}" lancée en arrière-plan`, 'info');
      unite._syncing = false;
    },

    async syncAllUnites() {
      const allSalonIds = [...new Set(this.unites.flatMap(u => (u.Salons || []).map(Number)))];
      if (allSalonIds.length === 0) { toast('Aucun salon configuré', 'error'); return; }
      window.dispatchEvent(new CustomEvent('tchap-sync-start', { detail: { salonIds: allSalonIds, label: 'Sync globale' } }));
      toast(`Sync globale lancée en arrière-plan (${allSalonIds.length} salon(s))`, 'info');
    },

    // ── Modal détail onglets ──────────────────────────────────
    openDetail(unite) {
      this.detailUnite = unite;
      this.detailTab   = 'fiche';
      this.detailError = null;
      this.salonSearch  = '';
      this.salonPage    = 1;
      this.salonPerPage = 25;
      this.quickSalon   = { Nom: '', Type: 'operationnel', Description: '', assocType: 'commun' };
      this.detailForm  = {
        Nom:                    unite.Nom       || '',
        code:                   unite.code      || '',
        numero:                 unite.numero    || '',
        adresse:                unite.adresse   || '',
        bot_id:                 unite.bot_id    ?? null,
        parent_id:              unite.parent_id ?? null,
        niveau_id:              unite.niveau_id ?? null,
        type:                   unite.type      || 'virtuel',
        Salons:                 [...(unite.Salons || [])],
        Salons_Classification:  [...(unite.Salons_Classification || [])],
      };
      this.detailOpen = true;
    },

    closeDetail() { this.detailOpen = false; this.detailUnite = null; },

    async saveDetail() {
      this.detailSaving = true;
      this.detailError  = null;
      try {
        const updated = await apiFetch(`/api/unites/${this.detailUnite.id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            Nom:       this.detailForm.Nom,
            code:      this.detailForm.code,
            numero:    this.detailForm.numero,
            adresse:   this.detailForm.adresse,
            bot_id:    this.detailForm.bot_id,
            parent_id: this.detailForm.parent_id,
            niveau_id: this.detailForm.niveau_id,
            type:      this.detailForm.type,
          }),
        });
        const idx = this.unites.findIndex(u => u.id === this.detailUnite.id);
        if (idx >= 0) { this.unites[idx] = { ...this.unites[idx], ...updated }; this.detailUnite = this.unites[idx]; }
        toast('Unité mise à jour', 'success');
      } catch (e) {
        this.detailError = e.message;
      }
      this.detailSaving = false;
    },

    toggleDetailSalon(salonId, checked) {
      if (!this.detailForm.Salons) this.detailForm.Salons = [];
      const id = Number(salonId);
      if (checked) this.detailForm.Salons = [...new Set([...this.detailForm.Salons, id])];
      else         this.detailForm.Salons = this.detailForm.Salons.filter(i => i !== id);
    },

    toggleDetailSalonClassification(salonId, checked) {
      if (!this.detailForm.Salons_Classification) this.detailForm.Salons_Classification = [];
      const id = Number(salonId);
      if (checked) this.detailForm.Salons_Classification = [...new Set([...this.detailForm.Salons_Classification, id])];
      else         this.detailForm.Salons_Classification = this.detailForm.Salons_Classification.filter(i => i !== id);
    },

    // Liste filtrée des salons non encore sélectionnés
    detailSalonFiltered() {
      const q        = (this.salonSearch || '').toLowerCase();
      const selected = this.detailAllSelected();
      return this.salons.filter(s =>
        !selected.includes(s.id) &&
        (!q || s.Nom.toLowerCase().includes(q) || (s.Type || '').toLowerCase().includes(q))
      );
    },

    // Total de pages
    detailSalonPageCount() {
      return Math.max(1, Math.ceil(this.detailSalonFiltered().length / this.salonPerPage));
    },

    // Résultats de la page courante
    detailSalonPage() {
      const start = (this.salonPage - 1) * this.salonPerPage;
      return this.detailSalonFiltered().slice(start, start + this.salonPerPage);
    },

    // Réinitialise la page à 1 (appelé sur changement de recherche ou perPage)
    detailSalonReset() {
      this.salonPage = 1;
    },

    // Retourne les IDs de tous les salons sélectionnés (commun + classement, dédupliqués)
    detailAllSelected() {
      const commun     = this.detailForm.Salons               || [];
      const classement = this.detailForm.Salons_Classification || [];
      return [...new Set([...commun, ...classement])];
    },

    // Coche/décoche un salon dans la liste de recherche → ajout dans Commun par défaut
    detailSelectSalon(salonId, checked) {
      const id = Number(salonId);
      if (checked) {
        if (!this.detailForm.Salons) this.detailForm.Salons = [];
        this.detailForm.Salons = [...new Set([...this.detailForm.Salons, id])];
      } else {
        this.detailRemoveSalon(id);
      }
    },

    // Bascule le type d'un salon entre Commun et Classement
    detailToggleSalonType(salonId) {
      const id = Number(salonId);
      const inCommun = (this.detailForm.Salons || []).includes(id);
      if (inCommun) {
        // Commun → Classement
        this.detailForm.Salons = (this.detailForm.Salons || []).filter(i => i !== id);
        this.detailForm.Salons_Classification = [...new Set([...(this.detailForm.Salons_Classification || []), id])];
      } else {
        // Classement → Commun
        this.detailForm.Salons_Classification = (this.detailForm.Salons_Classification || []).filter(i => i !== id);
        this.detailForm.Salons = [...new Set([...(this.detailForm.Salons || []), id])];
      }
    },

    // Retire un salon des deux listes
    detailRemoveSalon(salonId) {
      const id = Number(salonId);
      this.detailForm.Salons               = (this.detailForm.Salons               || []).filter(i => i !== id);
      this.detailForm.Salons_Classification = (this.detailForm.Salons_Classification || []).filter(i => i !== id);
    },

    async saveDetailSalons() {
      this.detailSaving = true;
      try {
        const updated = await apiFetch(`/api/unites/${this.detailUnite.id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            Salons:                this.detailForm.Salons,
            Salons_Classification: this.detailForm.Salons_Classification,
          }),
        });
        const idx = this.unites.findIndex(u => u.id === this.detailUnite.id);
        if (idx >= 0) { this.unites[idx] = { ...this.unites[idx], ...updated }; this.detailUnite = this.unites[idx]; }
        toast('Associations mises à jour', 'success');
      } catch (e) {
        toast(e.message, 'error');
      }
      this.detailSaving = false;
    },

    async quickAddSalon() {
      if (!this.quickSalon.Nom.trim()) return;
      this.addingSalon = true;
      try {
        const salon = await apiFetch('/api/salons', { method: 'POST', body: JSON.stringify(this.quickSalon) });
        if (salon?.id && !salon?.room_id) {
          try {
            await apiFetch(`/api/salons/${salon.id}/create-room`, {
              method: 'POST',
              body: JSON.stringify({ uniteId: this.detailUnite.id }),
            });
          } catch (e) {
            toast(`Salon créé dans l'app mais room Tchap échouée : ${e.message}`, 'error');
          }
        }
        const isClassement      = this.quickSalon.assocType === 'classement';
        const newSalonsCommuns  = isClassement
          ? [...(this.detailForm.Salons || [])]
          : [...new Set([...(this.detailForm.Salons || []), Number(salon.id)])];
        const newSalonsClassif  = isClassement
          ? [...new Set([...(this.detailForm.Salons_Classification || []), Number(salon.id)])]
          : [...(this.detailForm.Salons_Classification || [])];
        const updated   = await apiFetch(`/api/unites/${this.detailUnite.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ Salons: newSalonsCommuns, Salons_Classification: newSalonsClassif }),
        });
        const idx = this.unites.findIndex(u => u.id === this.detailUnite.id);
        if (idx >= 0) { this.unites[idx] = { ...this.unites[idx], ...updated }; this.detailUnite = this.unites[idx]; }
        this.detailForm.Salons                = updated.Salons                || newSalonsCommuns;
        this.detailForm.Salons_Classification = updated.Salons_Classification || newSalonsClassif;
        this.salons = [...this.salons, { ...salon, _memberCount: undefined, _loading: false }];
        this.quickSalon = { Nom: '', Type: 'operationnel', Description: '', assocType: 'commun' };
        toast(`Salon "${salon.Nom}" créé et associé (${isClassement ? 'classement' : 'commun'})`, 'success');
        // Auto-inviter les membres de l'unité seulement pour les salons communs
        if (!isClassement) apiFetch('/api/tchap/apply', {
          method: 'POST',
          body: JSON.stringify({ salonIds: [Number(salon.id)] }),
        }).then(r => {
          if (r?.invited > 0) toast(`${r.invited} membre(s) invité(s) dans le salon Tchap`, 'success');
          if (r?.errors?.length) r.errors.forEach(e => toast(`Tchap: ${e.error}`, 'error'));
        }).catch(() => {});
      } catch (e) {
        toast(e.message, 'error');
      }
      this.addingSalon = false;
    },

    async deleteUnite() {
      this.saving = true;
      try {
        if (this.deleteTarget) {
          await apiFetch(`/api/unites/${this.deleteTarget.id}`, { method: 'DELETE' });
          toast('Unité supprimée', 'success');
        } else {
          const r = await apiFetch('/api/unites', {
            method: 'DELETE',
            body: JSON.stringify({ ids: this.deleteBulkIds }),
          });
          toast(`${r.deleted} unité(s) supprimée(s)`, 'success');
          this.selectedUnites = [];
          this.selectMode     = false;
        }
        this.cancelDelete();
        await this.load();
      } catch (e) {
        toast(e.message, 'error');
      }
      this.saving = false;
    },

    loadCsv(event) {
      const file = event.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = e => { this.csvData = this.csvPreview = parseCsv(e.target.result); };
      reader.readAsText(file, 'UTF-8');
    },

    async importCsv() {
      this.importing = true;
      this.importError = null;
      let ok = 0, errors = 0;
      for (const row of this.csvData) {
        // Extraire la colonne Salons avant envoi à l'API
        const salonNames = row.Salons ? String(row.Salons).split(/[|;]/).map(n => n.trim()).filter(Boolean) : [];
        const { Salons: _s, ...uniteRow } = row;
        try {
          // ── Résoudre les IDs de salons (créer + room Tchap si manquant) ──
          const salonIds = [];
          for (const salonName of salonNames) {
            let salon = this.salons.find(s => s.Nom.toLowerCase() === salonName.toLowerCase());
            if (!salon) {
              try {
                salon = await apiFetch('/api/salons', { method: 'POST', body: JSON.stringify({ Nom: salonName, Type: '', Description: '' }) });
                try {
                  salon = await apiFetch(`/api/salons/${salon.id}/create-room`, { method: 'POST' });
                } catch (_) {}
                this.salons.push(salon);
              } catch (_) { continue; }
            }
            salonIds.push(Number(salon.id));
          }
          uniteRow.Salons = [...new Set(salonIds)];
          await apiFetch('/api/unites', { method: 'POST', body: JSON.stringify(uniteRow) });
          ok++;
        } catch (e) {
          errors++;
          if (!this.importError) this.importError = e.message;
        }
      }
      toast(`Import : ${ok} ajouté(s)`, errors ? 'error' : 'success');
      this.importing = false;
      this.importOpen = false;
      await this.load();
    },
  };
}

// ── Vue Config ─────────────────────────────────────────────
function configView() {
  return {
    tchapConfig: {
      homeserver: 'https://matrix.agent.interieur.tchap.gouv.fr',
      token: '', botUserId: '', enabled: false, emailDomains: 'gendarmerie.interieur.gouv.fr',
    },
    tchapServers:    window.TCHAP_SERVERS || [],
    serverForm:      { id: null, name: '', domains: '', homeserver: '', identityServer: '' },
    serverFormOpen:  false,
    serverFormError: null,
    serverFormIdx:   null,
    uiConfig:   { roleFeatures: {}, customRoles: [] },
    sysAdmins:   [],
    lockedUsers: [],
    bots:        [],
    botForm:     { id: null, name: '', userId: '', isPrincipal: false, homeserver: '' },
    botFormOpen:  false,
    botFormError: null,
    loginBotId:       null,
    loginBotPassword: '',
    loginBotLoading:  false,
    loginBotError:    null,
    newAdmin:   { username: '', password: '' },
    loading:    false,
    testing:    false,
    adminError: null,
    resetTarget:     null,
    resetPassword:   '',
    resetError:      null,
    resetPasswordModal: false,
    cfgTestResult:   '',
    cfgTestColor:    '',
    featureSaved:    false,
    editingRole:     null,
    customRoleForm:  { name: '', baseRole: 'lecteur', features: {}, actions: [] },
    customRoleError: null,
    reconRunning:    false,
    reconDone:       false,
    reconResults:    null,
    e2eePhase:       'idle',
    e2eeMessage:     '',
    e2eeError:       '',
    verifState:      null,
    verifEmoji:      [],
    verifUserId:     '',
    verifError:      '',
    verifKeyInput:   '',
    verifKeyLoading: false,
    keyPassphrase:   '',
    keyFileContent:  null,
    showKeyPassphrase: false,
    keyImportResult: '',
    keyImportResultColor: '',
    keyImportLoading: false,
    allFeatures: [
      { id: 'carto',       label: 'Cartographie' },
      { id: 'crise',       label: 'Mode Crise' },
      { id: 'suivi_crise', label: 'Suivi Crise' },
    ],
    actionGroups: [
      { name: 'Données', actions: [
        { id: 'edit_personnel', label: 'Modifier le personnel' },
        { id: 'edit_salons',    label: 'Modifier les salons' },
        { id: 'edit_unites',    label: 'Modifier les unités' },
      ]},
      { name: 'Tchap', actions: [
        { id: 'tchap_sync', label: 'Synchroniser Tchap' },
      ]},
      { name: 'Crise', actions: [
        { id: 'deploy_crisis', label: 'Déployer en crise' },
      ]},
      { name: 'Admin', actions: [
        { id: 'manage_users', label: 'Gérer les utilisateurs' },
        { id: 'view_config',  label: 'Voir la configuration' },
      ]},
    ],

    async load() {
      this.loading = true;
      try {
        const [t, u, a, b] = await Promise.all([
          apiFetch('/api/config/tchap_config'),
          apiFetch('/api/config/ui_config'),
          window.PERMISSIONS?.isSysAdmin ? apiFetch('/api/auth/sysadmins') : Promise.resolve([]),
          window.PERMISSIONS?.canAdmin   ? apiFetch('/api/bots').catch(() => []) : Promise.resolve([]),
        ]);
        if (t) this.tchapConfig = { ...this.tchapConfig, ...t };
        if (u) this.uiConfig    = u;
        this.sysAdmins = a || [];
        this.bots      = b || [];

        if (window.PERMISSIONS?.canAdmin) {
          this.loadLockedUsers();
        }

        // Vérifier l'état E2EE du bridge au chargement (silencieux)
        if (this.tchapConfig.enabled) {
          apiFetch('/api/tchap/e2ee/start', { method: 'POST' })
            .then(r => { this.e2eePhase = r?.phase || 'ready'; })
            .catch(() => { this.e2eePhase = 'idle'; });
        }
      } catch (e) {
        toast(e.message, 'error');
      }
      this.loading = false;
    },

    async loadLockedUsers() {
      try {
        this.lockedUsers = await apiFetch('/api/auth/locked-users') || [];
      } catch (e) {
        this.lockedUsers = [];
      }
    },

    async unlockUser(identifier) {
      try {
        await apiFetch(`/api/auth/locked-users/${encodeURIComponent(identifier)}/unlock`, { method: 'POST' });
        this.lockedUsers = this.lockedUsers.filter(u => u.identifier !== identifier);
        toast('Compte débloqué', 'success');
      } catch (e) {
        toast(e.message, 'error');
      }
    },

    openBotForm(bot = null) {
      this.botFormError = null;
      if (bot) {
        this.botForm = { id: bot.id, name: bot.name, userId: bot.userId, isPrincipal: bot.isPrincipal, homeserver: bot.homeserver || '' };
      } else {
        this.botForm = { id: null, name: '', userId: '', isPrincipal: false, homeserver: '' };
      }
      this.botFormOpen = true;
    },

    closeBotForm() { this.botFormOpen = false; this.botFormError = null; },

    async saveBotForm() {
      this.botFormError = null;
      if (!this.botForm.name.trim() || !this.botForm.userId.trim()) {
        this.botFormError = 'Nom et userId requis'; return;
      }
      try {
        if (this.botForm.id) {
          const updated = await apiFetch(`/api/bots/${this.botForm.id}`, { method: 'PUT', body: JSON.stringify(this.botForm) });
          this.bots = this.bots.map(b => b.id === this.botForm.id ? updated : b);
        } else {
          const created = await apiFetch('/api/bots', { method: 'POST', body: JSON.stringify(this.botForm) });
          this.bots = [...this.bots, created];
        }
        this.closeBotForm();
        toast('Bot enregistré', 'success');
      } catch (e) {
        this.botFormError = e.message;
      }
    },

    async deleteBot(bot) {
      if (!confirm(`Supprimer le bot "${bot.name}" ?`)) return;
      try {
        await apiFetch(`/api/bots/${bot.id}`, { method: 'DELETE' });
        this.bots = this.bots.filter(b => b.id !== bot.id);
        toast('Bot supprimé', 'success');
      } catch (e) {
        toast(e.message, 'error');
      }
    },

    openBotLogin(botId) {
      this.loginBotId = botId; this.loginBotPassword = ''; this.loginBotError = null;
    },

    closeBotLogin() { this.loginBotId = null; this.loginBotPassword = ''; this.loginBotError = null; },

    async doLoginBot(bot) {
      if (!this.loginBotPassword.trim()) return;
      this.loginBotLoading = true; this.loginBotError = null;
      try {
        await apiFetch(`/api/bots/${bot.id}/login`, { method: 'POST', body: JSON.stringify({ password: this.loginBotPassword }) });
        this.bots = this.bots.map(b => b.id === bot.id ? { ...b, connected: true } : b);
        if (bot.isPrincipal) this.tchapConfig.enabled = true;
        this.closeBotLogin();
        toast(`Bot "${bot.name}" connecté`, 'success');
      } catch (e) {
        this.loginBotError = e.message;
      }
      this.loginBotLoading = false;
    },

    async doLogoutBot(bot) {
      try {
        await apiFetch(`/api/bots/${bot.id}/logout`, { method: 'POST' });
        this.bots = this.bots.map(b => b.id === bot.id ? { ...b, connected: false } : b);
        if (bot.isPrincipal) this.tchapConfig.enabled = false;
        toast(`Bot "${bot.name}" déconnecté`, 'info');
      } catch (e) {
        toast(e.message, 'error');
      }
    },

    async testConnection() {
      this.testing = true;
      this.cfgTestResult = '';
      this.cfgTestColor  = '';
      try {
        const r = await apiFetch('/api/tchap/whoami');
        this.cfgTestResult = '✓ Bot connecté : ' + (r.user_id || 'OK');
        this.cfgTestColor  = '#6ec38a';
        toast(this.cfgTestResult, 'success');
      } catch (e) {
        this.cfgTestResult = '✗ ' + e.message;
        this.cfgTestColor  = 'var(--red-light)';
        toast(e.message, 'error');
      }
      this.testing = false;
    },

    async saveTchapConfig() {
      try {
        await apiFetch('/api/config/tchap_config', { method: 'PUT', body: JSON.stringify(this.tchapConfig) });
        toast('Configuration sauvegardée', 'success');
      } catch (e) {
        toast(e.message, 'error');
      }
    },

    async revokeToken() {
      this.tchapConfig.token   = '';
      this.tchapConfig.enabled = false;
      await this.saveTchapConfig();
      toast('Token révoqué', 'info');
    },

    async saveUiConfig() {
      try {
        await apiFetch('/api/config/ui_config', { method: 'PUT', body: JSON.stringify(this.uiConfig) });
        this.featureSaved = true;
        setTimeout(() => { this.featureSaved = false; }, 2000);
        toast('Configuration UI sauvegardée', 'success');
      } catch (e) {
        toast(e.message, 'error');
      }
    },

    async saveEmailDomains() {
      try {
        await apiFetch('/api/config/tchap_config', { method: 'PUT', body: JSON.stringify(this.tchapConfig) });
        toast('Domaines sauvegardés', 'success');
      } catch (e) {
        toast(e.message, 'error');
      }
    },

    // ── Serveurs Tchap ─────────────────────────────────────────────────────

    openServerForm(srv = null, idx = null) {
      this.serverFormIdx   = idx;
      this.serverFormError = null;
      this.serverForm = srv
        ? { ...srv }
        : { id: Date.now().toString(36), name: '', domains: '', homeserver: '', identityServer: '' };
      this.serverFormOpen = true;
    },

    closeServerForm() { this.serverFormOpen = false; },

    async saveServerForm() {
      this.serverFormError = null;
      const f = this.serverForm;
      if (!f.name.trim())       { this.serverFormError = 'Le nom est requis'; return; }
      if (!f.domains.trim())    { this.serverFormError = 'Au moins un domaine est requis'; return; }
      if (!f.homeserver.trim()) { this.serverFormError = 'Le serveur d\'accueil est requis'; return; }
      try { new URL(f.homeserver); } catch (_) { this.serverFormError = 'URL du serveur d\'accueil invalide'; return; }

      if (this.serverFormIdx !== null) {
        this.tchapServers[this.serverFormIdx] = { ...f };
      } else {
        this.tchapServers = [...this.tchapServers, { ...f }];
      }
      await this.saveTchapServers();
      this.serverFormOpen = false;
    },

    async deleteServer(idx) {
      if (!confirm('Supprimer ce serveur ?')) return;
      this.tchapServers = this.tchapServers.filter((_, i) => i !== idx);
      await this.saveTchapServers();
    },

    async saveTchapServers() {
      try {
        await apiFetch('/api/config/tchap_servers', { method: 'PUT', body: JSON.stringify(this.tchapServers) });
        window.TCHAP_SERVERS = this.tchapServers;
        toast('Serveurs sauvegardés', 'success');
      } catch (e) {
        toast(e.message, 'error');
      }
    },

    async runReconciliation() {
      this.reconRunning = true;
      this.reconDone    = false;
      this.reconResults = null;
      try {
        const r = await apiFetch('/api/tchap/sync-all', { method: 'POST' });
        this.reconResults = `${r.updated || 0} mis à jour${r.errors?.length ? ', ' + r.errors.length + ' erreur(s)' : ''}`;
        this.reconDone    = true;
        toast(`Réconciliation terminée : ${this.reconResults}`, 'success');
      } catch (e) {
        toast(e.message, 'error');
      }
      this.reconRunning = false;
    },

    editCustomRole(role) {
      this.editingRole    = role;
      this.customRoleForm = { ...role, features: { ...(role.features || {}) }, actions: [...(role.actions || [])] };
      this.customRoleError = null;
    },

    cancelEditRole() {
      this.editingRole     = null;
      this.customRoleForm  = { name: '', baseRole: 'lecteur', features: {}, actions: [] };
      this.customRoleError = null;
    },

    async saveCustomRole() {
      this.customRoleError = null;
      try {
        const roles = this.uiConfig.customRoles || [];
        if (this.editingRole) {
          const idx = roles.findIndex(r => r.id === this.editingRole.id);
          if (idx >= 0) roles[idx] = { ...this.customRoleForm };
          else roles.push({ ...this.customRoleForm });
        } else {
          roles.push({ ...this.customRoleForm, id: 'custom_' + Date.now() });
        }
        this.uiConfig.customRoles = roles;
        await this.saveUiConfig();
        this.cancelEditRole();
      } catch (e) {
        this.customRoleError = e.message;
      }
    },

    cancelResetPassword() { this.resetTarget = null; this.resetPasswordModal = false; this.resetPassword = ''; this.resetError = null; },

    toggleRoleFeature(role, feat, val) {
      if (!this.uiConfig.roleFeatures) this.uiConfig.roleFeatures = {};
      if (!this.uiConfig.roleFeatures[role]) this.uiConfig.roleFeatures[role] = {};
      this.uiConfig.roleFeatures[role][feat] = val;
    },

    addCustomRole() {
      const id = 'custom_' + Date.now();
      this.uiConfig.customRoles = [...(this.uiConfig.customRoles || []), { id, name: 'Nouveau rôle', baseRole: 'lecteur', features: {}, actions: [] }];
    },

    removeCustomRole(idx) {
      this.uiConfig.customRoles = this.uiConfig.customRoles.filter((_, i) => i !== idx);
    },

    roleLabel(r) {
      return { lecteur: 'Lecteur', gestionnaire: 'Gestionnaire', superviseur_crise: 'Superviseur Crise', admin: 'Administrateur' }[r] || r;
    },

    async createSysAdmin() {
      this.adminError = null;
      try {
        if (this.resetTarget) {
          await apiFetch(`/api/auth/sysadmins/${this.resetTarget.id}/reset-password`, {
            method: 'POST', body: JSON.stringify({ password: this.newAdmin.password }),
          });
          toast('Mot de passe réinitialisé', 'success');
          this.cancelResetPassword();
        } else {
          const r = await apiFetch('/api/auth/sysadmins', { method: 'POST', body: JSON.stringify(this.newAdmin) });
          this.sysAdmins = [...this.sysAdmins, r];
          this.newAdmin  = { username: '', password: '' };
          toast('Admin système créé', 'success');
        }
      } catch (e) {
        this.adminError = e.message;
      }
    },

    async startE2EE() {
      // En mode bridge, E2EE est géré automatiquement — on interroge juste l'état
      this.e2eePhase   = 'starting';
      this.e2eeMessage = 'Vérification du bridge…';
      this.e2eeError   = '';
      try {
        const r = await apiFetch('/api/tchap/e2ee/start', { method: 'POST' });
        this.e2eePhase = r.phase || 'ready';
        toast('E2EE actif via le bridge ✓', 'success');
      } catch (e) {
        this.e2eePhase = 'error';
        this.e2eeError = e.message;
      }
    },

    async stopE2EE() {
      // Non applicable en mode bridge — informer l'utilisateur
      toast('E2EE est géré automatiquement par le bridge tchap-bridge.', 'info');
      this.e2eePhase = 'ready'; // reste actif
    },

    async resetE2EEKeys() {
      if (!confirm('Réinitialiser les clés Olm ? Cette action est irréversible.')) return;
      this.e2eePhase   = 'starting';
      this.e2eeMessage = 'Réinitialisation des clés…';
      try {
        await apiFetch('/api/tchap/e2ee/reset-keys', { method: 'POST' });
        this.e2eePhase = 'ready';
        this.verifState = null;
        toast('Clés Olm réinitialisées', 'success');
      } catch (e) {
        this.e2eePhase = 'error';
        this.e2eeError = e.message;
        toast(e.message, 'error');
      }
    },

    onKeyFileChange(event) {
      const file = event.target.files[0];
      if (!file) { this.keyFileContent = null; return; }
      const reader = new FileReader();
      reader.onload = (e) => { this.keyFileContent = e.target.result; };
      reader.readAsText(file);
    },

    async doImportKeys() {
      if (!this.keyFileContent || !this.keyPassphrase) return;
      this.keyImportLoading     = true;
      this.keyImportResult      = '';
      this.keyImportResultColor = '';
      try {
        const r = await apiFetch('/api/tchap/e2ee/import-keys', {
          method: 'POST',
          body: JSON.stringify({ keys: this.keyFileContent, passphrase: this.keyPassphrase }),
        });
        if (r.info) {
          this.keyImportResult      = 'ℹ ' + r.info;
          this.keyImportResultColor = 'var(--text-secondary)';
          toast(`${r.decoded} sessions déchiffrées — voir détail`, 'info');
        } else {
          this.keyImportResult      = '✓ ' + (r.imported || 0) + ' clés importées';
          this.keyImportResultColor = '#6ec38a';
          toast(this.keyImportResult, 'success');
        }
        this.keyPassphrase = '';
      } catch (e) {
        this.keyImportResult      = '✗ ' + e.message;
        this.keyImportResultColor = 'var(--red-light)';
        toast(e.message, 'error');
      }
      this.keyImportLoading = false;
    },

    // ── Vérification SAS ───────────────────────────────────────────────────

    // Applique l'état reçu du bridge et démarre le polling si nécessaire.
    _applyVerifStatus(r) {
      const phase = r.phase ?? 'idle';
      if (phase === 'idle') {
        this.verifState = null;
        this._stopVerifPoll();
        return;
      }
      if (phase === 'sas') {
        this.verifState  = 'sas';
        this.verifUserId = r.userId || '';
        if (r.emoji && r.emoji.length > 0) {
          this.verifEmoji = r.emoji;
          this._stopVerifPoll();   // emojis reçus → plus besoin de poller
        } else {
          this._startVerifPoll(); // emojis pas encore prêts → continuer à poller
        }
        return;
      }
      this.verifState  = phase;
      this.verifUserId = r.userId || '';
      this._startVerifPoll();
    },

    // Lance un poll toutes les 2 s pour les phases transitoires (accepted → sas).
    _startVerifPoll() {
      if (this._verifPollTimer) return;
      this._verifPollTimer = setInterval(async () => {
        try {
          const r = await apiFetch('/api/tchap/e2ee/verif-status');
          this._applyVerifStatus(r);
        } catch (_) {}
      }, 2000);
    },

    _stopVerifPoll() {
      if (!this._verifPollTimer) return;
      clearInterval(this._verifPollTimer);
      this._verifPollTimer = null;
    },

    // Appelé par le bouton "Actualiser / Vérifier l'état" — interroge le bridge.
    async acceptVerif() {
      this.verifState = 'accepting';
      try {
        const r = await apiFetch('/api/tchap/e2ee/verif-accept', { method: 'POST' });
        this._applyVerifStatus(r);
      } catch (e) {
        this.verifState  = 'error';
        this.verifError  = e.message;
      }
    },

    async cancelVerif() {
      this._stopVerifPoll();
      try { await apiFetch('/api/tchap/e2ee/verif-cancel', { method: 'POST' }); } catch (_) {}
      this.verifState = null;
    },

    async confirmVerif() {
      this._stopVerifPoll();
      this.verifState = 'confirming';
      try {
        await apiFetch('/api/tchap/e2ee/verif-confirm', { method: 'POST' });
        this.verifState = 'done';
        toast('Appareil vérifié ✓', 'success');
      } catch (e) {
        this.verifState = 'error';
        this.verifError = e.message;
      }
    },

    async mismatchVerif() {
      this._stopVerifPoll();
      try { await apiFetch('/api/tchap/e2ee/verif-mismatch', { method: 'POST' }); } catch (_) {}
      this.verifState = 'error';
      this.verifError = 'Les emojis ne correspondaient pas — vérification annulée.';
    },

    async verifyWithKey() {
      const key = this.verifKeyInput.trim();
      if (!key) return;
      this.verifKeyLoading = true;
      this.verifError = '';
      try {
        await apiFetch('/api/tchap/e2ee/verif-security-key', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key }),
        });
        this.verifState    = 'done';
        this.verifKeyInput = '';
        toast('Appareil vérifié via la clé de sécurité ✓', 'success');
      } catch (e) {
        this.verifError = e.message;
      } finally {
        this.verifKeyLoading = false;
      }
    },

    openResetPassword(admin) { this.resetTarget = admin; this.resetPassword = ''; this.resetError = null; this.resetPasswordModal = true; },

    async doResetPassword() {
      this.resetError = null;
      try {
        await apiFetch(`/api/auth/sysadmins/${this.resetTarget.id}/reset-password`, {
          method: 'POST', body: JSON.stringify({ password: this.resetPassword }),
        });
        toast('Mot de passe réinitialisé', 'success');
        this.resetTarget = null;
      } catch (e) {
        this.resetError = e.message;
      }
    },

    async deleteSysAdmin(admin) {
      if (!confirm(`Supprimer ${admin.username} ?`)) return;
      try {
        await apiFetch(`/api/auth/sysadmins/${admin.id}`, { method: 'DELETE' });
        this.sysAdmins = this.sysAdmins.filter(a => a.id !== admin.id);
        toast('Admin supprimé', 'success');
      } catch (e) {
        toast(e.message, 'error');
      }
    },
  };
}

// ── Vue Crise ──────────────────────────────────────────────
function criseView() {
  return {
    personnel:       [],
    salons:          [],
    unites:          [],
    loading:         true,
    search:          '',
    filters:         { statut: '', unite: '' },
    selectedSalonIds: {},
    selectedAgentIds: {},
    csvNigends:      null,
    csvImportActive: false,
    importCsvOpen:   false,
    deployOpen:      false,
    deploying:       false,
    deployError:     null,
    deployResult:    null,
    deployResultType: null,
    createSalonOpen:    false,
    newSalonNom:        '',
    newSalonDesc:       '',
    createSalonMsg:     '',
    createSalonMsgColor:'',
    createSalonMsgBg:   '',
    creatingsalon:      false,
    _tchapEnabled:      false,

    async load() {
      this.loading = true;
      try {
        const [p, s, u, cfg] = await Promise.all([
          apiFetch('/api/personnel'), apiFetch('/api/salons'), apiFetch('/api/unites'),
          apiFetch('/api/config/tchap_config').catch(() => null),
        ]);
        this.personnel     = p || [];
        this.salons        = s || [];
        this.unites        = u || [];
        this._tchapEnabled = !!(cfg?.token && cfg?.enabled);
      } catch (e) {
        toast(e.message, 'error');
      }
      this.loading = false;
    },

    get crisisSalons() { return this.salons.filter(s => (s.Type || '').toLowerCase() === 'crise'); },

    get tchapEnabled() {
      return this._tchapEnabled || false;
    },

    get allSelected() {
      if (!this.filteredAgents.length) return false;
      return this.filteredAgents.every(a => !!this.selectedAgentIds[a.id]);
    },

    get filteredAgents() {
      let list = this.personnel;
      if (this.filters.statut) list = list.filter(a => (a.Statut || 'actif') === this.filters.statut);
      if (this.filters.unite)  list = list.filter(a => (a.Unite || []).includes(Number(this.filters.unite)));
      if (this.search) {
        const q = this.search.toLowerCase();
        list = list.filter(a => [a.Nom, a.Prenom, a.NiGend].some(v => (v || '').toLowerCase().includes(q)));
      }
      if (this.csvNigends) list = list.filter(a => this.csvNigends[a.NiGend]);
      return list;
    },

    get selectedSalons() { return Object.entries(this.selectedSalonIds).filter(([, v]) => v).map(([id]) => Number(id)); },
    get selectedAgents()  { return Object.entries(this.selectedAgentIds).filter(([, v]) => v).map(([id]) => Number(id)); },

    toggleSalon(id, checked) { this.selectedSalonIds = { ...this.selectedSalonIds, [id]: checked }; },
    toggleAgent(id, checked)  { this.selectedAgentIds = { ...this.selectedAgentIds, [id]: checked }; },

    selectAllSalons() { this.crisisSalons.forEach(s => { this.selectedSalonIds[s.id] = true; }); },
    clearSalons()     { this.selectedSalonIds = {}; },
    selectAllAgents() { this.filteredAgents.forEach(a => { this.selectedAgentIds[a.id] = true; }); },
    clearAgents()     { this.selectedAgentIds = {}; },

    toggleSelectAll(checked) {
      if (checked) this.selectAllAgents();
      else this.clearAgents();
    },

    getAgentUnites(agent) {
      return (agent.Unite || []).map(uid => this.unites.find(u => u.id === Number(uid))).filter(Boolean);
    },

    openCreateSalonModal() {
      this.newSalonNom   = '';
      this.newSalonDesc  = '';
      this.createSalonMsg = '';
      this.createSalonOpen = true;
    },

    async submitCreateSalon() {
      if (!this.newSalonNom.trim()) return;
      this.creatingsalon   = true;
      this.createSalonMsg  = '';
      try {
        const salon = await apiFetch('/api/salons', {
          method: 'POST',
          body: JSON.stringify({ Nom: this.newSalonNom.trim(), Description: this.newSalonDesc, Type: 'crise' }),
        });
        // Créer automatiquement la room Tchap
        this.createSalonMsg     = '⏳ Création de la room Tchap…';
        this.createSalonMsgColor = 'var(--text-secondary)';
        this.createSalonMsgBg   = 'var(--bg-elevated)';
        try {
          await apiFetch(`/api/salons/${salon.id}/create-room`, { method: 'POST' });
          this.createSalonMsgColor = '#6ec38a';
          this.createSalonMsgBg   = 'rgba(39,174,96,.08)';
          this.createSalonMsg     = '✓ Salon créé et room Tchap ouverte';
        } catch (e) {
          this.createSalonMsgColor = 'var(--gold)';
          this.createSalonMsgBg   = 'rgba(201,168,76,.08)';
          this.createSalonMsg     = `✓ Salon créé — room Tchap échouée : ${e.message}`;
        }
        await this.load();
        setTimeout(() => { this.createSalonOpen = false; }, 2000);
      } catch (e) {
        this.createSalonMsgColor = 'var(--red-light)';
        this.createSalonMsgBg   = 'var(--red-dim)';
        this.createSalonMsg     = e.message;
      }
      this.creatingsalon = false;
    },

    getSalonAgentCount(salonId) {
      return this.personnel.filter(a => {
        const sids = this.getExpectedSalons(a);
        return sids.includes(Number(salonId));
      }).length;
    },

    getExpectedSalons(agent) {
      const seen = {};
      (agent.Unite || []).forEach(uid => {
        const u = this.unites.find(u => u.id === Number(uid));
        if (u) (u.Salons || []).forEach(sid => { seen[sid] = true; });
      });
      (agent.Salons_Extra || []).forEach(sid => { seen[sid] = true; });
      return Object.keys(seen).map(Number);
    },

    getAgentSalonsCount(agent) { return this.getExpectedSalons(agent).length; },

    openDeployModal() { this.deployOpen = true; this.deployError = null; this.deployResult = null; },

    async deploy() {
      this.deploying        = true;
      this.deployError      = null;
      this.deployResult     = null;
      this.deployResultType = null;
      try {
        const r = await apiFetch('/api/tchap/apply', {
          method: 'POST',
          body: JSON.stringify({ salonIds: this.selectedSalons, agentIds: this.selectedAgents }),
        });
        const hasErrors = r.errors && r.errors.length > 0;
        this.deployResultType = hasErrors ? 'error' : 'success';
        this.deployResult     = `${hasErrors ? '⚠' : '✓'} Déploiement terminé : ${r.invited} invité(s), ${r.kicked} expulsé(s)`;
        if (hasErrors) {
          this.deployResult += '<br><small style="opacity:.8;">' + r.errors.map(e => `${e.action ?? 'erreur'} ${e.user ?? ''} : ${e.error}`).join('<br>') + '</small>';
        }
        toast(`${r.invited} invité(s), ${r.kicked} expulsé(s)${hasErrors ? ` — ${r.errors.length} erreur(s)` : ''}`, this.deployResultType);
      } catch (e) {
        this.deployResult     = e.message;
        this.deployResultType = 'error';
      }
      this.deploying = false;
    },

    loadNigendCsv(event) {
      const file = event.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = e => {
        const rows = parseCsv(e.target.result);
        const nigends = {};
        rows.forEach(r => { if (r.NiGend) nigends[r.NiGend.trim()] = true; });
        this.csvNigends      = nigends;
        this.csvImportActive = true;
        this.importCsvOpen   = false;
        // Auto-sélectionner les agents trouvés
        this.filteredAgents.forEach(a => {
          if (nigends[a.NiGend]) this.selectedAgentIds[a.id] = true;
        });
        toast(`Import CSV : ${Object.keys(nigends).length} NiGend(s) chargés`, 'info');
      };
      reader.readAsText(file, 'UTF-8');
    },

    clearCsvImport() { this.csvNigends = null; this.csvImportActive = false; this.selectedAgentIds = {}; },
  };
}

// ── Vue Suivi Crise ────────────────────────────────────────
function suiviCriseView() {
  return {
    salons:       [],
    personnel:    [],
    unites:       [],
    loading:      true,
    monitorState: {},
    _tchapEnabled: false,
    deleteTarget:  null,

    async load() {
      this.loading = true;
      try {
        const [s, p, u, cfg] = await Promise.all([
          apiFetch('/api/salons'), apiFetch('/api/personnel'), apiFetch('/api/unites'),
          apiFetch('/api/config/tchap_config').catch(() => null),
        ]);
        this.salons        = (s || []).filter(salon => (salon.Type || '').toLowerCase() === 'crise');
        this.personnel     = p || [];
        this.unites        = u || [];
        this._tchapEnabled = !!(cfg?.token && cfg?.enabled);
      } catch (e) {
        toast(e.message, 'error');
      }
      this.loading = false;
      this.salons.forEach(s => this.refreshSalon(s));
    },

    get salonsCrise() { return this.salons; },

    get hasTchap() { return this._tchapEnabled; },

    async refreshSalon(salon) {
      if (!salon.room_id) return;
      this.monitorState = {
        ...this.monitorState,
        [salon.id]: { ...(this.monitorState[salon.id] || {}), _loading: true, error: null },
      };
      salon._loading = true;
      try {
        const members = await apiFetch(`/api/tchap/members/${encodeURIComponent(salon.room_id)}`);
        this.monitorState = {
          ...this.monitorState,
          [salon.id]: { ...(this.monitorState[salon.id] || {}), members: Array.isArray(members) ? members : [], _loading: false },
        };
      } catch (e) {
        this.monitorState = {
          ...this.monitorState,
          [salon.id]: { ...(this.monitorState[salon.id] || {}), error: e.message, _loading: false },
        };
      }
      salon._loading = false;
    },

    getExpectedCount(salonId) {
      return this.personnel.filter(a => {
        const seen = {};
        (a.Unite || []).forEach(uid => {
          const u = this.unites.find(u => u.id === Number(uid));
          if (u) (u.Salons || []).forEach(s => { seen[s] = true; });
        });
        (a.Salons_Extra || []).forEach(s => { seen[s] = true; });
        return !!seen[salonId];
      }).length;
    },

    async closeSalon(salon) {
      const state = this.monitorState[salon.id];
      if (!state || !state.members) return;
      this.monitorState = { ...this.monitorState, [salon.id]: { ...state, status: 'closing' } };
      try {
        await apiFetch(`/api/tchap/kick-all`, {
          method: 'POST',
          body: JSON.stringify({ roomId: salon.room_id }),
        });
        this.monitorState = { ...this.monitorState, [salon.id]: { ...this.monitorState[salon.id], status: 'ready_delete' } };
        toast('Membres expulsés', 'success');
      } catch (e) {
        this.monitorState = { ...this.monitorState, [salon.id]: { ...this.monitorState[salon.id], status: null, error: e.message } };
        toast(e.message, 'error');
      }
    },

    async confirmDeleteSalon(salon) {
      if (!confirm(`Supprimer définitivement le salon "${salon.Nom}" ?`)) return;
      this.monitorState = { ...this.monitorState, [salon.id]: { ...(this.monitorState[salon.id] || {}), status: 'deleting' } };
      try {
        await apiFetch(`/api/salons/${salon.id}`, { method: 'DELETE' });
        this.monitorState = { ...this.monitorState, [salon.id]: { ...(this.monitorState[salon.id] || {}), status: 'deleted' } };
        toast('Salon supprimé', 'success');
        await this.load();
      } catch (e) {
        this.monitorState = { ...this.monitorState, [salon.id]: { ...(this.monitorState[salon.id] || {}), status: null, error: e.message } };
        toast(e.message, 'error');
      }
    },
  };
}

// ── Vue Carto ──────────────────────────────────────────────
function cartoView() {
  return {
    // ── Data ────────────────────────────────────────────────────
    unites:           [],
    salons:           [],
    personnel:        [],

    // ── Filter state ────────────────────────────────────────────
    search:           '',
    salonSearch:      '',
    salonFilterOpen:  false,
    selectedSalonIds: [],
    sidebarOpen:      false,
    _refreshTimer:    null,
    _refreshBusy:     false,

    // ── Map ─────────────────────────────────────────────────────
    map:     null,
    markers: {},   // { personId: L.Marker }

    // ── Member modal ────────────────────────────────────────────
    memberModalOpen:      false,
    selectedMember:       null,
    memberProfile:        null,
    memberProfileLoading: false,
    memberProfileError:   null,
    memberAvatarUrl:      null,
    tchapHomeserver:      window.TCHAP_HOMESERVER || '',
    sharingPosition:      false,
    sharingError:         null,
    _geoWatchId:          null,

    // ── Computed ────────────────────────────────────────────────
    get filteredSalonList() {
      if (!this.salonSearch) return this.salons;
      const q = this.salonSearch.toLowerCase();
      return this.salons.filter(s => s.Nom.toLowerCase().includes(q));
    },

    get filteredPersonnel() {
      let result = this.personnel;

      if (this.search) {
        const q = this.search.toLowerCase();
        result = result.filter(p =>
          (p.Nom || '').toLowerCase().includes(q) ||
          (p.Prenom || '').toLowerCase().includes(q) ||
          (p.Mail || '').toLowerCase().includes(q)
        );
      }

      if (this.selectedSalonIds.length > 0) {
        result = result.filter(p => {
          const extras = (p.Salons_Extra || []).map(Number);
          if (extras.some(sid => this.selectedSalonIds.includes(sid))) return true;
          const uniteIds = (p.Unite || []).map(Number);
          return uniteIds.some(uid => {
            const u = this.unites.find(u => u.id === uid);
            return u && (u.Salons || []).map(Number).some(sid => this.selectedSalonIds.includes(sid));
          });
        });
      }

      // Géolocalisés en premier, puis partages live détectés
      return [...result].sort((a, b) => {
        const bScore = (this.hasPosition(b) ? 2 : 0) + (this.isLiveSharing(b) ? 1 : 0);
        const aScore = (this.hasPosition(a) ? 2 : 0) + (this.isLiveSharing(a) ? 1 : 0);
        return bScore - aScore;
      });
    },

    get positionCount() {
      return this.filteredPersonnel.filter(p => this.hasPosition(p)).length;
    },

    // ── Helpers ─────────────────────────────────────────────────
    hasPosition(p) {
      return p != null && p.latitude != null && p.longitude != null;
    },

    isLiveSharing(p) {
      return !!(p && p.sharing_live);
    },

    getUniteLabel(p) {
      if (!p) return '';
      return (p.Unite || []).map(uid => {
        const u = this.unites.find(u => u.id === Number(uid));
        return u ? u.Nom : null;
      }).filter(Boolean).join(', ') || '';
    },

    getSharingSalonLabel(p) {
      if (!p || !Array.isArray(p.sharing_salons) || p.sharing_salons.length === 0) return '';
      return p.sharing_salons
        .map(s => s?.Nom || s?.room_id || '')
        .filter(Boolean)
        .join(', ');
    },

    mxcToHttp(mxcUrl) {
      if (!mxcUrl || !mxcUrl.startsWith('mxc://') || !this.tchapHomeserver) return null;
      const path  = mxcUrl.slice(6);
      const slash = path.indexOf('/');
      if (slash < 1) return null;
      const server  = path.slice(0, slash);
      const mediaId = path.slice(slash + 1);
      return `${this.tchapHomeserver.replace(/\/$/, '')}/_matrix/media/v3/download/${server}/${mediaId}`;
    },

    formatLastActive(ms) {
      if (!ms) return '—';
      const s = Math.floor(ms / 1000);
      if (s < 60)  return `${s}s`;
      if (s < 3600) return `${Math.floor(s / 60)} min`;
      if (s < 86400) return `${Math.floor(s / 3600)} h`;
      return `${Math.floor(s / 86400)} j`;
    },

    get currentPersonnelId() {
      return Number(window.PERMISSIONS?.personnelId || 0);
    },

    syncSharingStateFromPersonnel() {
      if (!this.currentPersonnelId) return;
      const self = this.personnel.find(p => Number(p.id) === this.currentPersonnelId);
      if (!self) return;
      this.sharingPosition = this.hasPosition(self) || this.isLiveSharing(self);
    },

    async pushCurrentPosition(lat, lon) {
      await apiFetch('/api/carto/position', {
        method: 'POST',
        body: JSON.stringify({ latitude: lat, longitude: lon }),
      });
    },

    async startSharing() {
      this.sharingError = null;

      if (!navigator.geolocation) {
        this.sharingError = 'La geolocalisation n est pas disponible sur cet appareil';
        return;
      }

      const onSuccess = async (position) => {
        try {
          const { latitude, longitude } = position.coords || {};
          if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
            throw new Error('Coordonnees GPS invalides');
          }

          await this.pushCurrentPosition(latitude, longitude);
          this.sharingPosition = true;
          await this.refreshPositions();
        } catch (e) {
          this.sharingError = e.message || 'Impossible de partager la position';
          toast(this.sharingError, 'error');
        }
      };

      const onError = (error) => {
        const code = error?.code;
        if (code === 1) this.sharingError = 'Autorisation de geolocalisation refusee';
        else if (code === 2) this.sharingError = 'Position indisponible';
        else if (code === 3) this.sharingError = 'Delai de geolocalisation depasse';
        else this.sharingError = 'Impossible de recuperer la position';
      };

      try {
        const initial = await new Promise((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: true,
            timeout: 15000,
            maximumAge: 0,
          });
        });
        await onSuccess(initial);

        if (this._geoWatchId != null) {
          navigator.geolocation.clearWatch(this._geoWatchId);
        }
        this._geoWatchId = navigator.geolocation.watchPosition(onSuccess, onError, {
          enableHighAccuracy: true,
          timeout: 20000,
          maximumAge: 5000,
        });
      } catch (error) {
        onError(error);
      }
    },

    async stopSharing() {
      this.sharingError = null;

      try {
        await apiFetch('/api/carto/position', { method: 'DELETE' });
        this.sharingPosition = false;
        if (this._geoWatchId != null && navigator.geolocation) {
          navigator.geolocation.clearWatch(this._geoWatchId);
          this._geoWatchId = null;
        }
        await this.refreshPositions();
      } catch (e) {
        this.sharingError = e.message || 'Impossible d arreter le partage';
        toast(this.sharingError, 'error');
      }
    },

    // ── Salon filter ─────────────────────────────────────────────
    toggleSalonFilter(id, checked) {
      if (this.selectedSalonIds.length === 0) {
        if (!checked) this.selectedSalonIds = this.salons.filter(s => s.id !== id).map(s => s.id);
      } else {
        if (checked) {
          const next = [...this.selectedSalonIds, id];
          this.selectedSalonIds = next.length >= this.salons.length ? [] : next;
        } else {
          this.selectedSalonIds = this.selectedSalonIds.filter(i => i !== id);
        }
      }
    },

    // ── Map markers ──────────────────────────────────────────────
    updateMarkers() {
      if (!this.map || typeof L === 'undefined') return;

      const keep = new Set(this.filteredPersonnel.filter(p => this.hasPosition(p)).map(p => p.id));

      // Supprimer les marqueurs obsolètes
      for (const [id, marker] of Object.entries(this.markers)) {
        if (!keep.has(Number(id))) { marker.remove(); delete this.markers[id]; }
      }

      // Ajouter les nouveaux marqueurs
      for (const p of this.filteredPersonnel) {
        if (!this.hasPosition(p) || this.markers[p.id]) continue;
        const initials = ((p.Prenom?.[0] || '') + (p.Nom?.[0] || '')).toUpperCase();
        const marker = L.marker([p.latitude, p.longitude], {
          icon: L.divIcon({
            html: `<div class="carto-marker">${initials}</div>`,
            className: '',
            iconSize: [30, 30],
            iconAnchor: [15, 15],
          }),
        }).addTo(this.map);

        marker.bindPopup(
          `<strong>${p.Prenom || ''} ${(p.Nom || '').toUpperCase()}</strong>` +
          (p.Grade ? `<br><small>${p.Grade}</small>` : '')
        );
        marker.on('click', () => this.openMember(p));
        this.markers[p.id] = marker;
      }
    },

    async refreshPositions() {
      if (this._refreshBusy) return;
      this._refreshBusy = true;

      try {
        const data = await apiFetch('/api/carto/positions');
        this.personnel = data || [];
        if (this.memberModalOpen && this.selectedMember?.id) {
          const updated = this.personnel.find(p => p.id === this.selectedMember.id);
          if (updated) this.selectedMember = updated;
        }
        this.syncSharingStateFromPersonnel();
        await this.$nextTick();
        this.updateMarkers();
      } catch (e) {
        // Rafraîchissement silencieux pour garder une expérience fluide.
      } finally {
        this._refreshBusy = false;
      }
    },

    // ── Member modal ──────────────────────────────────────────────
    async openMember(person) {
      this.selectedMember      = person;
      this.memberProfile       = null;
      this.memberAvatarUrl     = null;
      this.memberProfileError  = null;
      this.memberProfileLoading = false;
      this.memberModalOpen     = true;

      if (!person.user_id) return;

      this.memberProfileLoading = true;
      try {
        const profile = await apiFetch(`/api/tchap/profile/${encodeURIComponent(person.user_id)}`);
        this.memberProfile   = profile;
        this.memberAvatarUrl = this.mxcToHttp(profile?.avatar_url) || null;
      } catch (e) {
        this.memberProfileError = e.message;
      }
      this.memberProfileLoading = false;
    },

    closeMember() {
      this.memberModalOpen  = false;
      this.selectedMember   = null;
      this.memberProfile    = null;
      this.memberAvatarUrl  = null;
    },

    // ── Init ──────────────────────────────────────────────────────
    async init() {
      const [u, p, s] = await Promise.all([
        apiFetch('/api/unites'),
        apiFetch('/api/carto/positions'),
        apiFetch('/api/salons'),
      ]);
      this.unites    = u || [];
      this.personnel = p || [];
      this.salons    = s || [];
      this.syncSharingStateFromPersonnel();

      await this.$nextTick();

      if (typeof L !== 'undefined') {
        if (this.map) { this.map.remove(); this.map = null; }
        this.map = L.map('map').setView([46.5, 2.5], 6);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '© OpenStreetMap contributors',
          maxZoom: 19,
        }).addTo(this.map);
        this.updateMarkers();
      }

      this.$watch('search',           () => this.$nextTick(() => this.updateMarkers()));
      this.$watch('selectedSalonIds', () => this.$nextTick(() => this.updateMarkers()));

      // Rafraîchit discrètement la carto pour faire apparaître les nouveaux
      // partages sans imposer un rechargement de page à l'utilisateur.
      this._refreshTimer = setInterval(() => {
        this.refreshPositions();
      }, 10000);
    },

    destroy() {
      if (this._refreshTimer) {
        clearInterval(this._refreshTimer);
        this._refreshTimer = null;
      }
      if (this._geoWatchId != null && navigator.geolocation) {
        navigator.geolocation.clearWatch(this._geoWatchId);
        this._geoWatchId = null;
      }
      if (this.map) { this.map.remove(); this.map = null; }
    },
  };
}

// ── Vue Hiérarchie ─────────────────────────────────────────
function hierarchieView() {
  return {
    niveaux:      [],
    unites:       [],
    tree:         [],   // liste plate construite explicitement (évite les problèmes de réactivité getter)
    personnel:    [],
    loading:      true,
    search:       '',
    collapsedMap:   {},
    filterNiveauId: null,
    selected:       null,
    admins:            [],
    loadingAdmins:     false,
    uniteAdmins:       [],   // unités administratrices
    loadingUniteAdmins: false,
    addUniteAdminOpen:  false,
    addUniteAdminForm:  { unite_source_id: null, role: 'gestionnaire' },
    addUniteAdminSearch: '',
    addUniteAdminSaving: false,
    addUniteAdminError:  null,

    // ── Modale création/édition d'unité
    modalOpen:  false,
    modalMode:  'create',
    modalError: null,
    saving:     false,
    form:       {},

    // ── Modale gestion des niveaux (sysadmin)
    niveauxOpen:  false,
    niveauxForm:  { nom: '', slug: '', insertBefore: null },
    niveauxError: null,
    niveauxSaving: false,

    // ── Modale ajout d'admin
    addAdminOpen:   false,
    addAdminSaving: false,
    addAdminForm:   { personnel_id: null, role: 'gestionnaire' },
    addAdminError:  null,
    addAdminSearch: '',

    // ── Bot par unité (admin/sysadmin)
    bots:          [],
    selectedBotId: null,
    botSaving:     false,

    async load() {
      this.loading = true;
      try { this.niveaux   = await apiFetch('/api/niveaux')   || []; } catch (e) { toast('Niveaux: ' + e.message, 'error'); }
      try { this.unites    = await apiFetch('/api/unites')    || []; } catch (e) { toast('Unités: '  + e.message, 'error'); }
      try { this.personnel = await apiFetch('/api/personnel') || []; } catch (e) { /* non-bloquant */ }
      try { this.bots      = await apiFetch('/api/bots')      || []; } catch (e) { /* admin-only, ignoré pour les autres rôles */ }
      this.rebuildTree();
      this.loading = false;
      this.$watch('search',        () => this.rebuildTree());
      this.$watch('filterNiveauId',() => this.rebuildTree());
      this.$watch('collapsedMap',  () => this.rebuildTree());
    },

    // ── Arbre ──────────────────────────────────────────────
    rebuildTree() {
      const q   = this.search ? this.search.toLowerCase() : '';
      const niv = this.filterNiveauId;
      // N'afficher que les unités qui appartiennent à la hiérarchie :
      // celles avec un niveau ou un parent (les unités virtuelles plates sont exclues)
      let source = this.unites.filter(u => u.niveau_id != null || u.parent_id != null);

      if (q || niv) {
        // eslint-disable-next-line eqeqeq
        const matchIds = new Set(source.filter(u =>
          (q ? u.Nom.toLowerCase().includes(q) || (u.code || '').toLowerCase().includes(q) : true) &&
          (niv ? u.niveau_id == niv : true)
        ).map(u => u.id));
        const withAncestors = new Set(matchIds);
        const addAncestors = id => {
          const u = source.find(x => x.id === id);
          if (u && u.parent_id && !withAncestors.has(u.parent_id)) {
            withAncestors.add(u.parent_id);
            addAncestors(u.parent_id);
          }
        };
        matchIds.forEach(id => addAncestors(id));
        source = source.filter(u => withAncestors.has(u.id));
      }

      const byParent = {};
      source.forEach(u => {
        const pid = u.parent_id != null ? u.parent_id : -1;
        (byParent[pid] = byParent[pid] || []).push(u);
      });
      Object.values(byParent).forEach(arr =>
        arr.sort((a, b) => (a.niveau_ordre ?? 999) - (b.niveau_ordre ?? 999) || a.Nom.localeCompare(b.Nom))
      );
      const result = [];
      const walk = (pid, depth) => {
        (byParent[pid] || []).forEach(u => {
          const hasChildren = (byParent[u.id] || []).length > 0;
          result.push({ ...u, _depth: depth, _hasChildren: hasChildren });
          if (!this.collapsedMap[u.id]) walk(u.id, depth + 1);
        });
      };
      walk(-1, 0);
      this.tree.splice(0, this.tree.length, ...result);
    },

    toggleCollapse(id) {
      this.collapsedMap = { ...this.collapsedMap, [id]: !this.collapsedMap[id] };
    },

    niveauLabel(niveauId) {
      return this.niveaux.find(n => n.id === Number(niveauId))?.nom ?? '—';
    },

    niveauColor(niveauId) {
      const ordre = this.niveaux.find(n => n.id === Number(niveauId))?.ordre ?? 0;
      const colors = ['#c9a84c', '#2d6cdf', '#6ec38a', '#e07b54', '#a78bfa', '#f472b6'];
      return colors[(ordre - 1) % colors.length] || '#8888aa';
    },

    parentLabel(parentId) {
      if (!parentId) return '— (racine)';
      return this.unites.find(u => u.id === Number(parentId))?.Nom ?? `#${parentId}`;
    },

    childCount(id) {
      return this.unites.filter(u => u.parent_id === id).length;
    },

    agentCount(uniteId) {
      return this.personnel.filter(a =>
        (a.Unite || []).includes(Number(uniteId))
      ).length;
    },

    // ── Sélection d'une unité ──────────────────────────────
    selectUnite(unite) {
      // Deuxième clic sur la même unité = désélection
      if (this.selected !== null && this.selected.id == unite.id) {
        this.selected = null;
        return;
      }
      this.selected = unite;
      this.selectedBotId = unite.bot_id ?? null;
      this.admins = [];
      this.loadAdmins(unite.id);
    },

    async loadAdmins(uniteId) {
      this.loadingAdmins = true;
      this.loadingUniteAdmins = true;
      try {
        [this.admins, this.uniteAdmins] = await Promise.all([
          apiFetch(`/api/unites/${uniteId}/admins`),
          apiFetch(`/api/unites/${uniteId}/unite-admins`),
        ]);
      } catch (e) { toast(e.message, 'error'); }
      this.loadingAdmins = false;
      this.loadingUniteAdmins = false;
    },

    // ── Gestion des unités administratrices ───────────────
    get filteredUnitesForAdmin() {
      const q = this.addUniteAdminSearch.toLowerCase();
      const alreadyIds = new Set(this.uniteAdmins.map(a => a.unite_source));
      const cibleId = this.selected?.id;
      return this.unites
        .filter(u => u.id !== cibleId && !alreadyIds.has(u.id))
        .filter(u => !q || u.Nom.toLowerCase().includes(q) || (u.code || '').toLowerCase().includes(q))
        .slice(0, 20);
    },

    async addUniteAdmin() {
      if (!this.selected || !this.addUniteAdminForm.unite_source_id) return;
      this.addUniteAdminError = null;
      this.addUniteAdminSaving = true;
      try {
        await apiFetch(`/api/unites/${this.selected.id}/unite-admins`, {
          method: 'POST',
          body: JSON.stringify({
            unite_source_id: this.addUniteAdminForm.unite_source_id,
            role: this.addUniteAdminForm.role,
          }),
        });
        this.uniteAdmins = await apiFetch(`/api/unites/${this.selected.id}/unite-admins`);
        this.addUniteAdminOpen = false;
        this.addUniteAdminForm = { unite_source_id: null, role: 'gestionnaire' };
        this.addUniteAdminSearch = '';
        toast('Unité administratrice ajoutée', 'success');
      } catch (e) { this.addUniteAdminError = e.message; }
      this.addUniteAdminSaving = false;
    },

    async removeUniteAdmin(entry) {
      if (!confirm(`Retirer « ${entry.source_nom} » de l'administration de cette unité ?`)) return;
      try {
        await apiFetch(`/api/unites/${this.selected.id}/unite-admins/${entry.unite_source}`, { method: 'DELETE' });
        this.uniteAdmins = this.uniteAdmins.filter(a => a.id !== entry.id);
        toast('Association retirée', 'success');
      } catch (e) { toast(e.message, 'error'); }
    },

    // ── Modale Créer/Éditer ────────────────────────────────
    openCreate(parentId = null) {
      const parent    = parentId ? this.unites.find(u => u.id === parentId) : null;
      const parentNiv = parent ? this.niveaux.find(n => n.id === parent.niveau_id) : null;
      const nextNiv   = parentNiv ? this.niveaux.find(n => n.ordre === parentNiv.ordre + 1) : this.niveaux[0];
      this.form = {
        Nom: '', code: '', numero: '', adresse: '',
        parent_id: parentId,
        niveau_id: nextNiv?.id ?? null,
        type: 'reel',
        bot_id: null,
        Salons: [],
      };
      this.modalMode  = 'create';
      this.modalError = null;
      this.modalOpen  = true;
    },

    openEdit(unite) {
      this.form = {
        id:        unite.id,
        Nom:       unite.Nom       || '',
        code:      unite.code      || '',
        numero:    unite.numero    || '',
        adresse:   unite.adresse   || '',
        parent_id: unite.parent_id ?? null,
        niveau_id: unite.niveau_id ?? null,
        type:      unite.type      || 'virtuel',
        bot_id:    unite.bot_id    ?? null,
        Salons:    [...(unite.Salons || [])],
      };
      this.modalMode  = 'edit';
      this.modalError = null;
      this.modalOpen  = true;
    },

    async saveModal() {
      this.saving = true;
      this.modalError = null;
      try {
        const url    = this.modalMode === 'create' ? '/api/unites' : `/api/unites/${this.form.id}`;
        const method = this.modalMode === 'create' ? 'POST' : 'PATCH';
        await apiFetch(url, { method, body: JSON.stringify(this.form) });
        toast(this.modalMode === 'create' ? 'Unité créée' : 'Unité mise à jour', 'success');
        this.modalOpen = false;
        const [u, n] = await Promise.all([apiFetch('/api/unites'), apiFetch('/api/niveaux')]);
        this.unites  = u || [];
        this.niveaux = n || [];
        this.rebuildTree();
        if (this.selected) this.selected = this.unites.find(u => u.id === this.selected.id) ?? null;
      } catch (e) { this.modalError = e.message; }
      this.saving = false;
    },

    async deleteSelected() {
      if (!this.selected) return;
      if (!confirm(`Supprimer l'unité « ${this.selected.Nom} » ?`)) return;
      try {
        await apiFetch(`/api/unites/${this.selected.id}`, { method: 'DELETE' });
        toast('Unité supprimée', 'success');
        this.selected = null;
        this.unites = await apiFetch('/api/unites') || [];
        this.rebuildTree();
      } catch (e) { toast(e.message, 'error'); }
    },

    // ── Gestion des admins ─────────────────────────────────
    get filteredPersonnelForAdmin() {
      const q = this.addAdminSearch.toLowerCase();
      const alreadyIds = new Set(this.admins.map(a => a.personnel_id));
      return this.personnel
        .filter(p => !alreadyIds.has(p.id))
        .filter(p => !q ||
          (p.Nom || '').toLowerCase().includes(q) ||
          (p.Prenom || '').toLowerCase().includes(q) ||
          (p.Mail || '').toLowerCase().includes(q)
        )
        .slice(0, 20);
    },

    async addAdmin() {
      if (!this.selected || !this.addAdminForm.personnel_id) return;
      this.addAdminError = null;
      this.addAdminSaving = true;
      try {
        await apiFetch(`/api/personnel/${this.addAdminForm.personnel_id}/unite-roles`, {
          method: 'POST',
          body: JSON.stringify({ unite_id: this.selected.id, role: this.addAdminForm.role }),
        });
        this.admins = await apiFetch(`/api/unites/${this.selected.id}/admins`);
        this.addAdminOpen = false;
        this.addAdminForm = { personnel_id: null, role: 'gestionnaire' };
        this.addAdminSearch = '';
        toast('Administrateur ajouté', 'success');
      } catch (e) { this.addAdminError = e.message; }
      this.addAdminSaving = false;
    },

    async removeAdmin(admin) {
      if (!confirm(`Retirer le rôle de ${admin.Prenom} ${admin.Nom} sur cette unité ?`)) return;
      try {
        await apiFetch(`/api/personnel/${admin.personnel_id}/unite-roles/${this.selected.id}`, { method: 'DELETE' });
        this.admins = this.admins.filter(a => a.id !== admin.id);
        toast('Rôle retiré', 'success');
      } catch (e) { toast(e.message, 'error'); }
    },

    async saveBotId() {
      if (!this.selected) return;
      this.botSaving = true;
      try {
        const updated = await apiFetch(`/api/unites/${this.selected.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ bot_id: this.selectedBotId }),
        });
        const idx = this.unites.findIndex(u => u.id === this.selected.id);
        if (idx >= 0) this.unites[idx] = updated;
        this.selected = updated;
        toast('Bot mis à jour', 'success');
      } catch (e) { toast(e.message, 'error'); }
      this.botSaving = false;
    },

    // ── Gestion des niveaux (sysadmin) ─────────────────────
    async saveNiveau(niveauId) {
      const niv = this.niveaux.find(n => n.id === niveauId);
      if (!niv) return;
      try {
        await apiFetch(`/api/niveaux/${niveauId}`, {
          method: 'PATCH',
          body: JSON.stringify({ nom: niv.nom }),
        });
        toast('Niveau mis à jour', 'success');
      } catch (e) { toast(e.message, 'error'); }
    },

    async moveNiveauUp(id) {
      const idx = this.niveaux.findIndex(n => n.id === id);
      if (idx <= 0) return;
      const arr = [...this.niveaux];
      [arr[idx - 1], arr[idx]] = [arr[idx], arr[idx - 1]];
      this.niveaux.splice(0, this.niveaux.length, ...arr);
      await this._sendReorder();
    },

    async moveNiveauDown(id) {
      const idx = this.niveaux.findIndex(n => n.id === id);
      if (idx < 0 || idx >= this.niveaux.length - 1) return;
      const arr = [...this.niveaux];
      [arr[idx], arr[idx + 1]] = [arr[idx + 1], arr[idx]];
      this.niveaux.splice(0, this.niveaux.length, ...arr);
      await this._sendReorder();
    },

    async _sendReorder() {
      try {
        const updated = await apiFetch('/api/niveaux/reorder', {
          method: 'POST',
          body: JSON.stringify({ ids: this.niveaux.map(n => n.id) }),
        });
        this.niveaux.splice(0, this.niveaux.length, ...updated);
        toast('Ordre mis à jour', 'success');
      } catch (e) {
        toast(e.message, 'error');
        const n = await apiFetch('/api/niveaux');
        this.niveaux.splice(0, this.niveaux.length, ...(n || []));
      }
    },

    async createNiveau() {
      this.niveauxError = null;
      this.niveauxSaving = true;
      try {
        const payload = { nom: this.niveauxForm.nom, slug: this.niveauxForm.slug };
        if (this.niveauxForm.insertBefore !== null) payload.insertBefore = this.niveauxForm.insertBefore;
        await apiFetch('/api/niveaux', { method: 'POST', body: JSON.stringify(payload) });
        // Recharge tous les niveaux pour avoir les ordres à jour
        const updated = await apiFetch('/api/niveaux');
        this.niveaux.splice(0, this.niveaux.length, ...(updated || []));
        this.niveauxForm = { nom: '', slug: '', insertBefore: null };
        toast('Niveau créé', 'success');
      } catch (e) { this.niveauxError = e.message; }
      this.niveauxSaving = false;
    },

    async deleteNiveau(id) {
      if (!confirm('Supprimer ce niveau ?')) return;
      try {
        await apiFetch(`/api/niveaux/${id}`, { method: 'DELETE' });
        this.niveaux = this.niveaux.filter(n => n.id !== id);
        toast('Niveau supprimé', 'success');
      } catch (e) { toast(e.message, 'error'); }
    },
  };
}

function messagesView() {
  return {
    salons:      [],
    selected:    [],   // IDs des salons cochés
    search:      '',
    body:        '',
    attachments: [],   // [{url, name, mimetype, size, preview}]
    dragOver:    false,
    uploading:   false,
    sending:     false,
    results:     null,
    loading:     true,

    async load() {
      this.loading = true;
      try {
        const s = await apiFetch('/api/salons');
        this.salons = (s || []).filter(s => s.room_id);
      } catch (e) { toast(e.message, 'error'); }
      this.loading = false;
    },

    get filteredSalons() {
      const q = this.search.toLowerCase();
      return this.salons.filter(s => !q || s.Nom.toLowerCase().includes(q) || (s.Type || '').toLowerCase().includes(q));
    },

    isSelected(id) { return this.selected.includes(id); },

    toggleSalon(id) {
      const idx = this.selected.indexOf(id);
      if (idx >= 0) this.selected.splice(idx, 1);
      else this.selected.push(id);
    },

    selectAll() {
      this.selected = this.filteredSalons.map(s => s.id);
    },

    formatSize(bytes) {
      if (!bytes) return '0 o';
      const u = ['o', 'Ko', 'Mo'];
      let i = 0;
      while (bytes >= 1024 && i < u.length - 1) { bytes /= 1024; i++; }
      return Math.round(bytes * 10) / 10 + ' ' + u[i];
    },

    async handleFiles(fileList) {
      for (const file of Array.from(fileList)) {
        if (this.attachments.length >= 5) { toast('Maximum 5 pièces jointes', 'error'); break; }
        if (file.size > 20 * 1024 * 1024)  { toast(`${file.name} dépasse 20 Mo`, 'error'); continue; }

        this.uploading = true;
        try {
          const form = new FormData();
          form.append('file', file);
          const headers = { 'X-Requested-With': 'XMLHttpRequest' };
          if (window.CSRF_TOKEN) headers['X-CSRF-Token'] = window.CSRF_TOKEN;

          const resp   = await fetch('/messages/upload', { method: 'POST', headers, body: form });
          const result = await resp.json();
          if (result.error) throw new Error(result.error);

          const preview = file.type.startsWith('image/') ? URL.createObjectURL(file) : null;
          this.attachments.push({ ...result, preview });
        } catch (e) { toast('Upload : ' + e.message, 'error'); }
        this.uploading = false;
      }
    },

    removeAttachment(idx) {
      const att = this.attachments[idx];
      if (att?.preview) URL.revokeObjectURL(att.preview);
      this.attachments.splice(idx, 1);
    },

    // ── Formatage du texte ──────────────────────────────────
    format(prefix, suffix) {
      const ta  = this.$refs.bodyTextarea;
      if (!ta) return;
      const s   = ta.selectionStart;
      const e   = ta.selectionEnd;
      const sel = this.body.substring(s, e);
      this.body = this.body.substring(0, s) + prefix + (sel || '') + suffix + this.body.substring(e);
      this.$nextTick(() => {
        ta.focus();
        if (sel) {
          ta.selectionStart = s + prefix.length;
          ta.selectionEnd   = e + prefix.length;
        } else {
          ta.selectionStart = ta.selectionEnd = s + prefix.length;
        }
      });
    },

    formatLine(prefix) {
      const ta        = this.$refs.bodyTextarea;
      if (!ta) return;
      const s         = ta.selectionStart;
      const lineStart = this.body.lastIndexOf('\n', s - 1) + 1;
      this.body       = this.body.substring(0, lineStart) + prefix + this.body.substring(lineStart);
      this.$nextTick(() => { ta.focus(); ta.selectionStart = ta.selectionEnd = s + prefix.length; });
    },

    formatLink() {
      const ta  = this.$refs.bodyTextarea;
      if (!ta) return;
      const s   = ta.selectionStart;
      const e   = ta.selectionEnd;
      const sel = this.body.substring(s, e);
      const ins = sel ? `[${sel}](url)` : '[texte](url)';
      this.body = this.body.substring(0, s) + ins + this.body.substring(e);
      this.$nextTick(() => {
        ta.focus();
        const urlStart = s + ins.indexOf('url');
        ta.selectionStart = urlStart;
        ta.selectionEnd   = urlStart + 3;
      });
    },

    insertAtRoom() {
      const ta = this.$refs.bodyTextarea;
      if (!ta) return;
      const s  = ta.selectionStart;
      this.body = this.body.substring(0, s) + '@room' + this.body.substring(s);
      this.$nextTick(() => { ta.focus(); ta.selectionStart = ta.selectionEnd = s + 5; });
    },

    async sendMessages() {
      if (!this.selected.length)                           { toast('Sélectionnez au moins un salon', 'error'); return; }
      if (!this.body.trim() && !this.attachments.length)   { toast('Message vide', 'error'); return; }

      this.sending = true;
      this.results = null;
      try {
        const data = await apiFetch('/messages/send', {
          method: 'POST',
          body:   JSON.stringify({
            salonIds:    this.selected,
            body:        this.body,
            attachments: this.attachments.map(a => ({ url: a.url, name: a.name, mimetype: a.mimetype, size: a.size })),
          }),
        });
        if (data.failed === 0) {
          // Succès total : réinitialiser le formulaire
          this.body        = '';
          this.attachments = [];
          this.selected    = [];
          this.results     = { success: true, sent: data.sent };
        } else {
          // Erreurs partielles : conserver les détails
          this.results = { errors: data.results, sent: data.sent, failed: data.failed };
          toast(`${data.sent} succès, ${data.failed} échec${data.failed > 1 ? 's' : ''}`, 'error');
        }
      } catch (e) { toast(e.message, 'error'); }
      this.sending = false;
    },
  };
}

// ── Enregistrement Alpine ──────────────────────────────────
document.addEventListener('alpine:init', () => {
  Alpine.data('appRoot',        appRoot);
  Alpine.data('toastManager',   toastManager);
  Alpine.data('personnelView',  personnelView);
  Alpine.data('salonView',      salonView);
  Alpine.data('uniteView',      uniteView);
  Alpine.data('configView',     configView);
  Alpine.data('criseView',      criseView);
  Alpine.data('suiviCriseView', suiviCriseView);
  Alpine.data('cartoView',      cartoView);
  Alpine.data('hierarchieView', hierarchieView);
  Alpine.data('messagesView',   messagesView);
});
