/* =====================================================================
   Aroma Café · Commande à table (côté client)
   - La table vient du QR code : /?t=5&k=<jeton signé>. Sans QR valide, le menu reste consultable mais pas commandable.
   - Sans serveur (menu en ligne sur Netlify) : simple consultation, rien ne s'affiche en plus.
   - Le panier est gardé sur le téléphone (localStorage) ; les prix affichés sont indicatifs, le serveur recalcule tout.
   - Après l'envoi, le statut de chaque commande est suivi en direct (Reçue → En préparation → Servie).
   ===================================================================== */
(function () {
  "use strict";

  /* ------------------------------------------------------------------ outils */
  const $ = (id) => document.getElementById(id);
  const F = (n) => n.toLocaleString("fr-FR").replace(/\s/g, "\u202f") + "\u00a0F";
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* stockage indisponible : on continue en mémoire */ } },
  };
  const uuid = () => (window.crypto && crypto.randomUUID ? crypto.randomUUID() : "c" + Date.now().toString(36) + Math.random().toString(36).slice(2, 12));
  const today = () => new Date().toDateString();
  const timeOf = (iso) => new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  const STATUS = { NOUVELLE: "Reçue", EN_CUISINE: "En préparation", SERVIE: "Servie", PAYEE: "Réglée", ANNULEE: "Annulée" };
  const STEP = { NOUVELLE: 1, EN_CUISINE: 2, SERVIE: 3, PAYEE: 3, ANNULEE: 0 };

  async function api(path, opts = {}) {
    const r = await fetch(path, Object.assign({ headers: { "Content-Type": "application/json" }, cache: "no-store" }, opts));
    if (r.status === 204) return null;
    let body = null;
    try { body = await r.json(); } catch (e) { /* réponse vide */ }
    if (!r.ok) {
      const err = new Error((body && body.message) || "Le serveur ne répond pas. Vérifiez que vous êtes connecté au Wi-Fi du café.");
      err.status = r.status;
      throw err;
    }
    return body;
  }

  /* ------------------------------------------------------------------ état */
  let mode = "static"; // static (pas de serveur) | browse (pas de QR) | checking | order | invalid | offline
  let table = null, token = null;
  let cart = [];      // {key, itemId, name, cat, qty, unit, options:{groupId:[choiceId]}, labels:[], note}
  let pendingRef = null; // identifiant d'envoi réutilisé si l'envoi échoue puis est relancé
  let orders = [];    // commandes du jour à cette table
  let billAskedAt = 0;
  const K = () => ({ cart: "aroma.cart." + table, orders: "aroma.orders." + table, bill: "aroma.bill." + table, ref: "aroma.ref." + table });

  function save() {
    if (!table) return;
    store.set(K().cart, cart);
    store.set(K().orders, { day: today(), list: orders });
    store.set(K().ref, pendingRef);
  }

  function findItem(id) {
    for (const c of CARTE) for (const it of c.items) if (it.id === id) return it;
    return null;
  }

  /* ------------------------------------------------------------------ structure */
  const root = $("commande-root");
  root.innerHTML = `
    <div class="cbar" id="cbar" hidden><div class="cbar-in">
      <button type="button" class="cbtn cbar-orders" id="cbar-orders" hidden><span class="dot"></span><span>Mes commandes</span></button>
      <button type="button" class="cbtn cbar-cart" id="cbar-cart"><span class="cbar-count" id="cbar-count">0</span><span class="cbar-label">Voir le panier</span><span class="cbar-total" id="cbar-total"></span></button>
    </div></div>
    <div class="scrim" id="scrim" hidden></div>
    <section class="sheet" id="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-title" hidden>
      <div class="sheet-grip"></div>
      <button type="button" class="sheet-close" id="sheet-close" aria-label="Fermer">×</button>
      <div class="sheet-body" id="sheet-body"></div>
      <div class="sheet-foot" id="sheet-foot"></div>
    </section>
    <div class="toast" id="toast" role="status" aria-live="polite"></div>`;

  const header = document.querySelector("header.top");
  const badge = document.createElement("div");
  badge.className = "tbadge off";
  badge.id = "tbadge";
  badge.hidden = true;
  header.appendChild(badge);

  const banner = document.createElement("div");
  banner.className = "info-banner";
  banner.hidden = true;
  document.querySelector("main.wrap").prepend(banner);

  /* ------------------------------------------------------------------ table (QR code) */
  async function detectTable() {
    if (!window.SERVEUR) return; // menu en ligne sans serveur : consultation seule
    const q = new URLSearchParams(location.search);
    let t = parseInt(q.get("t"), 10), k = q.get("k");
    const fromUrl = !!(t && k);
    if (!fromUrl) {
      const saved = store.get("aroma.table", null);
      if (saved && Date.now() - saved.at < 8 * 3600e3) { t = saved.t; k = saved.k; }
    }
    if (!(t && k)) { setMode("browse"); return; }
    setMode("checking");
    try {
      await api(`/api/tables/${t}/check?k=${encodeURIComponent(k)}`);
      table = t; token = k;
      store.set("aroma.table", { t, k, at: Date.now() });
      cart = store.get(K().cart, []);
      const o = store.get(K().orders, null);
      orders = o && o.day === today() ? o.list : [];
      pendingRef = store.get(K().ref, null);
      billAskedAt = store.get(K().bill, 0);
      setMode("order");
      refreshOrders();
    } catch (e) {
      if (e.status === 403) { store.set("aroma.table", null); setMode("invalid"); }
      else { setMode("offline"); }
    }
  }

  function setMode(m) {
    mode = m;
    badge.hidden = m === "static";
    badge.className = "tbadge" + (m === "order" ? "" : m === "invalid" || m === "offline" ? " warn" : " off");
    badge.textContent = m === "order" ? "Table " + table : m === "checking" ? "Connexion…" : m === "invalid" ? "QR code invalide" : m === "offline" ? "Hors connexion" : "Consultation";
    banner.hidden = m === "order" || m === "checking" || m === "static";
    if (m === "browse") banner.innerHTML = "<strong>Envie de commander ?</strong>Scannez le QR code posé sur votre table : vous pourrez commander directement depuis ce menu.";
    if (m === "invalid") banner.innerHTML = "<strong>Ce QR code n'est pas reconnu.</strong>Scannez à nouveau le QR code de votre table, ou demandez à un serveur.";
    if (m === "offline") banner.innerHTML = "<strong>Impossible de joindre le café.</strong>Connectez-vous au Wi-Fi d'Aroma Café, puis rechargez la page.";
    if (typeof rerender === "function") rerender();
    updateBar();
  }

  /* ------------------------------------------------------------------ point d'entrée pour le menu */
  window.Commande = {
    enabled: () => mode === "order",
    rowExtra(id) {
      const n = cart.filter((l) => l.itemId === id).reduce((a, l) => a + l.qty, 0);
      return `<span class="add${n ? " in" : ""}" aria-hidden="true">${n || "+"}</span>`;
    },
  };

  document.addEventListener("click", (e) => {
    const row = e.target.closest(".item.orderable");
    if (row && !sheetOpen) openProduct(row.dataset.id);
  });
  document.addEventListener("keydown", (e) => {
    if ((e.key === "Enter" || e.key === " ") && e.target.matches && e.target.matches(".item.orderable")) { e.preventDefault(); openProduct(e.target.dataset.id); }
    if (e.key === "Escape" && sheetOpen) closeSheet();
  });

  /* ------------------------------------------------------------------ barre panier */
  function updateBar() {
    const bar = $("cbar");
    const count = cart.reduce((a, l) => a + l.qty, 0), total = cart.reduce((a, l) => a + l.qty * l.unit, 0);
    const show = mode === "order" && (count > 0 || orders.length > 0);
    bar.hidden = !show;
    document.body.classList.toggle("has-cbar", show);
    $("cbar-cart").hidden = count === 0;
    $("cbar-count").textContent = count;
    $("cbar-total").textContent = F(total);
    const ob = $("cbar-orders");
    ob.hidden = orders.length === 0;
    ob.classList.toggle("solo", count === 0);
    ob.querySelector(".dot").hidden = !orders.some((o) => o.status === "NOUVELLE" || o.status === "EN_CUISINE");
  }
  $("cbar-cart").onclick = () => openCart();
  $("cbar-orders").onclick = () => openOrders();

  /* ------------------------------------------------------------------ fiche générique */
  let sheetOpen = false, lastFocus = null, onSheetClose = null;
  function openSheet(body, foot, onClose) {
    $("sheet-body").innerHTML = body;
    $("sheet-foot").innerHTML = foot || "";
    $("sheet-body").scrollTop = 0;
    onSheetClose = onClose || null;
    if (!sheetOpen) {
      lastFocus = document.activeElement;
      sheetOpen = true;
      document.body.classList.add("locked");
      $("scrim").hidden = false; $("sheet").hidden = false;
      requestAnimationFrame(() => { $("scrim").classList.add("on"); $("sheet").classList.add("on"); });
      setTimeout(() => $("sheet-close").focus({ preventScroll: true }), 60);
    }
  }
  function closeSheet() {
    if (!sheetOpen) return;
    sheetOpen = false;
    $("scrim").classList.remove("on"); $("sheet").classList.remove("on");
    document.body.classList.remove("locked");
    setTimeout(() => { if (!sheetOpen) { $("scrim").hidden = true; $("sheet").hidden = true; } }, 320);
    if (onSheetClose) onSheetClose();
    if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
  }
  $("sheet-close").onclick = closeSheet;
  $("scrim").onclick = closeSheet;

  let toastTimer = 0;
  function toast(msg) {
    const t = $("toast");
    t.textContent = msg;
    t.classList.add("on");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove("on"), 2600);
  }

  /* ------------------------------------------------------------------ fiche produit */
  function openProduct(id) {
    const it = findItem(id);
    if (!it || mode !== "order") return;
    const groups = it.options || [];
    let qty = 1;

    const groupHTML = groups.map((g) => {
      const multi = g.type === "multi";
      const many = g.choices.length > 4 && g.choices.every((c) => c.label.length < 16);
      const choices = (!multi && !g.required ? [{ id: "", label: "Sans", price: 0 }] : []).concat(g.choices);
      return `<fieldset class="grp" data-g="${esc(g.id)}"><legend>${esc(g.label)}<small class="${g.required ? "req" : ""}">${g.required ? "Obligatoire" : multi ? "Plusieurs choix" : "Facultatif"}</small></legend>
        <div class="opts${many ? " cols" : ""}">${choices.map((c, i) => `
          <label class="opt${multi ? " multi" : ""}"><input type="${multi ? "checkbox" : "radio"}" name="g-${esc(g.id)}" value="${esc(c.id)}"${!multi && !g.required && i === 0 ? " checked" : ""}>
            <span class="mark"></span><span class="opt-l">${esc(c.label)}</span>${c.price ? `<span class="opt-p">+${F(c.price)}</span>` : ""}</label>`).join("")}
        </div></fieldset>`;
    }).join("");

    const body = `<p class="sh-kicker">${esc(it.cat)}</p><h2 class="sh-title" id="sheet-title">${esc(it.n)}</h2>
      ${it.s ? `<p class="sh-sub">${esc(it.s)}</p>` : ""}<p class="sh-price">${esc(itemPrice(it))}</p>
      ${groupHTML}
      <label class="note-l" for="sh-note">Une précision ? <small>(facultatif)</small></label>
      <textarea class="note" id="sh-note" maxlength="140" rows="2" placeholder="Ex. : sans sucre, bien glacé, sans oignon…"></textarea>`;
    const foot = `<div class="qty"><button type="button" id="q-minus" aria-label="Un de moins">−</button><output id="q-val" aria-live="polite">1</output><button type="button" id="q-plus" aria-label="Un de plus">+</button></div>
      <button type="button" class="cta" id="sh-add"></button>`;
    openSheet(body, foot);

    const read = () => {
      const sel = {}, labels = [];
      let unit = it.p, missing = null;
      for (const g of groups) {
        const ids = [...document.querySelectorAll(`[data-g="${CSS.escape(g.id)}"] input:checked`)].map((i) => i.value).filter(Boolean);
        if (g.required && !ids.length && !missing) missing = g.label;
        if (ids.length) sel[g.id] = ids;
        for (const id of ids) {
          const c = g.choices.find((x) => x.id === id);
          unit += c.price;
          labels.push(c.price ? `${c.label} (+${F(c.price)})` : g.required ? c.label : `${g.label} : ${c.label}`);
        }
      }
      return { sel, labels, unit, missing };
    };
    const refresh = () => {
      const r = read(), btn = $("sh-add");
      $("q-val").textContent = qty;
      $("q-minus").disabled = qty <= 1;
      $("q-plus").disabled = qty >= 20;
      btn.disabled = !!r.missing;
      btn.textContent = r.missing ? `Choisissez : ${r.missing.toLowerCase()}` : `Ajouter · ${F(r.unit * qty)}`;
    };
    $("sheet-body").addEventListener("change", refresh);
    $("q-minus").onclick = () => { qty = Math.max(1, qty - 1); refresh(); };
    $("q-plus").onclick = () => { qty = Math.min(20, qty + 1); refresh(); };
    $("sh-add").onclick = () => {
      const r = read();
      if (r.missing) return;
      const note = $("sh-note").value.trim().slice(0, 140);
      const key = it.id + "|" + JSON.stringify(r.sel) + "|" + note;
      const same = cart.find((l) => l.key === key);
      if (same) same.qty = Math.min(20, same.qty + qty);
      else cart.push({ key, itemId: it.id, name: it.n, cat: it.cat, qty, unit: r.unit, options: r.sel, labels: r.labels, note });
      pendingRef = null;
      save();
      closeSheet();
      rerender();
      updateBar();
      const b = $("cbar-cart"); b.classList.remove("bump"); void b.offsetWidth; b.classList.add("bump");
      toast(`Ajouté : ${qty > 1 ? qty + " × " : ""}${it.n}`);
    };
    refresh();
  }

  /* ------------------------------------------------------------------ panier */
  function openCart() {
    const lines = cart.map((l, i) => `<li class="cl">
        <div class="cl-main"><span class="cl-name">${esc(l.name)}</span>
          ${l.labels.length || l.note ? `<span class="cl-opts">${l.labels.map(esc).join(" · ")}${l.note ? `${l.labels.length ? " · " : ""}« ${esc(l.note)} »` : ""}</span>` : ""}</div>
        <div class="cl-side"><span class="cl-price">${F(l.unit * l.qty)}</span>
          <div class="qty sm"><button type="button" data-dec="${i}" aria-label="Un ${esc(l.name)} de moins">−</button><output>${l.qty}</output><button type="button" data-inc="${i}" aria-label="Un ${esc(l.name)} de plus"${l.qty >= 20 ? " disabled" : ""}>+</button></div>
        </div></li>`).join("");
    const total = cart.reduce((a, l) => a + l.qty * l.unit, 0);
    const body = cart.length
      ? `<h2 class="sh-title" id="sheet-title">Votre panier</h2><p class="sh-sub">Table ${table}</p>
         <ul class="cart">${lines}</ul>
         <div class="cart-total"><span>Total</span><strong>${F(total)}</strong></div>
         <p class="fine">Vous réglez à la fin du repas : demandez l'addition depuis « Mes commandes » ou à un serveur.</p>
         <p class="err" id="cart-err" hidden></p>`
      : `<h2 class="sh-title" id="sheet-title">Votre panier</h2>
         <p class="empty"><b>Votre panier est vide.</b>Touchez un produit du menu pour l'ajouter.</p>`;
    const foot = cart.length ? `<button type="button" class="cta" id="send">Envoyer la commande · ${F(total)}</button>` : `<button type="button" class="cta ghost" id="back">Retour au menu</button>`;
    openSheet(body, foot);
    if (!cart.length) { $("back").onclick = closeSheet; return; }
    $("sheet-body").onclick = (e) => {
      const d = e.target.closest("[data-dec]"), u = e.target.closest("[data-inc]");
      if (!d && !u) return;
      const i = +(d || u).dataset[d ? "dec" : "inc"];
      cart[i].qty += d ? -1 : 1;
      if (cart[i].qty <= 0) cart.splice(i, 1);
      pendingRef = null;
      save(); rerender(); updateBar(); openCart();
    };
    $("send").onclick = send;
  }

  let sending = false;
  async function send() {
    if (sending || !cart.length) return;
    sending = true;
    const btn = $("send"), err = $("cart-err");
    btn.disabled = true; btn.textContent = "Envoi en cours…"; err.hidden = true;
    if (!pendingRef) { pendingRef = uuid(); save(); }
    try {
      const view = await api("/api/orders", {
        method: "POST",
        body: JSON.stringify({
          table, token, clientRef: pendingRef,
          lines: cart.map((l) => ({ itemId: l.itemId, quantity: l.qty, options: l.options, note: l.note || null })),
        }),
      });
      orders = orders.filter((o) => o.publicId !== view.publicId);
      orders.unshift(view);
      cart = []; pendingRef = null;
      save(); rerender(); updateBar();
      openOrders(view.publicId);
      toast(`Commande n° ${view.number} envoyée`);
      schedulePoll(true);
    } catch (e) {
      err.textContent = e.message; err.hidden = false;
      btn.disabled = false;
      btn.textContent = "Réessayer l'envoi";
      if (e.status === 403) setMode("invalid");
    } finally {
      sending = false;
    }
  }

  /* ------------------------------------------------------------------ suivi des commandes */
  function orderHTML(o, fresh) {
    const step = STEP[o.status];
    return `<article class="ord${fresh ? " fresh" : ""}">
      <div class="ord-head"><div><div class="ord-no">Commande n° ${o.number}</div><div class="ord-time">Envoyée à ${timeOf(o.createdAt)}</div></div>
        <span class="pill st-${o.status}">${STATUS[o.status]}</span></div>
      ${o.status === "ANNULEE" ? "" : `<ol class="steps"><li class="${step >= 1 ? "done" : ""}">Reçue</li><li class="${step >= 2 ? "done" : ""}">En préparation</li><li class="${step >= 3 ? "done" : ""}">Servie</li></ol>`}
      <ul>${o.lines.map((l) => `<li>${l.quantity} × ${esc(l.name)}${l.options.length ? ` <small>· ${l.options.map(esc).join(" · ")}</small>` : ""}</li>`).join("")}</ul>
      <div class="ord-total"><span>Total</span><span>${F(o.total)}</span></div></article>`;
  }

  let ordersOpen = false;
  function openOrders(freshId) {
    ordersOpen = true;
    const unpaid = orders.filter((o) => o.status !== "ANNULEE" && o.status !== "PAYEE");
    const sum = unpaid.reduce((a, o) => a + o.total, 0);
    const recentlyAsked = Date.now() - billAskedAt < 3 * 60e3;
    const body = `<h2 class="sh-title" id="sheet-title">Mes commandes</h2><p class="sh-sub">Table ${table} · aujourd'hui${sum ? ` · à régler : ${F(sum)}` : ""}</p>
      ${orders.length ? orders.map((o) => orderHTML(o, o.publicId === freshId)).join("") : `<p class="empty"><b>Aucune commande pour l'instant.</b></p>`}`;
    const foot = `${unpaid.length ? `<button type="button" class="cta ghost" id="bill"${recentlyAsked ? " disabled" : ""}>${recentlyAsked ? "Addition demandée" : "Demander l'addition"}</button>` : ""}
      <button type="button" class="cta" id="more">Commander autre chose</button>`;
    openSheet(body, foot, () => { ordersOpen = false; });
    $("more").onclick = closeSheet;
    const bill = $("bill");
    if (bill && !recentlyAsked) {
      let armed = false, t = 0;
      bill.onclick = async () => {
        if (!armed) {
          armed = true; bill.classList.remove("ghost"); bill.classList.add("alert"); bill.textContent = "Confirmer l'appel";
          t = setTimeout(() => { armed = false; bill.classList.add("ghost"); bill.classList.remove("alert"); bill.textContent = "Demander l'addition"; }, 4000);
          return;
        }
        clearTimeout(t);
        bill.disabled = true; bill.textContent = "Envoi…";
        try {
          await api(`/api/tables/${table}/addition?k=${encodeURIComponent(token)}`, { method: "POST" });
          billAskedAt = Date.now(); store.set(K().bill, billAskedAt);
          bill.classList.add("ghost"); bill.classList.remove("alert"); bill.textContent = "Addition demandée";
          toast("Un serveur arrive avec l'addition.");
        } catch (e) {
          bill.disabled = false; bill.textContent = "Réessayer"; toast(e.message);
        }
      };
    }
    if (freshId) requestAnimationFrame(() => { const f = document.querySelector(".ord.fresh"); if (f) f.scrollIntoView({ block: "nearest" }); });
  }

  let pollTimer = 0;
  function schedulePoll(soon) {
    clearTimeout(pollTimer);
    const live = orders.some((o) => o.status === "NOUVELLE" || o.status === "EN_CUISINE");
    if (!live) return;
    pollTimer = setTimeout(refreshOrders, soon ? 3000 : 6000);
  }
  async function refreshOrders() {
    if (mode !== "order" || !orders.length) return;
    if (document.hidden) { schedulePoll(); return; }
    let changed = false;
    await Promise.all(orders.filter((o) => o.status !== "PAYEE" && o.status !== "ANNULEE").map(async (o) => {
      try {
        const v = await api("/api/orders/" + o.publicId);
        if (v.status !== o.status) {
          changed = true;
          if (v.status === "EN_CUISINE") toast(`Commande n° ${v.number} : en préparation`);
          if (v.status === "SERVIE") toast(`Commande n° ${v.number} : servie, bon appétit !`);
          if (v.status === "ANNULEE") toast(`Commande n° ${v.number} annulée par le café`);
        }
        Object.assign(o, v);
      } catch (e) { /* réseau momentané : on réessaie au prochain passage */ }
    }));
    if (changed) {
      save(); updateBar();
      if (ordersOpen) { const y = $("sheet-body").scrollTop; openOrders(); $("sheet-body").scrollTop = y; }
    }
    schedulePoll();
  }
  document.addEventListener("visibilitychange", () => { if (!document.hidden) refreshOrders(); });

  /* ------------------------------------------------------------------ démarrage */
  // app.js envoie « menu-pret » quand la carte est chargée (et indique s'il y a un serveur)
  document.addEventListener("menu-pret", detectTable);
})();