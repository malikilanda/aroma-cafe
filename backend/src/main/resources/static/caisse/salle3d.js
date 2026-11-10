/* =====================================================================
   Aroma Café · La salle en 3D (Three.js)
   - Dessine la salle à partir de caisse/salle.json : sols, murets, comptoir, canapés, entrée, tables et chaises.
   - Table « rectangle » : longueur (x) × largeur (z) en mètres, chaises posées côté par côté
     ({"gauche":1,"droite":2,"avant":0,"arriere":1}), comme sur le vrai plan.
   - Pose sur chaque table une pastille HTML (numéro, montant, pastille rouge) qui suit la 3D.
   - Un halo rouge pulse au sol sous une table qui a une commande à traiter ; ambre pour l'addition.
   - Glisser le doigt fait pivoter un peu la salle ; toucher une table la sélectionne.
   - Sans WebGL (vieille tablette), les tables s'affichent en simple grille : la caisse reste utilisable.
   ===================================================================== */
const Salle = (function () {
  "use strict";

  let floorEl, canvas, tagsEl, onSelect;
  let renderer, scene, camera, raycaster, pointer;
  let W = 12, D = 8;                       // dimensions de la salle (mètres)
  const tables = new Map();                // numéro → { tag, group, top, halo, state }
  let selected = null;
  let flat = false;

  // Caméra : on tourne autour du centre, angle limité pour garder une vue lisible
  const cam = { yaw: 0, targetYaw: 0, pitch: 0.92, dist: 14 };
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ------------------------------------------------------------------ plan */

  /** Complète le plan : toute table connue du serveur mais absente de salle.json est rangée en bas. */
  function normalize(plan, count) {
    const list = (plan.tables || []).filter((t) => t.numero >= 1 && t.numero <= count);
    const known = new Set(list.map((t) => t.numero));
    const missing = [];
    for (let n = 1; n <= count; n++) if (!known.has(n)) missing.push(n);
    W = (plan.salle && plan.salle.largeur) || 12;
    D = (plan.salle && plan.salle.profondeur) || 8;
    if (missing.length) {
      const step = Math.min(1.8, W / (missing.length + 1));
      missing.forEach((n, i) => list.push({ numero: n, x: step * (i + 1), z: D + 1.1, forme: "ronde", places: 2, ajoutee: true }));
      D += 2;                               // on agrandit le plan pour les tables ajoutées
    }
    return list.sort((a, b) => a.numero - b.numero);
  }

  /* ------------------------------------------------------------------ pastilles HTML */

  function makeTag(n) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "tag free";
    b.dataset.table = n;
    b.setAttribute("aria-pressed", "false");
    b.innerHTML = `<span class="tag-n"><small>T</small>${n}</span><span class="tag-sub"></span>`;
    b.addEventListener("click", () => onSelect && onSelect(n));
    tagsEl.appendChild(b);
    return b;
  }

  /* ------------------------------------------------------------------ textures dessinées (canvas) */

  function canvasTex(w, h, draw, repeat) {
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    draw(c.getContext("2d"), w, h);
    const t = new THREE.CanvasTexture(c);
    t.encoding = THREE.sRGBEncoding;
    t.anisotropy = 4;
    if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
    return t;
  }

  const woodFloor = (zw, zd) => canvasTex(512, 512, (g, w, h) => {
    const rows = 8;
    for (let r = 0; r < rows; r++) {
      const y = (r * h) / rows;
      let x = -((r * 97) % 200);
      while (x < w) {
        const len = 180 + ((r * 53 + x) % 120);
        const l = 34 + ((r * 7 + Math.abs(x)) % 9);
        g.fillStyle = `hsl(27 40% ${l}%)`;
        g.fillRect(x, y, len, h / rows);
        g.strokeStyle = "rgba(30,15,8,.45)";
        g.lineWidth = 2;
        g.strokeRect(x, y, len, h / rows);
        for (let k = 0; k < 4; k++) {           // veines du bois
          g.strokeStyle = "rgba(60,30,15,.12)";
          g.beginPath();
          const yy = y + 6 + k * 13;
          g.moveTo(x, yy); g.bezierCurveTo(x + len / 3, yy + 4, x + (2 * len) / 3, yy - 4, x + len, yy);
          g.stroke();
        }
        x += len;
      }
    }
  }, [zw / 3, zd / 3]);

  const tileFloor = (zw, zd) => canvasTex(256, 256, (g, w, h) => {
    const n = 4, s = w / n;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      g.fillStyle = (i + j) % 2 ? "#D9C2A6" : "#E6D3BC";
      g.fillRect(i * s, j * s, s, s);
    }
    g.strokeStyle = "rgba(90,60,40,.35)"; g.lineWidth = 3;
    for (let i = 0; i <= n; i++) { g.beginPath(); g.moveTo(i * s, 0); g.lineTo(i * s, h); g.moveTo(0, i * s); g.lineTo(w, i * s); g.stroke(); }
  }, [zw / 2, zd / 2]);

  /** Texte posé à plat sur le sol (noms des zones, « Entrée »…). */
  function floorText(text, size, color) {
    const tex = canvasTex(512, 128, (g, w, h) => {
      g.font = `600 64px Jost, "Segoe UI", sans-serif`;
      g.textAlign = "center"; g.textBaseline = "middle";
      g.fillStyle = color;
      g.fillText(text.toUpperCase().split("").join(" "), w / 2, h / 2);
    });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size / 4), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
    m.rotation.x = -Math.PI / 2;
    return m;
  }

  /* ------------------------------------------------------------------ objets */

  const MAT = {};
  function materials() {
    MAT.top = new THREE.MeshStandardMaterial({ color: 0x8a5a36, roughness: 0.45, metalness: 0.0 });
    MAT.leg = new THREE.MeshStandardMaterial({ color: 0x1b1210, roughness: 0.4, metalness: 0.6 });
    MAT.chair = new THREE.MeshStandardMaterial({ color: 0x3a2a20, roughness: 0.7 });
    MAT.seat = new THREE.MeshStandardMaterial({ color: 0xc9a27a, roughness: 0.85 });
    MAT.wall = new THREE.MeshStandardMaterial({ color: 0xf3e9dc, roughness: 0.9 });
    MAT.counter = new THREE.MeshStandardMaterial({ color: 0x2a1a12, roughness: 0.55 });
    MAT.counterTop = new THREE.MeshStandardMaterial({ color: 0xf6eee4, roughness: 0.3 });
    MAT.pot = new THREE.MeshStandardMaterial({ color: 0xb4532a, roughness: 0.8 });
    MAT.leaf = new THREE.MeshStandardMaterial({ color: 0x3f7a3a, roughness: 0.8, flatShading: true });
    MAT.door = new THREE.MeshStandardMaterial({ color: 0x2a1a12, roughness: 0.6 });
    MAT.doorLeaf = new THREE.MeshStandardMaterial({ color: 0x7a5236, roughness: 0.55 });
    MAT.sofa = new THREE.MeshStandardMaterial({ color: 0x6b4a36, roughness: 0.95 });
    MAT.cushion = new THREE.MeshStandardMaterial({ color: 0x8c6448, roughness: 0.95 });
  }

  const shadowed = (m) => { m.castShadow = true; m.receiveShadow = true; return m; };

  function chair(angle, dist) {
    const g = new THREE.Group();
    const seat = shadowed(new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.06, 0.42), MAT.seat));
    seat.position.y = 0.46;
    const back = shadowed(new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.42, 0.05), MAT.chair));
    back.position.set(0, 0.7, 0.2);
    g.add(seat, back);
    for (const [x, z] of [[-0.17, -0.17], [0.17, -0.17], [-0.17, 0.17], [0.17, 0.17]]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.46, 6), MAT.leg);
      leg.position.set(x, 0.23, z);
      g.add(leg);
    }
    g.position.set(Math.sin(angle) * dist, 0, Math.cos(angle) * dist);
    g.rotation.y = angle;                    // le dossier est à l'extérieur, la chaise regarde la table
    return g;
  }

  /** Une table complète : plateau, pied, chaises et halo au sol. */
  function buildTable(t) {
    const g = new THREE.Group();
    const places = Math.max(1, Math.min(8, t.places || 2));
    let top, halo, w = 0.8, d = 0.8;

    if (t.forme === "rectangle") {
      // table dessinée sur le vrai plan : dimensions et chaises par côté
      w = t.longueur || 1.2; d = t.largeur || 0.8;
      top = new THREE.Mesh(new THREE.BoxGeometry(w, 0.05, d), MAT.top);
      const ch = t.chaises || {};
      // côté → angle de la chaise, distance au centre, longueur du côté, axe le long duquel on répartit
      const sides = {
        avant:   { a: 0,            dist: d / 2 + 0.3, len: w, along: "x" },
        arriere: { a: Math.PI,      dist: d / 2 + 0.3, len: w, along: "x" },
        droite:  { a: Math.PI / 2,  dist: w / 2 + 0.3, len: d, along: "z" },
        gauche:  { a: -Math.PI / 2, dist: w / 2 + 0.3, len: d, along: "z" },
      };
      for (const [name, sd] of Object.entries(sides)) {
        const n = Math.max(0, Math.min(4, ch[name] || 0));
        for (let i = 0; i < n; i++) {
          const c = chair(sd.a, sd.dist);
          const off = (i - (n - 1) / 2) * Math.min(0.62, sd.len / n);
          if (sd.along === "x") c.position.x += off; else c.position.z += off;
          g.add(c);
        }
      }
      halo = Math.max(w, d) / 2 + 0.85;
    } else if (t.forme === "ronde") {
      const r = places <= 2 ? 0.38 : 0.48;
      top = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.05, 40), MAT.top);
      for (let i = 0; i < places; i++) g.add(chair((i / places) * Math.PI * 2 + Math.PI / places, r + 0.32));
      halo = r + 0.75;
    } else {
      if (t.forme === "longue") w = Math.max(1.2, Math.ceil(places / 2) * 0.62);
      top = new THREE.Mesh(new THREE.BoxGeometry(w, 0.05, d), MAT.top);
      if (t.forme === "longue") {
        const per = Math.ceil(places / 2);
        for (let i = 0; i < places; i++) {
          const side = i < per ? 1 : -1, k = i < per ? i : i - per, nSide = i < per ? per : places - per;
          const x = (k - (nSide - 1) / 2) * (w / nSide);
          const c = chair(side > 0 ? 0 : Math.PI, 0.72);
          c.position.x += x;
          g.add(c);
        }
      } else {
        const sides = [0, Math.PI, Math.PI / 2, -Math.PI / 2];
        for (let i = 0; i < places; i++) g.add(chair(sides[i % 4], 0.72));
      }
      halo = Math.max(w, d) / 2 + 0.85;
    }
    shadowed(top);
    top.position.y = 0.75;
    const leg = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.72, 10), MAT.leg));
    leg.position.y = 0.37;
    const foot = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.26, 0.03, 24), MAT.leg));
    foot.position.y = 0.015;
    g.add(top, leg, foot);

    // halo au sol (invisible tant que la table n'a rien à signaler)
    const ring = new THREE.Mesh(new THREE.CircleGeometry(halo, 48),
      new THREE.MeshBasicMaterial({ color: 0xc42230, transparent: true, opacity: 0, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.012;
    g.add(ring);

    g.position.set(t.x - W / 2, 0, t.z - D / 2);
    g.rotation.y = -THREE.MathUtils.degToRad(t.angle || 0);
    // tout le groupe est « touchable » : on retrouve le numéro de table via userData
    g.traverse((o) => { o.userData.table = t.numero; });
    scene.add(g);
    return { group: g, top, halo: ring };
  }

  function buildRoom(plan) {
    // sols
    for (const z of plan.zones && plan.zones.length ? plan.zones : [{ x: 0, z: 0, largeur: W, profondeur: D, sol: "bois" }]) {
      const tex = z.sol === "carrelage" ? tileFloor(z.largeur, z.profondeur) : woodFloor(z.largeur, z.profondeur);
      const f = new THREE.Mesh(new THREE.PlaneGeometry(z.largeur, z.profondeur),
        new THREE.MeshStandardMaterial({ map: tex, roughness: z.sol === "carrelage" ? 0.6 : 0.75 }));
      f.rotation.x = -Math.PI / 2;
      f.position.set(z.x + z.largeur / 2 - W / 2, 0, z.z + z.profondeur / 2 - D / 2);
      f.receiveShadow = true;
      scene.add(f);
      if (z.nom) {
        // nom de la zone dans son coin avant gauche (foncé sur le carrelage, clair sur le bois)
        const label = floorText(z.nom, 2.2, z.sol === "carrelage" ? "rgba(42,26,18,.45)" : "rgba(255,248,238,.6)");
        label.position.set(z.x + 1.25 - W / 2, 0.01, z.z + z.profondeur - 0.4 - D / 2);
        scene.add(label);
      }
    }
    // sol des tables ajoutées automatiquement
    if (D > ((plan.salle && plan.salle.profondeur) || 8)) {
      const extra = new THREE.Mesh(new THREE.PlaneGeometry(W, 2), new THREE.MeshStandardMaterial({ color: 0x5a4030, roughness: 0.9 }));
      extra.rotation.x = -Math.PI / 2;
      extra.position.set(0, -0.002, D / 2 - 1);
      extra.receiveShadow = true;
      scene.add(extra);
    }

    // murets : un rebord bas tout autour, avec une ouverture à l'entrée
    const h = 0.35, th = 0.12;
    const door = (plan.decor || []).find((d) => d.type === "entree");
    const pd = (plan.salle && plan.salle.profondeur) || D;
    const wall = (x1, z1, x2, z2) => {
      const len = Math.hypot(x2 - x1, z2 - z1);
      if (len < 0.05) return;
      const m = shadowed(new THREE.Mesh(new THREE.BoxGeometry(len + th, h, th), MAT.wall));
      m.position.set((x1 + x2) / 2 - W / 2, h / 2, (z1 + z2) / 2 - D / 2);
      m.rotation.y = -Math.atan2(z2 - z1, x2 - x1);
      scene.add(m);
    };
    if (Array.isArray(plan.murs) && plan.murs.length) {
      // murs dessinés d'après le vrai plan : [x1, z1, x2, z2] en mètres
      for (const m of plan.murs) wall(m[0], m[1], m[2], m[3]);
    } else {
      wall(0, 0, W, 0);
      wall(0, 0, 0, pd);
      wall(W, 0, W, pd);
      if (door) {
        wall(0, pd, door.x, pd);
        wall(door.x + (door.largeur || 1.4), pd, W, pd);
      } else wall(0, pd, W, pd);
    }

    for (const d of plan.decor || []) {
      if (d.type === "comptoir") {
        const body = shadowed(new THREE.Mesh(new THREE.BoxGeometry(d.largeur, 1.0, d.profondeur), MAT.counter));
        body.position.set(d.x + d.largeur / 2 - W / 2, 0.5, d.z + d.profondeur / 2 - D / 2);
        const top = shadowed(new THREE.Mesh(new THREE.BoxGeometry(d.largeur + 0.08, 0.05, d.profondeur + 0.08), MAT.counterTop));
        top.position.set(body.position.x, 1.025, body.position.z);
        scene.add(body, top);
        if (d.texte) {
          const l = floorText(d.texte, 1.8, "#2A1A12");
          l.position.set(body.position.x, 1.06, body.position.z);
          scene.add(l);
        }
      }
      if (d.type === "entree") {
        const l = floorText(d.texte || "Entrée", 1.6, "rgba(255,248,238,.7)");
        l.position.set(d.x + (d.largeur || 1.4) / 2 - W / 2, 0.01, d.z - 0.45 - D / 2);
        scene.add(l);
      }
      if (d.type === "canape") {
        // assise basse + dossier contre le mur (dos : gauche, droite, avant ou arriere)
        const cx = d.x + d.largeur / 2 - W / 2, cz = d.z + d.profondeur / 2 - D / 2;
        const seat = shadowed(new THREE.Mesh(new THREE.BoxGeometry(d.largeur, 0.42, d.profondeur), MAT.sofa));
        seat.position.set(cx, 0.21, cz);
        const cush = shadowed(new THREE.Mesh(new THREE.BoxGeometry(d.largeur - 0.08, 0.08, d.profondeur - 0.08), MAT.cushion));
        cush.position.set(cx, 0.46, cz);
        scene.add(seat, cush);
        const dos = d.dos || "arriere", th = 0.18;
        const vertical = dos === "gauche" || dos === "droite";
        const back = shadowed(new THREE.Mesh(new THREE.BoxGeometry(vertical ? th : d.largeur, 0.78, vertical ? d.profondeur : th), MAT.sofa));
        back.position.set(
          cx + (dos === "gauche" ? -(d.largeur - th) / 2 : dos === "droite" ? (d.largeur - th) / 2 : 0),
          0.39,
          cz + (dos === "arriere" ? -(d.profondeur - th) / 2 : dos === "avant" ? (d.profondeur - th) / 2 : 0));
        scene.add(back);
      }
      if (d.type === "porte") {
        // encadrement + battant ouvert, posés dans le trou d'un muret (le long de x)
        const L = d.largeur || 1.6, x0 = d.x - W / 2, z0 = d.z - D / 2;
        const ph = 1.05;
        for (const px of [x0, x0 + L]) {
          const post = shadowed(new THREE.Mesh(new THREE.BoxGeometry(0.1, ph, 0.16), MAT.door));
          post.position.set(px, ph / 2, z0);
          scene.add(post);
        }
        const lintel = shadowed(new THREE.Mesh(new THREE.BoxGeometry(L + 0.1, 0.08, 0.16), MAT.door));
        lintel.position.set(x0 + L / 2, ph, z0);
        const leafW = L / 2 - 0.06, side = d.ouverture === "interieur" ? -1 : 1;
        for (const [hx, dir] of [[x0 + 0.05, 1], [x0 + L - 0.05, -1]]) {
          // deux battants ouverts à 60°, côté terrasse par défaut
          const pivot = new THREE.Group();
          pivot.position.set(hx, 0, z0);
          pivot.rotation.y = dir * side * -THREE.MathUtils.degToRad(60);
          const leaf = shadowed(new THREE.Mesh(new THREE.BoxGeometry(leafW, ph - 0.12, 0.05), MAT.doorLeaf));
          leaf.position.set(dir * leafW / 2, (ph - 0.12) / 2 + 0.02, 0);
          pivot.add(leaf);
          scene.add(pivot);
        }
        const mat = new THREE.Mesh(new THREE.PlaneGeometry(L * 0.8, 0.6), new THREE.MeshStandardMaterial({ color: 0x3a2a20, roughness: 1 }));
        mat.rotation.x = -Math.PI / 2;
        mat.position.set(x0 + L / 2, 0.006, z0 - 0.45 * side);
        mat.receiveShadow = true;
        scene.add(lintel, mat);
      }
      if (d.type === "chaise") {
        // chaise seule (terrasse…) : angle = direction du dossier, en degrés (0 = dossier vers l'avant)
        const c = chair(THREE.MathUtils.degToRad(d.angle || 0), 0);
        c.position.set(d.x - W / 2, 0, d.z - D / 2);
        scene.add(c);
      }
      if (d.type === "texte") {
        const l = floorText(d.texte, d.taille || 1.6, d.couleur || "rgba(255,248,238,.7)");
        l.position.set(d.x - W / 2, 0.01, d.z - D / 2);
        scene.add(l);
      }
      if (d.type === "plante") {
        const pot = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.15, 0.4, 16), MAT.pot));
        pot.position.set(d.x - W / 2, 0.2, d.z - D / 2);
        const leaves = shadowed(new THREE.Mesh(new THREE.IcosahedronGeometry(0.42, 1), MAT.leaf));
        leaves.position.set(d.x - W / 2, 0.75, d.z - D / 2);
        leaves.scale.y = 1.25;
        scene.add(pot, leaves);
      }
    }
  }

  /* ------------------------------------------------------------------ caméra */

  function placeCamera() {
    const y = Math.sin(cam.pitch), h = Math.cos(cam.pitch);
    camera.position.set(Math.sin(cam.yaw) * h * cam.dist, y * cam.dist, Math.cos(cam.yaw) * h * cam.dist);
    camera.lookAt(0, 0, 0.15);
    camera.updateMatrixWorld();
  }

  /** Recule la caméra juste assez pour que toute la salle tienne à l'écran (quelle que soit la tablette). */
  function fitCamera() {
    const corners = [];
    for (const x of [-W / 2, W / 2]) for (const z of [-D / 2, D / 2]) for (const y of [0, 1.1]) corners.push(new THREE.Vector3(x, y, z));
    let lo = 4, hi = 60;
    const saveYaw = cam.yaw;
    cam.yaw = 0;
    for (let i = 0; i < 22; i++) {
      cam.dist = (lo + hi) / 2;
      placeCamera();
      camera.updateProjectionMatrix();
      const fits = corners.every((c) => { const p = c.clone().project(camera); return Math.abs(p.x) < 0.9 && p.y < 0.82 && p.y > -0.86; });
      if (fits) hi = cam.dist; else lo = cam.dist;
    }
    cam.dist = hi;
    cam.yaw = saveYaw;
    placeCamera();
  }

  function resize() {
    const r = floorEl.getBoundingClientRect();
    if (!r.width || !r.height) return;
    renderer.setSize(r.width, r.height, false);
    camera.aspect = r.width / r.height;
    camera.updateProjectionMatrix();
    fitCamera();
    request();
  }

  /* ------------------------------------------------------------------ boucle d'affichage */

  let frame = 0;
  function request() { if (!flat && renderer && !frame) frame = requestAnimationFrame(draw); }

  function draw(time) {
    frame = 0;
    // caméra : rotation douce vers l'angle voulu
    cam.yaw += (cam.targetYaw - cam.yaw) * 0.18;
    placeCamera();

    // halos : rouge qui pulse (nouvelle commande), ambre fixe (addition)
    let animating = Math.abs(cam.targetYaw - cam.yaw) > 0.0005;
    for (const t of tables.values()) {
      const mat = t.halo.material;
      if (t.state === "new") {
        mat.color.setHex(0xc42230);
        const k = reduceMotion ? 0.5 : 0.5 + 0.5 * Math.sin(time / 260);
        mat.opacity = 0.25 + 0.4 * k;
        t.halo.scale.setScalar(reduceMotion ? 1 : 0.92 + 0.12 * k);
        if (!reduceMotion) animating = true;
      } else if (t.state === "bill") {
        mat.color.setHex(0xf2a31b); mat.opacity = 0.45; t.halo.scale.setScalar(1);
      } else if (t.number === selected) {
        mat.color.setHex(0xfbf6ef); mat.opacity = 0.18; t.halo.scale.setScalar(1);
      } else {
        mat.opacity = 0;
      }
    }

    renderer.render(scene, camera);
    placeTags();
    if (animating) request();
  }

  /** Positionne chaque pastille HTML au-dessus de sa table (projection 3D → écran). */
  const tmp = { v: null };
  function placeTags() {
    const r = floorEl.getBoundingClientRect();
    for (const t of tables.values()) {
      tmp.v.set(0, 1.05, 0).applyMatrix4(t.group.matrixWorld).project(camera);
      const x = (tmp.v.x * 0.5 + 0.5) * r.width;
      const y = (-tmp.v.y * 0.5 + 0.5) * r.height;
      t.tag.style.setProperty("--pos", `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -100%)`);
      t.tag.style.zIndex = String(Math.round(y));    // la table la plus proche passe devant
    }
  }

  /* ------------------------------------------------------------------ toucher / glisser */

  function bindPointer() {
    let down = null, moved = false;
    canvas.addEventListener("pointerdown", (e) => {
      down = { x: e.clientX, y: e.clientY, yaw: cam.targetYaw };
      moved = false;
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener("pointermove", (e) => {
      if (!down) return;
      const dx = e.clientX - down.x;
      if (Math.abs(dx) > 6) moved = true;
      if (moved) {
        cam.targetYaw = THREE.MathUtils.clamp(down.yaw - dx * 0.005, -0.6, 0.6);
        request();
      }
    });
    const up = (e) => {
      if (!down) return;
      if (!moved) pick(e);
      down = null;
    };
    canvas.addEventListener("pointerup", up);
    canvas.addEventListener("pointercancel", () => { down = null; });
    // double appui : retour à la vue de face
    canvas.addEventListener("dblclick", () => { cam.targetYaw = 0; request(); });
  }

  function pick(e) {
    const r = canvas.getBoundingClientRect();
    pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    const hit = raycaster.intersectObjects(scene.children, true).find((h) => h.object.userData.table);
    if (hit && onSelect) onSelect(hit.object.userData.table);
  }

  /* ------------------------------------------------------------------ API publique */

  function init(opts) {
    floorEl = opts.floor; canvas = opts.canvas; tagsEl = opts.tags; onSelect = opts.onSelect;
    const list = normalize(opts.plan || {}, opts.count);

    // pastilles HTML (toujours créées : elles servent aussi sans 3D)
    for (const t of list) tables.set(t.numero, { number: t.numero, tag: makeTag(t.numero), state: "free" });

    try {
      if (!window.THREE) throw new Error("Three.js absent");
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "high-performance" });
    } catch (e) {
      flat = true;
      floorEl.classList.add("flat");
      return false;
    }
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(34, 1.5, 0.1, 200);
    raycaster = new THREE.Raycaster();
    pointer = new THREE.Vector2();
    tmp.v = new THREE.Vector3();

    // lumière chaude de café : ciel crème + soleil doux qui projette les ombres
    scene.add(new THREE.HemisphereLight(0xfff4e6, 0x3a2416, 0.75));
    const sun = new THREE.DirectionalLight(0xffe2bf, 1.35);
    sun.position.set(-W * 0.4, 14, D * 0.25);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const s = Math.max(W, D) * 0.65;
    Object.assign(sun.shadow.camera, { left: -s, right: s, top: s, bottom: -s, near: 1, far: 40 });
    sun.shadow.bias = -0.0005;
    sun.shadow.radius = 4;
    scene.add(sun);

    materials();
    buildRoom(opts.plan || {});
    for (const t of list) Object.assign(tables.get(t.numero), buildTable(t));

    bindPointer();
    new ResizeObserver(resize).observe(floorEl);
    resize();

    // petite entrée en douceur : la salle pivote vers sa place
    if (!reduceMotion) { cam.yaw = -0.35; cam.targetYaw = 0; }
    request();
    return true;
  }

  /** Met à jour une table : state = free | busy | bill | new ; dot = nombre à traiter ; sub = texte sous le numéro. */
  function setTable(n, { state, dot, sub, label }) {
    const t = tables.get(n);
    if (!t) return;
    t.state = state;
    t.tag.className = "tag " + state;
    t.tag.querySelector(".tag-sub").textContent = sub || "";
    let d = t.tag.querySelector(".tag-dot");
    if (dot) {
      if (!d) { d = document.createElement("span"); d.className = "tag-dot"; t.tag.appendChild(d); }
      d.className = "tag-dot" + (dot === "bell" ? " bell" : "");
      d.innerHTML = dot === "bell" ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>' : String(dot);
    } else if (d) d.remove();
    t.tag.setAttribute("aria-label", label || "Table " + n);
    request();
  }

  function select(n) {
    selected = n;
    for (const t of tables.values()) t.tag.setAttribute("aria-pressed", String(t.number === n));
    request();
  }

  /** Fait sautiller la pastille d'une table (nouvelle commande). */
  function bump(n) {
    const t = tables.get(n);
    if (!t || reduceMotion || !t.tag.animate) return;
    // « scale » s'ajoute à la position (--pos) sans l'écraser
    t.tag.animate([{ scale: 1 }, { scale: 1.25 }, { scale: 1 }], { duration: 380, iterations: 3, easing: "ease-in-out" });
  }

  return { init, setTable, select, bump, numbers: () => [...tables.keys()] };
})();
