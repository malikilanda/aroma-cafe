/* =====================================================================
   Aroma Café · Tickets 80 mm
   - Ticket cuisine : gros numéro de table, quantités et précisions bien visibles, sans prix.
   - Ticket caisse : la commande avec les prix.
   - Addition : toutes les commandes non réglées de la table, regroupées, avec le total.
   On remplit la zone #print puis on lance l'impression du navigateur (réglée sur l'imprimante thermique).
   ===================================================================== */
const Tickets = (function () {
  "use strict";

  const F = (n) => n.toLocaleString("fr-FR").replace(/\s/g, "\u202f") + "\u00a0F";
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const hour = (iso) => new Date(iso || Date.now()).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  const day = (iso) => new Date(iso || Date.now()).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });

  // Styles du ticket : noir sur blanc, 72 mm imprimables sur un rouleau de 80 mm
  const CSS = `
    .tk{width:72mm;margin:0 auto;padding:3mm 0 8mm;color:#000;font:500 12.5px/1.35 "Jost",Arial,sans-serif}
    .tk-c{text-align:center}
    .tk-brand{font-size:17px;font-weight:700;letter-spacing:.18em}
    .tk-small{font-size:11px}
    .tk-kind{margin:2mm 0;padding:1mm 0;border-top:1.5px solid #000;border-bottom:1.5px solid #000;font-size:13px;font-weight:700;letter-spacing:.2em;text-align:center}
    .tk-table{font-size:40px;font-weight:700;line-height:1;text-align:center;margin:2mm 0 1mm}
    .tk-table small{display:block;font-size:12px;letter-spacing:.3em}
    .tk-row{display:flex;justify-content:space-between;gap:3mm}
    .tk-hr{border:0;border-top:1px dashed #000;margin:2mm 0}
    .tk-line{margin:1.6mm 0}
    .tk-line b{font-weight:700}
    .tk-big .tk-line{font-size:15px}
    .tk-opt{padding-left:7mm;font-size:12px}
    .tk-note{margin:1mm 0 0 7mm;padding:.6mm 1.5mm;border:1.5px solid #000;font-weight:700;display:inline-block}
    .tk-total{font-size:17px;font-weight:700}
    .tk-foot{margin-top:4mm;text-align:center;font-size:11.5px}`;

  function head(kind, tableNo, numberText, iso) {
    return `<div class="tk-c"><div class="tk-brand">AROMA CAFÉ</div><div class="tk-small">coffee house</div></div>
      <div class="tk-kind">${kind}</div>
      <div class="tk-table"><small>TABLE</small>${tableNo}</div>
      <div class="tk-row tk-small"><span>${numberText}</span><span>${day(iso)} · ${hour(iso)}</span></div>
      <hr class="tk-hr">`;
  }

  /** Ticket cuisine : pas de prix, gros caractères, précisions encadrées. */
  function kitchen(o) {
    const lines = o.lines.map((l) => `<div class="tk-line"><b>${l.quantity} ×</b> ${esc(l.name)}
        ${l.options.map((x) => `<div class="tk-opt">+ ${esc(x)}</div>`).join("")}
        ${l.note ? `<div class="tk-note">« ${esc(l.note)} »</div>` : ""}</div>`).join("");
    const count = o.lines.reduce((a, l) => a + l.quantity, 0);
    return `<div class="tk tk-big">${head("CUISINE", o.table, "Commande n° " + o.number, o.createdAt)}
      ${lines}<hr class="tk-hr">
      <div class="tk-row"><span>${count} article${count > 1 ? "s" : ""}</span><span>Imprimé à ${hour()}</span></div></div>`;
  }

  /** Ticket caisse : la commande avec les prix. */
  function receipt(o) {
    const lines = o.lines.map((l) => `<div class="tk-line"><div class="tk-row"><span><b>${l.quantity} ×</b> ${esc(l.name)}</span><span>${F(l.lineTotal)}</span></div>
        ${l.options.map((x) => `<div class="tk-opt">+ ${esc(x)}</div>`).join("")}
        ${l.note ? `<div class="tk-opt">« ${esc(l.note)} »</div>` : ""}</div>`).join("");
    return `<div class="tk">${head("COMMANDE", o.table, "Commande n° " + o.number, o.createdAt)}
      ${lines}<hr class="tk-hr">
      <div class="tk-row tk-total"><span>TOTAL</span><span>${F(o.total)}</span></div>
      <div class="tk-foot">À régler en fin de repas</div></div>`;
  }

  /** Addition de la table : lignes regroupées, total, remerciement. */
  function bill(b) {
    const lines = b.lines.map((l) => `<div class="tk-line"><div class="tk-row"><span><b>${l.quantity} ×</b> ${esc(l.name)}</span><span>${F(l.lineTotal)}</span></div>
        ${l.options.map((x) => `<div class="tk-opt">+ ${esc(x)}</div>`).join("")}
        ${l.quantity > 1 ? `<div class="tk-opt">${F(l.unitPrice)} l'unité</div>` : ""}</div>`).join("");
    const nums = b.orderNumbers.length > 1 ? "Commandes n° " + b.orderNumbers.join(", ") : "Commande n° " + b.orderNumbers[0];
    return `<div class="tk">${head("ADDITION", b.table, nums, b.printedAt)}
      ${lines}<hr class="tk-hr">
      <div class="tk-row tk-total"><span>TOTAL</span><span>${F(b.total)}</span></div>
      <div class="tk-foot">Prix en francs CFA<br>Merci de votre visite et à bientôt !</div></div>`;
  }

  /** Imprime un ticket : on remplit #print puis on ouvre l'impression. */
  function print(html) {
    const zone = document.getElementById("print");
    zone.innerHTML = `<style>${CSS}</style>${html}`;
    // petit délai : le navigateur affiche le ticket avant d'ouvrir l'impression
    setTimeout(() => window.print(), 60);
  }

  return {
    kitchen: (o) => print(kitchen(o)),
    receipt: (o) => print(receipt(o)),
    bill: (b) => print(bill(b)),
  };
})();