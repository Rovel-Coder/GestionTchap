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
  const res = await fetch(url, {
    ...options,
    headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest', ...(options.headers || {}) },
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

function parseCsvLine(line) {
  const result = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { inQuotes = !inQuotes; continue; }
    if (ch === ',' && !inQuotes) { result.push(field.trim()); field = ''; continue; }
    field += ch;
  }
  result.push(field.trim());
  return result;
}

function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return [];
  const headers = parseCsvLine(lines[0]).map(h => h.trim());
  return lines.slice(1).map(line => {
    const vals = parseCsvLine(line);
    const obj = {};
    headers.forEach((h, i) => { obj[h] = vals[i] || ''; });
    return obj;
  });
}

// ── Composant racine ───────────────────────────────────────
function appRoot() {
  return {
    appReady: false,
    init() {
      this.appReady = true;
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
    filters:   { categorie: {}, statut: {}, unite: {}, salons: {} },
    page:      1,
    perPage:   10,
    modalOpen: false,
    modalMode: 'create',
    modalError: null,
    saving:    false,
    deleteTarget: null,
    importOpen: false,
    csvPreview: [],
    csvData:    [],
    importError: null,
    importing:  false,
    form:      {},
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
      if (val.startsWith('@')) return val; // déjà un Matrix ID
      if (!val.includes('@')) return val;  // ni email ni Matrix ID, laisser tel quel
      // C'est une adresse email → convertir en Matrix ID Tchap
      const [local, domain] = val.split('@');
      return `@${local}-${domain}:agent.interieur.tchap.gouv.fr`;
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

    confirmDelete(agent) { this.deleteTarget = agent; },

    async deleteAgent() {
      if (!this.deleteTarget) return;
      this.saving = true;
      try {
        await apiFetch(`/api/personnel/${this.deleteTarget.id}`, { method: 'DELETE' });
        toast('Agent supprimé', 'success');
        this.deleteTarget = null;
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
          const email = (r.Mail || r.Email || r.email || '').trim().toLowerCase();
          let prenom = r.Prenom || r.prenom || '';
          let nom    = r.Nom    || r.nom    || '';
          let userId = r.user_id || '';
          if (!prenom && !nom && email.includes('@')) {
            const local = email.split('@')[0];
            const parts = local.split('.');
            if (parts.length >= 2) {
              prenom = parts[0].charAt(0).toUpperCase() + parts[0].slice(1);
              nom    = parts.slice(1).join(' ').toUpperCase();
            }
          }
          if (!userId && email) {
            const local = email.split('@')[0];
            userId = `@${local}:agent.interieur.tchap.gouv.fr`;
          }
          const valid = !!email;
          const existingAgent = valid ? (this.personnel.find(a => (a.Mail || '').toLowerCase() === email) || null) : null;
          return { ...r, Mail: email, Prenom: prenom || r.Prenom || '', Nom: nom || r.Nom || '', user_id: userId, valid, existingAgent };
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
      return this.csvRows.filter(r => !r.valid);
    },

    async confirmCsvImport() {
      this.csvImporting = true;
      let ok = 0, errors = 0;
      for (const row of this.csvRows.filter(r => r.valid && !r.existingAgent)) {
        try {
          const { valid, existingAgent, ...data } = row;
          await apiFetch('/api/personnel', { method: 'POST', body: JSON.stringify(data) });
          ok++;
        } catch (e) { errors++; }
      }
      for (const row of this.csvRows.filter(r => r.valid && r.existingAgent)) {
        try {
          const { valid, existingAgent, ...data } = row;
          await apiFetch(`/api/personnel/${existingAgent.id}`, { method: 'PATCH', body: JSON.stringify(data) });
          ok++;
        } catch (e) { errors++; }
      }
      toast(`Import terminé : ${ok} traité(s)${errors ? ', ' + errors + ' erreur(s)' : ''}`, errors ? 'error' : 'success');
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
        toast(`Terminé : ${r.invited} invité(s), ${r.kicked} expulsé(s)${r.errors && r.errors.length ? ` — ${r.errors.length} erreur(s)` : ''}`, type);
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
    perPage:    24,
    modalOpen:  false,
    modalMode:  'create',
    modalError: null,
    saving:     false,
    deleteTarget: null,
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
        const members       = await apiFetch(`/api/tchap/members/${encodeURIComponent(salon.room_id)}`);
        salon._memberCount  = Array.isArray(members) ? members.length : 0;
        const cfg           = await apiFetch('/api/config/tchap_config').catch(() => null);
        const botId         = cfg?.botUserId || '';
        salon._botPresent   = botId && Array.isArray(members)
          ? members.some(m => (m.state_key || m.userId || m.user_id || '').toLowerCase() === botId.toLowerCase())
          : undefined;
      } catch (e) {
        salon._error = e.message;
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

    confirmDelete(salon) { this.deleteTarget = salon; },

    async deleteSalon() {
      this.saving = true;
      try {
        await apiFetch(`/api/salons/${this.deleteTarget.id}`, { method: 'DELETE' });
        toast('Salon supprimé', 'success');
        this.deleteTarget = null;
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
    salons:     [],
    personnel:  [],
    loading:    true,
    search:     '',
    modalOpen:  false,
    modalMode:  'create',
    modalError: null,
    saving:     false,
    deleteTarget: null,
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
        const [u, s, p] = await Promise.all([apiFetch('/api/unites'), apiFetch('/api/salons'), apiFetch('/api/personnel')]);
        this.unites    = u || [];
        this.salons    = s || [];
        this.personnel = p || [];
      } catch (e) {
        toast(e.message, 'error');
      }
      this.loading = false;
    },

    get filtered() {
      if (!this.search) return this.unites;
      const q = this.search.toLowerCase();
      return this.unites.filter(u => u.Nom.toLowerCase().includes(q) || (u.code || '').toLowerCase().includes(q));
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
          const local = email.split('@')[0];
          const parts = local.split('.');
          const prenom = parts.length >= 2 ? parts[0].charAt(0).toUpperCase() + parts[0].slice(1) : '';
          const nom    = parts.length >= 2 ? parts.slice(1).join(' ').toUpperCase() : local.toUpperCase();
          this.importNewAgents.push({ email, prenom, nom, user_id: `@${local}:agent.interieur.tchap.gouv.fr` });
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

    openModal(mode, unite = null) {
      this.modalMode  = mode;
      this.modalError = null;
      this.form = unite
        ? { ...unite, Salons: [...(unite.Salons || [])], _salonSearch: '' }
        : { Nom: '', code: '', Salons: [], _salonSearch: '' };
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

    confirmDelete(unite) { this.deleteTarget = unite; },

    async deleteUnite() {
      this.saving = true;
      try {
        await apiFetch(`/api/unites/${this.deleteTarget.id}`, { method: 'DELETE' });
        toast('Unité supprimée', 'success');
        this.deleteTarget = null;
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
    uiConfig:   { roleFeatures: {}, customRoles: [] },
    sysAdmins:  [],
    botLogin:   { username: '', password: '' },
    newAdmin:   { username: '', password: '' },
    loading:    false,
    testing:    false,
    loggingIn:  false,
    loginError: null,
    loginSuccess: null,
    adminError: null,
    resetTarget:     null,
    resetPassword:   '',
    resetError:      null,
    resetPasswordModal: false,
    showLoginForm:   false,
    showLoginPassword: false,
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
        const [t, u, a] = await Promise.all([
          apiFetch('/api/config/tchap_config'),
          apiFetch('/api/config/ui_config'),
          window.PERMISSIONS?.isSysAdmin ? apiFetch('/api/auth/sysadmins') : Promise.resolve([]),
        ]);
        if (t) this.tchapConfig = { ...this.tchapConfig, ...t };
        if (u) this.uiConfig    = u;
        this.sysAdmins = a || [];

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

    async loginBot() {
      this.loggingIn  = true;
      this.loginError = null;
      try {
        const r = await apiFetch('/api/tchap/login', {
          method: 'POST',
          body: JSON.stringify({
            homeserver: this.tchapConfig.homeserver,
            username:   this.botLogin.username,
            password:   this.botLogin.password,
          }),
        });
        this.tchapConfig.token    = r.token;
        this.tchapConfig.botUserId = r.userId;
        this.tchapConfig.enabled  = true;
        this.botLogin.password    = '';
        toast('Bot connecté avec succès', 'success');
      } catch (e) {
        this.loginError = e.message;
      }
      this.loggingIn = false;
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
        this.keyImportResult      = '✓ ' + (r.imported || 0) + ' clés importées';
        this.keyImportResultColor = '#6ec38a';
        this.keyPassphrase        = '';
        toast(this.keyImportResult, 'success');
      } catch (e) {
        this.keyImportResult      = '✗ ' + e.message;
        this.keyImportResultColor = 'var(--red-light)';
        toast(e.message, 'error');
      }
      this.keyImportLoading = false;
    },

    async acceptVerif() {
      this.verifState = 'accepting';
      try {
        const r = await apiFetch('/api/tchap/e2ee/verif-accept', { method: 'POST' });
        this.verifState = 'sas';
        this.verifEmoji = r.emoji || [];
      } catch (e) {
        this.verifState = 'error';
        this.verifError = e.message;
      }
    },

    async cancelVerif() {
      try { await apiFetch('/api/tchap/e2ee/verif-cancel', { method: 'POST' }); } catch (_) {}
      this.verifState = 'cancelled';
    },

    async confirmVerif() {
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
      try { await apiFetch('/api/tchap/e2ee/verif-mismatch', { method: 'POST' }); } catch (_) {}
      this.verifState = 'error';
      this.verifError = 'Les emojis ne correspondaient pas — vérification annulée.';
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
        await apiFetch('/api/salons', {
          method: 'POST',
          body: JSON.stringify({ Nom: this.newSalonNom.trim(), Description: this.newSalonDesc, Type: 'crise' }),
        });
        this.createSalonMsgColor = '#6ec38a';
        this.createSalonMsgBg   = 'rgba(39,174,96,.08)';
        this.createSalonMsg     = '✓ Salon créé avec succès';
        await this.load();
        setTimeout(() => { this.createSalonOpen = false; }, 1200);
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

      // Géolocalisés en premier
      return [...result].sort((a, b) => (this.hasPosition(b) ? 1 : 0) - (this.hasPosition(a) ? 1 : 0));
    },

    get positionCount() {
      return this.filteredPersonnel.filter(p => this.hasPosition(p)).length;
    },

    // ── Helpers ─────────────────────────────────────────────────
    hasPosition(p) {
      return p != null && p.latitude != null && p.longitude != null;
    },

    getUniteLabel(p) {
      if (!p) return '';
      return (p.Unite || []).map(uid => {
        const u = this.unites.find(u => u.id === Number(uid));
        return u ? u.Nom : null;
      }).filter(Boolean).join(', ') || '';
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
        apiFetch('/api/personnel'),
        apiFetch('/api/salons'),
      ]);
      this.unites    = u || [];
      this.personnel = p || [];
      this.salons    = s || [];

      await this.$nextTick();

      if (typeof L !== 'undefined') {
        this.map = L.map('map').setView([46.5, 2.5], 6);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '© OpenStreetMap contributors',
          maxZoom: 19,
        }).addTo(this.map);
        this.updateMarkers();
      }

      this.$watch('search',           () => this.$nextTick(() => this.updateMarkers()));
      this.$watch('selectedSalonIds', () => this.$nextTick(() => this.updateMarkers()));
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
});
