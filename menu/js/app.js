/* =====================================================================
   Aroma Café · Interface du menu
   - crée les onglets à partir de MENU (menu-data.js)
   - affiche la catégorie choisie : titre, liste, suppléments
   - passe en mode « ardoise » pour la partie Cuisine
   - demande à scene3d.js d'afficher le bon produit en 3D
   ===================================================================== */

// ---------- Petits outils ----------

// 3500 -> "3 500 F" (espaces insécables pour que le prix ne se coupe jamais)
const fmt = (p) =>
  typeof p === "string" ? p : p.toLocaleString("fr-FR").replace(/\s/g, "\u202f") + "\u00a0F";

// Raccourci pour document.getElementById
const $ = (id) => document.getElementById(id);

// ---------- Onglets ----------

const tabsEl = $("tabs");
let lastGroup = "";

MENU.forEach((cat, i) => {
  // Petit titre « BOISSONS » / « CUISINE » quand le groupe change
  if (cat.g !== lastGroup) {
    const label = document.createElement("span");
    label.className = "group-label";
    label.textContent = cat.g;
    tabsEl.appendChild(label);
    lastGroup = cat.g;
  }

  const btn = document.createElement("button");
  btn.className = "tab";
  btn.type = "button";
  btn.setAttribute("role", "tab");
  btn.id = "tab-" + cat.id;
  btn.textContent = cat.t;
  btn.addEventListener("click", () => go(i));
  tabsEl.appendChild(btn);

  cat.btn = btn; // on garde le bouton pour le marquer « sélectionné » plus tard
});

// ---------- Affichage d'une catégorie ----------

// Une ligne de produit : NOM (+ précision) ........ PRIX
function rowHTML(item) {
  const sub = item.s ? `<span class="sub">${item.s}</span>` : "";
  return `<li class="item">
      <span class="name">${item.n}${sub}</span>
      <span class="dots"></span>
      <span class="price">${fmt(item.p)}</span>
    </li>`;
}

let current = -1; // index de la catégorie affichée (-1 = aucune)

function render(i) {
  const cat = MENU[i];

  // Ambiance : ardoise noire pour la Cuisine
  document.body.classList.toggle("board", cat.g === "Cuisine");

  // Onglet actif + défilement de la barre d'onglets pour le garder visible
  MENU.forEach((m, j) => m.btn.setAttribute("aria-selected", j === i ? "true" : "false"));
  cat.btn.scrollIntoView({ inline: "center", block: "nearest", behavior: current < 0 ? "auto" : "smooth" });

  // Titre et résumé : « 17 boissons · 2 000 – 3 500 F »
  $("title").textContent = cat.t;
  const prices = cat.items.map((x) => x.p).filter((p) => typeof p === "number");
  const lo = Math.min(...prices);
  const hi = Math.max(...prices);
  const n = cat.items.length;
  const unit = cat.id === "glace" ? "parfums" : cat.g === "Cuisine" ? "choix" : n > 1 ? "boissons" : "boisson";
  const range = lo === hi ? fmt(lo) : fmt(lo).replace(/\u00a0F$/, "") + " – " + fmt(hi);
  $("meta").textContent = `${n} ${unit} · ${range}`;

  // Note rouge (ex. Aroma Spéciale)
  $("note").hidden = !cat.note;
  $("note").textContent = cat.note || "";

  // Liste des produits
  $("items").innerHTML = cat.items.map(rowHTML).join("");

  // Encadrés : suppléments et pastilles
  let extras = "";
  (cat.extras || []).forEach((e) => {
    extras += `<div class="box"><h3>${e.t}</h3><ul class="items">${e.items.map(rowHTML).join("")}</ul></div>`;
  });
  if (cat.chips) {
    const chips = cat.chips.list.map((x) => `<span class="chip">${x}</span>`).join("");
    extras += `<div class="box"><h3>${cat.chips.t}</h3><div class="chips">${chips}</div></div>`;
  }
  $("extras").innerHTML = extras;

  // Boutons Précédent / Suivant
  const prev = MENU[i - 1];
  const next = MENU[i + 1];
  $("prev").hidden = !prev;
  $("next").hidden = !next;
  if (prev) $("prev").querySelector("span").textContent = "← " + prev.t;
  if (next) $("next").querySelector("span").textContent = next.t + " →";

  $("panel").setAttribute("aria-labelledby", "tab-" + cat.id);
}

// ---------- Navigation ----------

function go(i, fromHash) {
  if (i === current || i < 0 || i >= MENU.length) return;

  const first = current < 0;
  render(i);

  // Petite animation d'entrée des lignes (sauf au premier affichage)
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!first && window.gsap && !reduceMotion) {
    gsap.fromTo("#items .item, #extras .box",
      { y: 10, opacity: 0.25 },
      { y: 0, opacity: 1, duration: 0.35, stagger: 0.018, ease: "power2.out", clearProps: "all" });
  }

  current = i;

  // L'adresse garde la catégorie (#cafe-glace) : on peut partager le lien ou recharger
  if (!fromHash) history.replaceState(null, "", "#" + MENU[i].id);

  // Si on a défilé plus bas que la scène 3D, on remonte jusqu'à elle
  if (!first) {
    const top = $("stage").getBoundingClientRect().top + scrollY - 64;
    if (scrollY > top) scrollTo({ top, behavior: "smooth" });
  }

  // Produit en 3D (fonction fournie par scene3d.js)
  if (typeof showModel === "function") showModel(MENU[i].m, first);
}

$("prev").onclick = () => go(current - 1);
$("next").onclick = () => go(current + 1);

// Lit la catégorie dans l'adresse (#plat) ; sinon la première
function fromHash() {
  const id = location.hash.slice(1);
  const i = MENU.findIndex((c) => c.id === id);
  go(i >= 0 ? i : 0, true);
}
addEventListener("hashchange", fromHash);

// Démarrage : quand tous les scripts sont chargés (y compris scene3d.js)
document.addEventListener("DOMContentLoaded", fromHash);