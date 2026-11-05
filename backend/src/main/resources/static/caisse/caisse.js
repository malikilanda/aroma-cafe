/* =====================================================================
   Aroma Café · Caisse (relie tout)
   - Charge le plan de salle, les commandes du jour et les tables.
   - Reçoit les nouvelles commandes en direct (STOMP sur /ws). Si le temps réel coupe,
     la caisse interroge le serveur toutes les 5 secondes : aucune commande n'est perdue.
   - Nouvelle commande : son + pastille rouge sur la table + message + carte dans « À traiter ».
   - Actions : envoyer en cuisine (imprime le ticket cuisine), servie, annuler, addition, encaisser.
   - Service : « Démarrer le service » ouvre les commandes aux clients, « Fermer le service » les arrête.
   ===================================================================== */
(function () {
  "use strict";

  /* ------------------------------------------------------------------ outils */
  const $ = (id) => document.getElementById(id);
  const F = (n) => n.toLocaleString("fr-FR").replace(/\s/g, " ") + " F";
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const hour = (iso) => new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  const minutes = (iso) => Math.max(0, Math.floor((Date.now() - new Date(iso)) / 60000));
  const ago = (iso) => { const m = minutes(iso); return m < 1 ? "à l'instant" : m < 60 ? `il y a ${m} min` : `il y a ${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")}`; };
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* pas grave */ } },
  };
  const STATUS = { NOUVELLE: "Nouvelle", EN_CUISINE: "En cuisine", SERVIE: "Servie", PAYEE: "Réglée", ANNULEE: "Annulée" };
  const UNPAID = ["NOUVELLE", "EN_CUISINE", "SERVIE"];
  const ICON = {
    kitchen: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 13.9A4 4 0 0 1 7.5 6a5 5 0 0 1 9 0A4 4 0 0 1 18 13.9V21H6z"/><path d="M6 17h12"/></svg>',
    check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>',
    print: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9V3h12v6"/><rect x="3" y="9" width="18" height="8" rx="2"/><path d="M6 14h12v7H6z"/></svg>',
    cash: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 12h.01M18 12h.01"/></svg>',
    bell: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>',
    table: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 9h18M6 9v11M18 9v11M4 9l2-4h12l2 4"/></svg>',
  };

  /* ------------------------------------------------------------------ état */
  const orders = new Map();      // id → commande du jour
  const bills = new Map();       // table → heure de la demande d'addition
  let tableCount = 10;
  let tab = "todo";              // todo | today
  let view = { kind: "list" };   // list | order (id) | table (n)
  let freshIds = new Set();      // commandes arrivées depuis peu (carte qui clignote)
  let ready = false;
  let serviceOn = store.get("aroma.caisse.service", false);   // le service a été démarré sur cette tablette

  /* ------------------------------------------------------------------ appels au serveur */
  async function api(path, method = "GET") {
    const r = await fetch(path, { method, cache: "no-store", headers: { Accept: "application/json" } });
    if (r.status === 401) { location.href = "/login.html"; throw new Error("Session expirée"); }
    if (r.status === 204) return null;
    const body = await r.json().catch(() => null);
    if (!r.ok) throw new Error((body && body.message) || "Le serveur ne répond pas.");
    return body;
  }

  /* ------------------------------------------------------------------ son */
  let audio = null;
  let soundOn = store.get("aroma.caisse.son", true);

  /** Une note : fréquence, départ, durée (secondes), volume. */
  function note(freq, at, dur, vol) {
    const t0 = audio.currentTime + at;
    const o = audio.createOscillator(), g = audio.createGain();
    o.type = "triangle";
    o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(audio.destination);
    o.start(t0);
    o.stop(t0 + dur + 0.05);
  }
  /** Nouvelle commande : « ding-dong » montant, répété deux fois. Addition : deux notes plus graves. */
  function ring(kind) {
    if (!audio || !soundOn) return;
    if (audio.state === "suspended") audio.resume();
    if (kind === "bill") { note(659, 0, 0.5, 0.35); note(880, 0.22, 0.7, 0.3); return; }
    if (kind === "soft") { note(988, 0, 0.4, 0.18); return; }
    for (const s of [0, 0.75]) { note(988, s, 0.45, 0.4); note(1319, s + 0.18, 0.8, 0.35); }
  }
  function setSound(on) {
    soundOn = on;
    store.set("aroma.caisse.son", on);
    $("sound").setAttribute("aria-pressed", String(on));
    $("sound").setAttribute("aria-label", on ? "Couper le son des nouvelles commandes" : "Activer le son des nouvelles commandes");
  }

  /* ------------------------------------------------------------------ messages éphémères */
  function toast(msg, kind) {
    const t = document.createElement("div");
    t.className = "toast" + (kind ? " " + kind : "");
    t.innerHTML = msg;
    $("toasts").prepend(t);
    while ($("toasts").children.length > 3) $("toasts").lastChild.remove();
    setTimeout(() => { t.classList.add("out"); setTimeout(() => t.remove(), 250); }, kind === "new" ? 6000 : 3500);
  }

  /* ------------------------------------------------------------------ calculs */
  const byTable = (n) => [...orders.values()].filter((o) => o.table === n && UNPAID.includes(o.status)).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const todo = () => [...orders.values()].filter((o) => o.status === "NOUVELLE" || o.status === "EN_CUISINE")
    .sort((a, b) => (a.status === b.status ? a.createdAt.localeCompare(b.createdAt) : a.status === "NOUVELLE" ? -1 : 1));
  const articles = (o) => o.lines.reduce((a, l) => a + l.quantity, 0);
  const isLate = (o) => (o.status === "NOUVELLE" && minutes(o.createdAt) >= 5) || (o.status === "EN_CUISINE" && minutes(o.transmittedAt || o.createdAt) >= 20);

  function tableState(n) {
    const open = byTable(n);
    const fresh = open.filter((o) => o.status === "NOUVELLE").length;
    const bill = bills.has(n) && open.length > 0;
    const total = open.reduce((a, o) => a + o.total, 0);
    return { open, fresh, bill, total, state: fresh ? "new" : bill ? "bill" : open.length ? "busy" : "free" };
  }

  /* ------------------------------------------------------------------ affichage */
  function render() {
    if (!ready) return;
    // pastilles des tables
    for (const n of Salle.numbers()) {
      const s = tableState(n);
      const parts = [`Table ${n}`];
      if (s.fresh) parts.push(`${s.fresh} nouvelle${s.fresh > 1 ? "s" : ""} commande${s.fresh > 1 ? "s" : ""}`);
      if (s.bill) parts.push("addition demandée");
      if (s.total) parts.push(F(s.total)); else parts.push("libre");
      Salle.setTable(n, { state: s.state, dot: s.fresh || (s.bill ? "bell" : null), sub: s.total ? F(s.total) : "", label: parts.join(", ") });
    }
    // compteurs
    const nNew = [...orders.values()].filter((o) => o.status === "NOUVELLE").length;
    const nTodo = todo().length;
    $("count").hidden = nNew === 0;
    $("count-n").textContent = nNew;
    $("count-label").textContent = nNew > 1 ? "nouvelles" : "nouvelle";
    $("tab-todo-n").textContent = nTodo + [...bills.keys()].filter((n) => byTable(n).length).length + toCollect().length;
    $("tab-todo-n").classList.toggle("hot", nNew > 0);
    $("tab-today-n").textContent = orders.size;
    document.title = (nNew ? `(${nNew}) ` : "") + "Aroma Café · Caisse";

    // un bouton « Confirmer … » est armé : on ne redessine pas le détail sous le doigt de la caissière
    if (view.kind !== "list" && $("detail").querySelector(".armed")) return;
    if (view.kind === "list") renderList();
    else if (view.kind === "order") renderOrder(orders.get(view.id));
    else renderTable(view.n);
  }

  function cardHTML(o) {
    const late = isLate(o);
    return `<button type="button" class="card${o.status === "NOUVELLE" ? " is-new" : ""}${freshIds.has(o.id) ? " fresh" : ""}" data-order="${o.id}">
      <span class="card-t"><small>Table</small><b>${o.table}</b></span>
      <span class="card-top">Commande n° ${o.number}</span>
      <span class="card-side"><span class="pill st-${o.status}">${STATUS[o.status]}</span><span class="${late ? "late" : ""}">${ago(o.status === "EN_CUISINE" ? o.transmittedAt || o.createdAt : o.createdAt)}</span></span>
      <span class="card-sub">${articles(o)} article${articles(o) > 1 ? "s" : ""} · ${F(o.total)}</span>
    </button>`;
  }
  function billCardHTML(n) {
    const s = tableState(n);
    return `<button type="button" class="card" data-table="${n}" style="box-shadow:inset 4px 0 0 var(--amber)">
      <span class="card-t" style="background:var(--amber);color:var(--ink)"><small>Table</small><b>${n}</b></span>
      <span class="card-top">Addition demandée</span>
      <span class="card-side"><span class="pill" style="background:var(--amber-soft);color:var(--amber-ink)">Addition</span><span>${ago(bills.get(n))}</span></span>
      <span class="card-sub">${s.open.length} commande${s.open.length > 1 ? "s" : ""} · ${F(s.total)}</span>
    </button>`;
  }

  /** Tables servies dont rien n'est en attente : il ne reste qu'à encaisser. */
  const toCollect = () => Salle.numbers().filter((n) => {
    const open = byTable(n);
    return open.length && !bills.has(n) && open.every((o) => o.status === "SERVIE");
  });
  function collectCardHTML(n) {
    const s = tableState(n);
    return `<button type="button" class="card is-pay" data-table="${n}">
      <span class="card-t"><small>Table</small><b>${n}</b></span>
      <span class="card-top">À encaisser</span>
      <span class="card-side"><span class="pill st-SERVIE">Servie</span><span>${ago(s.open[s.open.length - 1].servedAt || s.open[0].createdAt)}</span></span>
      <span class="card-sub">${s.open.length} commande${s.open.length > 1 ? "s" : ""} · ${F(s.total)}</span>
    </button>`;
  }

  function renderList() {
    $("side-list").hidden = false;
    $("side-detail").hidden = true;
    $("tab-todo").setAttribute("aria-selected", String(tab === "todo"));
    $("tab-today").setAttribute("aria-selected", String(tab === "today"));
    const list = $("list");
    if (tab === "todo") {
      const billTables = [...bills.keys()].filter((n) => byTable(n).length).sort((a, b) => bills.get(a).localeCompare(bills.get(b)));
      const items = todo();
      const pay = toCollect();
      list.innerHTML = billTables.length || items.length || pay.length
        ? billTables.map(billCardHTML).join("") + items.map(cardHTML).join("")
          + (pay.length ? `<h3 class="list-h">À encaisser</h3>` + pay.map(collectCardHTML).join("") : "")
        : `<p class="empty"><b>Tout est à jour</b>Les nouvelles commandes apparaîtront ici, avec un son et une pastille rouge sur la table.</p>`;
    } else {
      const all = [...orders.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      list.innerHTML = all.length ? all.map(cardHTML).join("") : `<p class="empty"><b>Aucune commande aujourd'hui</b>Le service n'a pas encore commencé.</p>`;
    }
  }

  function linesHTML(o, withPrice = true) {
    return `<ul class="lines">${o.lines.map((l) => `<li>
        <span class="l-q">${l.quantity}×</span><span class="l-n">${esc(l.name)}</span><span class="l-p">${withPrice ? F(l.lineTotal) : ""}</span>
        ${l.options.length ? `<span class="l-o">${l.options.map(esc).join(" · ")}</span>` : ""}
        ${l.note ? `<span class="l-note">« ${esc(l.note)} »</span>` : ""}</li>`).join("")}</ul>`;
  }

  function showDetail(html) {
    $("side-list").hidden = true;
    $("side-detail").hidden = false;
    const d = $("detail");
    const y = d.scrollTop;
    d.innerHTML = html;
    d.scrollTop = y;
  }

  function renderOrder(o) {
    if (!o) { back(); return; }
    const when = o.status === "EN_CUISINE" && o.transmittedAt ? `En cuisine depuis ${hour(o.transmittedAt)}` : `Reçue à ${hour(o.createdAt)} · ${ago(o.createdAt)}`;
    let actions = "";
    if (o.status === "NOUVELLE") actions = `
      <button type="button" class="btn main go" data-act="send">${ICON.kitchen}Envoyer en cuisine</button>
      <p class="btn-hint">Imprime le ticket cuisine.</p>
      <div class="row"><button type="button" class="btn" data-act="receipt">${ICON.print}Ticket caisse</button>
        <button type="button" class="btn danger" data-act="cancel">Annuler</button></div>`;
    else if (o.status === "EN_CUISINE") actions = `
      <button type="button" class="btn main ok" data-act="serve">${ICON.check}Marquer servie</button>
      <div class="row"><button type="button" class="btn" data-act="kitchen">${ICON.print}Réimprimer cuisine</button>
        <button type="button" class="btn danger" data-act="cancel">Annuler</button></div>`;
    else if (o.status === "SERVIE") actions = `
      <button type="button" class="btn main ok" data-act="table">${ICON.cash}Encaisser la table ${o.table} · ${F(tableState(o.table).total)}</button>
      <button type="button" class="btn" data-act="receipt">${ICON.print}Ticket caisse</button>`;
    else actions = `<button type="button" class="btn" data-act="receipt">${ICON.print}Ticket caisse</button>`;

    showDetail(`<div class="d-head">
        <div class="d-table${o.status === "NOUVELLE" ? " new" : ""}"><small>Table</small><b>${o.table}</b></div>
        <div><h2 class="d-title">Commande n° ${o.number} <span class="pill st-${o.status}">${STATUS[o.status]}</span></h2>
          <p class="d-meta ${isLate(o) ? "late" : ""}">${when}</p></div>
      </div>
      ${linesHTML(o)}
      <div class="total"><span>Total</span><strong>${F(o.total)}</strong></div>
      <div class="actions" data-order="${o.id}">${actions}</div>`);
  }

  function renderTable(n) {
    const s = tableState(n);
    const head = `<div class="d-head">
        <div class="d-table ${s.state === "new" ? "new" : s.state === "bill" ? "bill" : ""}"><small>Table</small><b>${n}</b></div>
        <div><h2 class="d-title">Table ${n}</h2>
          <p class="d-meta">${s.open.length ? `${s.open.length} commande${s.open.length > 1 ? "s" : ""} en cours · depuis ${hour(s.open[0].createdAt)}` : "Libre"}</p></div>
      </div>`;
    if (!s.open.length) {
      showDetail(head + `<p class="empty" style="margin-top:8vh"><b>Table libre</b>Aucune commande en cours à cette table.</p>`);
      return;
    }
    const subs = s.open.map((o) => `<section class="sub-orders">
        <h3><span>N° ${o.number} · ${hour(o.createdAt)} <span class="pill st-${o.status}">${STATUS[o.status]}</span></span>
          <button type="button" data-open="${o.id}">Ouvrir</button></h3>
        ${linesHTML(o)}</section>`).join("");
    showDetail(head + `
      ${s.bill ? `<p class="notice bill">${ICON.bell}<span><b>Addition demandée</b> ${ago(bills.get(n))} : apportez-la à la table.</span></p>` : ""}
      ${subs}
      <div class="total"><span>À régler</span><strong>${F(s.total)}</strong></div>
      <div class="actions" data-table="${n}">
        <button type="button" class="btn main" data-act="bill">${ICON.print}Imprimer l'addition</button>
        <button type="button" class="btn ok" data-act="close">${ICON.cash}Encaisser · ${F(s.total)}</button>
        <p class="btn-hint">Encaisser clôture toutes les commandes de la table.</p>
      </div>`);
  }

  /* ------------------------------------------------------------------ navigation */
  function openOrder(id) {
    const o = orders.get(id);
    if (!o) return;
    view = { kind: "order", id };
    Salle.select(o.table);
    render();
    $("back").focus({ preventScroll: true });
  }
  function openTable(n) {
    view = { kind: "table", n };
    Salle.select(n);
    render();
  }
  function back() {
    view = { kind: "list" };
    Salle.select(null);
    render();
  }

  /** Bouton à confirmer d'un second appui (annuler, encaisser) : évite les erreurs en plein service. */
  function confirmFirst(btn, text) {
    if (btn.classList.contains("armed")) return true;
    const old = btn.innerHTML;
    btn.classList.add("armed");
    btn.textContent = text;
    setTimeout(() => { if (btn.isConnected) { btn.classList.remove("armed"); btn.innerHTML = old; } }, 4000);
    return false;
  }

  async function run(btn, task) {
    btn.disabled = true;
    try { await task(); }
    catch (e) { toast(esc(e.message), "err"); }
    finally { if (btn.isConnected) btn.disabled = false; }
  }

  async function act(btn) {
    const box = btn.closest(".actions");
    const what = btn.dataset.act;
    if (box.dataset.order) {
      const o = orders.get(+box.dataset.order);
      if (what === "receipt") return Tickets.receipt(o);
      if (what === "kitchen") return Tickets.kitchen(o);
      if (what === "table") return openTable(o.table);
      if (what === "send") return run(btn, async () => {
        const v = await api(`/api/caisse/orders/${o.id}/transmettre`, "POST");
        upsert(v);
        Tickets.kitchen(v);
        toast(`Commande n° ${v.number} envoyée en cuisine`);
        render();
      });
      if (what === "serve") return run(btn, async () => {
        upsert(await api(`/api/caisse/orders/${o.id}/servir`, "POST"));
        toast(`Commande n° ${o.number} servie`);
        openTable(o.table);              // la suite logique : l'addition et l'encaissement de la table
      });
      if (what === "cancel") {
        if (!confirmFirst(btn, `Confirmer l'annulation du n° ${o.number}`)) return;
        return run(btn, async () => {
          upsert(await api(`/api/caisse/orders/${o.id}/annuler`, "POST"));
          toast(`Commande n° ${o.number} annulée`);
          back();
        });
      }
    }
    if (box.dataset.table) {
      const n = +box.dataset.table;
      if (what === "bill") return run(btn, async () => Tickets.bill(await api(`/api/caisse/tables/${n}/addition`)));
      if (what === "close") {
        const total = tableState(n).total;
        if (!confirmFirst(btn, `Confirmer : ${F(total)} reçus`)) return;
        return run(btn, async () => {
          await api(`/api/caisse/tables/${n}/encaisser`, "POST");
          for (const o of byTable(n)) o.status = "PAYEE";
          bills.delete(n);
          toast(`Table ${n} encaissée · ${F(total)}`);
          back();
        });
      }
    }
  }

  /* ------------------------------------------------------------------ données */
  /** Ajoute ou met à jour une commande ; renvoie true si elle est nouvelle pour la caisse. */
  function upsert(o) {
    const isNew = !orders.has(o.id);
    orders.set(o.id, o);
    return isNew;
  }

  function announce(o) {
    freshIds.add(o.id);
    setTimeout(() => { freshIds.delete(o.id); }, 5000);
    ring("new");
    Salle.bump(o.table);
    toast(`<b>Nouvelle commande · Table ${o.table}</b>&nbsp;n° ${o.number} · ${F(o.total)}`, "new");
  }

  async function loadTables() {
    const list = await api("/api/caisse/tables");
    tableCount = list.length;
    const before = new Set(bills.keys());
    bills.clear();
    for (const t of list) if (t.billRequestedAt) bills.set(t.table, t.billRequestedAt);
    return [...bills.keys()].filter((n) => !before.has(n));
  }

  /** Rechargement complet (au démarrage, après une coupure, puis régulièrement par sécurité). */
  async function sync(silent) {
    const [today, newBills] = await Promise.all([api("/api/caisse/orders?scope=today"), loadTables()]);
    const ids = new Set(today.map((o) => o.id));
    for (const id of [...orders.keys()]) if (!ids.has(id)) orders.delete(id);   // changement de jour
    for (const o of today) if (upsert(o) && !silent && o.status === "NOUVELLE") announce(o);
    if (!silent) for (const n of newBills) billAlert(n);
    render();
    await keepServiceOpen();
  }

  /* ------------------------------------------------------------------ service (ouverture / fermeture) */
  /** Si le serveur a redémarré pendant le service, il a oublié qu'il était ouvert : on le lui rappelle. */
  async function keepServiceOpen() {
    if (!serviceOn) return;
    const s = await api("/api/caisse/service");
    if (!s.ouvert) await api("/api/caisse/service/ouvrir", "POST");
  }

  function showStart(message) {
    $("start-state").textContent = message || "";
    $("start-state").hidden = !message;
    $("start-btn").textContent = serviceOn ? "Reprendre le service" : "Démarrer le service";
    $("start-btn").disabled = false;
    $("start").hidden = false;
    setTimeout(() => $("start-btn").focus(), 50);
  }

  async function openService() {
    const btn = $("start-btn");
    btn.disabled = true;
    btn.textContent = "Ouverture…";
    try {
      await api("/api/caisse/service/ouvrir", "POST");
      serviceOn = true;
      store.set("aroma.caisse.service", true);
      $("start").hidden = true;
      toast("Service ouvert : les clients peuvent commander");
    } catch (e) {
      btn.disabled = false;
      btn.textContent = "Réessayer";
      $("start-state").textContent = "Impossible de joindre le serveur. Vérifiez la connexion Internet, puis réessayez.";
      $("start-state").hidden = false;
    }
  }

  async function closeService(btn) {
    const unpaid = Salle.numbers().filter((n) => byTable(n).length).length;
    const text = unpaid ? `Encore ${unpaid} table${unpaid > 1 ? "s" : ""} à encaisser · Fermer quand même` : "Confirmer la fermeture";
    if (!btn.classList.contains("armed")) {
      btn.classList.add("armed");
      btn.querySelector(".bar-btn-l").textContent = "Confirmer";
      toast(text, unpaid ? "bill" : "");
      setTimeout(() => { btn.classList.remove("armed"); btn.querySelector(".bar-btn-l").textContent = "Fermer"; }, 4000);
      return;
    }
    btn.classList.remove("armed");
    btn.querySelector(".bar-btn-l").textContent = "Fermer";
    try {
      await api("/api/caisse/service/fermer", "POST");
      serviceOn = false;
      store.set("aroma.caisse.service", false);
      back();
      showStart(`Service fermé à ${hour(new Date().toISOString())} : les clients ne peuvent plus commander.`);
    } catch (e) {
      toast(esc(e.message), "err");
    }
  }

  function billAlert(n) {
    ring("bill");
    toast(`<b>Table ${n}</b>&nbsp;demande l'addition`, "bill");
    Salle.bump(n);
  }

  /** Message temps réel reçu du serveur. */
  function onEvent(ev) {
    if (ev.order) {
      const isNew = upsert(ev.order);
      if (ev.type === "ORDER_CREATED" && isNew) announce(ev.order);
    }
    if (ev.type === "BILL_REQUESTED") { bills.set(ev.table, new Date().toISOString()); billAlert(ev.table); }
    if (ev.type === "TABLE_CLOSED") {
      bills.delete(ev.table);
      for (const o of byTable(ev.table)) o.status = "PAYEE";
    }
    render();
  }

  /* ------------------------------------------------------------------ temps réel */
  let live = false, pollTimer = 0;
  function setLive(on, text) {
    live = on;
    $("live").classList.toggle("ok", on);
    $("live-text").textContent = text || (on ? "En direct" : "Reconnexion…");
  }

  function connect() {
    if (!window.StompJs) { setLive(false, "Mode secours"); return; }
    const client = new StompJs.Client({
      brokerURL: (location.protocol === "https:" ? "wss://" : "ws://") + location.host + "/ws",
      reconnectDelay: 3000,
      heartbeatIncoming: 10000,
      heartbeatOutgoing: 10000,
    });
    client.onConnect = () => {
      setLive(true);
      client.subscribe("/topic/caisse", (m) => { try { onEvent(JSON.parse(m.body)); } catch (e) { console.error(e); } });
      sync(false).catch(() => {});        // rattrape ce qui est arrivé pendant la coupure
    };
    client.onWebSocketClose = () => setLive(false);
    client.onStompError = () => setLive(false);
    client.activate();
  }

  /** Filet de sécurité : toutes les 5 s sans temps réel, toutes les 30 s avec. */
  function poll() {
    clearTimeout(pollTimer);
    pollTimer = setTimeout(async () => {
      try {
        await sync(false);
        if (!window.StompJs) setLive(false, "Mode secours");
      } catch (e) {
        setLive(false, "Serveur injoignable");
      }
      poll();
    }, live ? 30000 : 5000);
  }

  /** Rappel discret si une commande attend depuis plus de 2 minutes. */
  setInterval(() => {
    if ([...orders.values()].some((o) => o.status === "NOUVELLE" && minutes(o.createdAt) >= 2)) ring("soft");
  }, 60000);

  /* ------------------------------------------------------------------ horloge */
  function tick() {
    $("clock").textContent = new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  }
  setInterval(() => { tick(); render(); }, 30000);   // met aussi à jour les « il y a … min »

  /* ------------------------------------------------------------------ événements de l'écran */
  $("list").addEventListener("click", (e) => {
    const c = e.target.closest(".card");
    if (!c) return;
    if (c.dataset.order) openOrder(+c.dataset.order);
    else if (c.dataset.table) openTable(+c.dataset.table);
  });
  $("detail").addEventListener("click", (e) => {
    const b = e.target.closest("[data-act]");
    if (b) return act(b);
    const o = e.target.closest("[data-open]");
    if (o) openOrder(+o.dataset.open);
  });
  $("back").onclick = back;
  $("tab-todo").onclick = () => { tab = "todo"; render(); };
  $("tab-today").onclick = () => { tab = "today"; render(); };
  $("sound").onclick = () => { setSound(!soundOn); if (soundOn) ring("soft"); };
  $("test-sound").onclick = () => { closeMore(); ring("new"); };

  const moreBtn = $("more-btn"), moreMenu = $("more-menu");
  function closeMore() { moreMenu.hidden = true; moreBtn.setAttribute("aria-expanded", "false"); }
  moreBtn.onclick = (e) => { e.stopPropagation(); const open = moreMenu.hidden; moreMenu.hidden = !open; moreBtn.setAttribute("aria-expanded", String(open)); };
  document.addEventListener("click", (e) => { if (!moreMenu.hidden && !moreMenu.contains(e.target)) closeMore(); });
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (!moreMenu.hidden) closeMore(); else if (view.kind !== "list") back();
  });

  // « Démarrer le service » : débloque le son (exigé par les navigateurs) et ouvre les commandes aux clients
  $("start-btn").onclick = () => {
    try {
      if (!audio) audio = new (window.AudioContext || window.webkitAudioContext)();
      ring("soft");
    } catch (e) { /* pas de son possible : la pastille rouge reste */ }
    openService();
  };
  // « Fermer le service » : deux appuis (le premier affiche « Confirmer »)
  $("stop").onclick = (e) => closeService(e.currentTarget);

  /* ------------------------------------------------------------------ démarrage */
  async function boot() {
    tick();
    setSound(soundOn);
    if (serviceOn) $("start-btn").textContent = "Reprendre le service";
    let plan = {};
    try { plan = await api("/caisse/salle.json"); } catch (e) { /* plan absent : tables rangées automatiquement */ }
    try { await loadTables(); } catch (e) { /* le compte de tables par défaut sera utilisé */ }

    Salle.init({ floor: $("floor"), canvas: $("salle"), tags: $("tags"), plan, count: tableCount, onSelect: openTable });
    ready = true;

    try { await sync(true); } catch (e) { setLive(false, "Serveur injoignable"); render(); }
    connect();
    poll();
  }
  boot();
})();
