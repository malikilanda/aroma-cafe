/* =====================================================================
   Aroma Café · Interface du menu
   - charge la carte : depuis le serveur (/api/menu) quand il existe,
     sinon depuis menu-data.js (version en ligne sur Netlify, ou fichier ouvert seul)
   - crée les onglets, affiche la catégorie choisie, passe en mode ardoise pour la Cuisine
   - demande à scene3d.js d'afficher le bon produit en 3D
   - laisse commande.js ajouter le panier (bouton +, fiche produit) s'il est présent
   - sans catégorie dans l'adresse (arrivée par le QR code) : écran d'accueil à deux cartes, Café & Boissons / Cuisine
   ===================================================================== */

// ---------- Petits outils ----------

// 3500 -> "3 500 F" (espaces insécables pour que le prix ne se coupe jamais)
const fmt = (p) =>
  typeof p === "string" ? p : p.toLocaleString("fr-FR").replace(/\s/g, "\u202f") + "\u00a0F";

// Raccourci pour document.getElementById
const $ = (id) => document.getElementById(id);

// La carte affichée (remplie au démarrage par loadMenu)
let CARTE = [];

// ---------- Chargement de la carte ----------

/** Convertit le JSON du serveur (menu.json) vers le format utilisé par l'affichage. */
function fromServer(data) {
  return data.categories.map((c) => ({
    id: c.id,
    g: c.group,
    t: c.title,
    m: c.model,
    note: c.note,
    items: c.items.map((it) => ({
      id: it.id,                 // identifiant envoyé au serveur lors d'une commande
      n: it.name,
      p: it.price,
      s: it.sub,
      cat: c.title,
      options: [...(c.options || []), ...(it.options || [])],
    })),
    extras: (c.extras || []).map((e) => ({ t: e.title, items: e.items.map((x) => ({ n: x.name, p: x.price })) })),
    chips: c.chips ? { t: c.chips.title, list: c.chips.list } : null,
  }));
}

/** Essaie le serveur ; sans serveur (Netlify, fichier local), utilise menu-data.js. */
async function loadMenu() {
  try {
    const res = await fetch("/api/menu");
    if (!res.ok) throw new Error("pas de serveur");
    CARTE = fromServer(await res.json());
    window.SERVEUR = true;     // le serveur répond : la commande à table est possible
  } catch (e) {
    CARTE = MENU;              // carte de secours (menu-data.js) : consultation seulement
    window.SERVEUR = false;
  }
}

// ---------- Onglets ----------

const tabsEl = $("tabs");

function buildTabs() {
  tabsEl.innerHTML = "";
  let lastGroup = "";

  // Premier bouton : retour à l'accueil (les deux grandes cartes)
  const home = document.createElement("button");
  home.className = "tab tab-home";
  home.type = "button";
  home.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3 11 9-7 9 7"/><path d="M5 10v10h14V10"/></svg>Accueil';
  home.addEventListener("click", goHome);
  tabsEl.appendChild(home);

  CARTE.forEach((cat, i) => {
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
}

// ---------- Affichage d'une catégorie ----------

/** Prix affiché : « dès 500 F » quand le prix dépend d'un choix obligatoire (ex. eau 0,5 L / 1,5 L). */
function itemPrice(item) {
  if (typeof item.p === "string" || item.p > 0 || !item.options) return fmt(item.p);
  const req = item.options.find((g) => g.required && g.choices.some((c) => c.price > 0));
  return req ? "dès " + fmt(Math.min(...req.choices.map((c) => c.price))) : fmt(item.p);
}

/** Le produit peut-il être ajouté au panier ? (commande.js décide : serveur présent + QR code valide) */
function canOrder(item) {
  return !!item.id && !!window.Commande && window.Commande.enabled();
}

// Une ligne de produit : NOM (+ précision) ........ PRIX  (+ bouton « + » si la commande est possible)
function rowHTML(item) {
  const sub = item.s ? `<span class="sub">${item.s}</span>` : "";
  const order = canOrder(item);
  const attrs = order
    ? ` class="item orderable" data-id="${item.id}" tabindex="0" role="button" aria-label="${item.n}, ${itemPrice(item)}. Choisir"`
    : ` class="item"`;
  return `<li${attrs}>
      <span class="name">${item.n}${sub}</span>
      <span class="dots"></span>
      <span class="price">${itemPrice(item)}</span>
      ${order ? window.Commande.rowExtra(item.id) : ""}
    </li>`;
}

let current = -1; // index de la catégorie affichée (-1 = aucune)

function render(i) {
  const cat = CARTE[i];

  // Ambiance : ardoise noire pour la Cuisine
  document.body.classList.toggle("board", cat.g === "Cuisine");

  // Onglet actif + défilement de la barre d'onglets pour le garder visible
  CARTE.forEach((m, j) => m.btn.setAttribute("aria-selected", j === i ? "true" : "false"));
  cat.btn.scrollIntoView({ inline: "center", block: "nearest", behavior: current < 0 ? "auto" : "smooth" });

  // Titre et résumé : « 17 boissons · 2 000 – 3 500 F »
  $("title").textContent = cat.t;
  const prices = cat.items.map((x) => x.p).filter((p) => typeof p === "number" && p > 0);
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

  // Encadrés : suppléments et pastilles (informatifs : les suppléments se choisissent dans la fiche produit)
  let extras = "";
  (cat.extras || []).forEach((e) => {
    const rows = e.items.map((x) => `<li class="item"><span class="name">${x.n}</span><span class="dots"></span><span class="price">${fmt(x.p)}</span></li>`).join("");
    extras += `<div class="box"><h3>${e.t}</h3><ul class="items">${rows}</ul></div>`;
  });
  if (cat.chips) {
    const chips = cat.chips.list.map((x) => `<span class="chip">${x}</span>`).join("");
    extras += `<div class="box"><h3>${cat.chips.t}</h3><div class="chips">${chips}</div></div>`;
  }
  $("extras").innerHTML = extras;

  // Boutons Précédent / Suivant
  const prev = CARTE[i - 1];
  const next = CARTE[i + 1];
  $("prev").hidden = !prev;
  $("next").hidden = !next;
  if (prev) $("prev").querySelector("span").textContent = "← " + prev.t;
  if (next) $("next").querySelector("span").textContent = next.t + " →";

  $("panel").setAttribute("aria-labelledby", "tab-" + cat.id);
}

/** Réaffiche la catégorie en cours (utilisé par commande.js quand le panier change). */
function rerender() {
  if (current >= 0) render(current);
}

// ---------- Accueil ----------

/** Remplit les deux cartes : première catégorie du groupe, quelques noms, nombre de catégories. */
function buildHome() {
  for (const [group, key] of [["Boissons", "drinks"], ["Cuisine", "food"]]) {
    const cats = CARTE.filter((c) => c.g === group);
    if (!cats.length) continue;
    $("home-" + key).href = "#" + cats[0].id;     // un appui ouvre la première catégorie du groupe
    const names = cats.slice(0, 5).map((c) => c.t).join(" · ");
    $("home-" + key + "-list").textContent = names + (cats.length > 5 ? "…" : "");
    $("home-" + key + "-count").textContent = cats.length + " catégories";
  }
}

/** Affiche l'accueil (pas de catégorie dans l'adresse). */
function showHome() {
  document.body.classList.add("is-home");
  document.body.classList.remove("board");
  $("home").hidden = false;
  CARTE.forEach((c) => c.btn.setAttribute("aria-selected", "false"));
  current = -1;                       // la prochaine catégorie sera affichée comme une première fois
  scrollTo(0, 0);
}

/** Bouton « Accueil » des onglets : nouvelle étape dans l'historique (le bouton Retour ramène à la catégorie). */
function goHome() {
  history.pushState(null, "", location.pathname + location.search);
  showHome();
}

// ---------- Navigation ----------

function go(i, fromHash) {
  if (i === current || i < 0 || i >= CARTE.length) return;

  const first = current < 0;
  const fromHome = document.body.classList.contains("is-home");
  if (fromHome) {
    document.body.classList.remove("is-home");
    $("home").hidden = true;
    scrollTo(0, 0);
  }
  render(i);

  // Petite animation d'entrée des lignes (sauf au premier affichage)
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!first && window.gsap && !reduceMotion) {
    gsap.fromTo("#items .item, #extras .box",
      { y: 10, opacity: 0.25 },
      { y: 0, opacity: 1, duration: 0.35, stagger: 0.018, ease: "power2.out", clearProps: "all" });
  }

  current = i;

  // L'adresse garde la catégorie (#cafe-glace) ; les paramètres du QR code (?t=5&k=…) sont conservés
  if (!fromHash) history.replaceState(null, "", location.search + "#" + CARTE[i].id);

  // Si on a défilé plus bas que la scène 3D, on remonte jusqu'à elle
  if (!first) {
    const top = $("stage").getBoundingClientRect().top + scrollY - 64;
    if (scrollY > top) scrollTo({ top, behavior: "smooth" });
  }

  // Produit en 3D (fonction fournie par scene3d.js)
  if (typeof showModel === "function") showModel(CARTE[i].m, first);
}

$("prev").onclick = () => go(current - 1);
$("next").onclick = () => go(current + 1);

// Lit la catégorie dans l'adresse (#plat) ; sans catégorie : l'accueil
function fromHash() {
  const id = location.hash.slice(1);
  const i = CARTE.findIndex((c) => c.id === id);
  if (i < 0) { showHome(); return; }
  go(i, true);
}
addEventListener("hashchange", fromHash);

// ---------- Démarrage ----------
// Quand tous les scripts sont chargés (y compris scene3d.js) : on charge la carte, puis on affiche
document.addEventListener("DOMContentLoaded", async () => {
  await loadMenu();
  buildTabs();
  buildHome();
  fromHash();
  document.dispatchEvent(new Event("menu-pret")); // signal pour commande.js
});