/* =====================================================================
   Aroma Café · Produits en 3D (Three.js r149 + GSAP)
   Chaque produit est construit en code avec des formes simples :
   - « révolution » (LatheGeometry) pour les verres, tasses, liquides, crème
   - textures dessinées dans un <canvas> (buée, crema, peau du steak…)
   - matériaux physiques (verre, glaçons, liquides translucides)
   Partie 1 : la scène (rendu, lumières, sol) et les outils communs
   Partie 2 : les boissons
   Partie 3 : les plats, puis l'animation et l'interaction au doigt
   app.js appelle showModel("burger") pour changer de produit.
   ===================================================================== */
let showModel = () => {};   // remplacée plus bas si la 3D est disponible
let glPaused = false;

// Sans Three.js (ou sans WebGL sur le téléphone), on masque simplement la scène
if(window.THREE){(function(){
const T=THREE,canvas=$("gl"),stage=$("stage");
if(T.ColorManagement)T.ColorManagement.legacyMode=false;
function cv(w,h,draw){const c=document.createElement("canvas");c.width=w;c.height=h;draw(c.getContext("2d"),w,h);const t=new T.CanvasTexture(c);t.encoding=T.sRGBEncoding;t.anisotropy=8;return t}
let renderer;try{renderer=new T.WebGLRenderer({canvas,antialias:true,alpha:true,powerPreference:"low-power"})}catch(e){stage.hidden=true;return}
renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.75));
renderer.outputEncoding=T.sRGBEncoding;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.0;
renderer.physicallyCorrectLights=true;renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;
const scene=new T.Scene(),camera=new T.PerspectiveCamera(28,1,.1,60);
camera.position.set(0,2.7,7.6);camera.lookAt(0,1.38,0);
scene.add(new T.HemisphereLight(0xfff3e4,0x8a6a55,1.1));
const key=new T.DirectionalLight(0xfff6ec,3.2);key.position.set(1.4,8,3);key.castShadow=true;
key.shadow.mapSize.set(1024,1024);Object.assign(key.shadow.camera,{left:-2.5,right:2.5,top:2.5,bottom:-2.5,near:1,far:16});key.shadow.bias=-.0006;key.shadow.normalBias=.02;key.shadow.radius=5;scene.add(key);
const rim=new T.DirectionalLight(0xffe0bc,2.2);rim.position.set(-4.5,3.5,-3.5);scene.add(rim);
const fill=new T.DirectionalLight(0xffffff,.8);fill.position.set(-3,1.5,5);scene.add(fill);

// Studio photo généré : grandes boîtes à lumière + sol chaud, pour les reflets réalistes du verre, de la céramique et des liquides
(function(){const pm=new T.PMREMGenerator(renderer),es=new T.Scene();
  const sky=cv(16,256,(x,w,h)=>{const g=x.createLinearGradient(0,0,0,h);g.addColorStop(0,"#d9d2ca");g.addColorStop(.48,"#b8a796");g.addColorStop(.52,"#8c715c");g.addColorStop(1,"#4a3529");x.fillStyle=g;x.fillRect(0,0,w,h)});
  es.add(new T.Mesh(new T.SphereGeometry(12,32,16),new T.MeshBasicMaterial({map:sky,side:T.BackSide})));
  const lm=(c,k)=>{const m=new T.MeshBasicMaterial({color:c,side:T.DoubleSide});m.color.multiplyScalar(k);return m};
  const box=(w,h,c,k,p)=>{const m=new T.Mesh(new T.PlaneGeometry(w,h),lm(c,k));m.position.set(...p);m.lookAt(0,1,0);es.add(m)};
  box(7,3.2,0xffffff,7,[0,8,2]);          // softbox au plafond
  box(1.6,7,0xfff2e2,6,[-7.5,2.5,2.5]);   // strip gauche
  box(1.6,7,0xffffff,8,[7.5,2.5,-1]);     // strip droit (liseré sur le verre)
  box(4,2.5,0xffffff,3,[0,2.5,9]);        // face caméra, léger
  scene.environment=pm.fromScene(es,.02).texture;pm.dispose();})();

// Fond opaque identique au fond de la scène : les liquides translucides le voient en transparence
const backTex=cv(512,512,(x,w,h)=>{const g=x.createRadialGradient(w*.5,h*.18,0,w*.5,h*.18,w*.95);g.addColorStop(0,"#FFFDF9");g.addColorStop(1,"#F1E5D6");x.fillStyle=g;x.fillRect(0,0,w,h)});
const backdrop=new T.Mesh(new T.PlaneGeometry(1,1),new T.MeshBasicMaterial({map:backTex,toneMapped:false,depthWrite:false}));
backdrop.position.z=-30;backdrop.renderOrder=-10;camera.add(backdrop);scene.add(camera);
// Sol : ombre portée réelle + ombre de contact douce
const ground=new T.Mesh(new T.PlaneGeometry(8,8),new T.ShadowMaterial({opacity:.18}));ground.rotation.x=-Math.PI/2;ground.receiveShadow=true;scene.add(ground);
const shadowTex=(()=>{const c=document.createElement("canvas");c.width=c.height=128;const x=c.getContext("2d");
  const g=x.createRadialGradient(64,64,0,64,64,64);g.addColorStop(0,"rgba(40,22,10,.6)");g.addColorStop(.5,"rgba(40,22,10,.22)");g.addColorStop(1,"rgba(40,22,10,0)");x.fillStyle=g;x.fillRect(0,0,128,128);return new T.CanvasTexture(c)})();
const shadow=new T.Mesh(new T.PlaneGeometry(2.4,2.4),new T.MeshBasicMaterial({map:shadowTex,transparent:true,depthWrite:false}));
shadow.rotation.x=-Math.PI/2;shadow.position.y=.004;scene.add(shadow);

/* ---------- outils ---------- */
const rnd=(a,b)=>a+Math.random()*(b-a);
function blob(x,cx,cy,r,col,a){const g=x.createRadialGradient(cx,cy,0,cx,cy,r);g.addColorStop(0,col.replace(")",","+a+")").replace("rgb","rgba"));g.addColorStop(1,col.replace(")",",0)").replace("rgb","rgba"));x.fillStyle=g;x.beginPath();x.arc(cx,cy,r,0,7);x.fill()}
function wrapBlob(x,w,cx,cy,r,col,a){blob(x,cx,cy,r,col,a);if(cx<r)blob(x,cx+w,cy,r,col,a);if(cx>w-r)blob(x,cx-w,cy,r,col,a)}
// Cartes de relief générées : buée + gouttes (verre froid), givre (glaçons)
function reliefMaps({size=512,count=500,rMin=1.2,rMax=9,mist=0,strength=3}={}){
  const c=document.createElement("canvas");c.width=c.height=size;const x=c.getContext("2d");
  x.fillStyle="#000";x.fillRect(0,0,size,size);
  const drop=(cx,cy,r)=>{const g=x.createRadialGradient(cx-r*.15,cy-r*.2,0,cx,cy,r);g.addColorStop(0,"#fff");g.addColorStop(.6,"#bbb");g.addColorStop(1,"rgba(0,0,0,0)");x.fillStyle=g;
    x.beginPath();x.ellipse(cx,cy,r,r*rnd(1,1.35),0,0,7);x.fill()};
  for(let i=0;i<count;i++){const r=Math.random()<.8?rnd(rMin,rMax*.45):rnd(rMax*.45,rMax),cx=rnd(0,size),cy=rnd(0,size);
    drop(cx,cy,r);if(cx<r)drop(cx+size,cy,r);if(cx>size-r)drop(cx-size,cy,r);if(cy<r)drop(cx,cy+size,r);if(cy>size-r)drop(cx,cy-size,r)}
  const src=x.getImageData(0,0,size,size).data,n=new ImageData(size,size),ro=new ImageData(size,size),H=(i,j)=>src[(((j+size)%size)*size+((i+size)%size))*4]/255;
  for(let j=0;j<size;j++)for(let i=0;i<size;i++){const dx=(H(i-1,j)-H(i+1,j))*strength,dy=(H(i,j-1)-H(i,j+1))*strength,l=Math.hypot(dx,dy,1),o=(j*size+i)*4,h=H(i,j);
    n.data[o]=(dx/l*.5+.5)*255;n.data[o+1]=(dy/l*.5+.5)*255;n.data[o+2]=(1/l*.5+.5)*255;n.data[o+3]=255;
    const r=h>.08?.02:mist;ro.data[o]=ro.data[o+1]=ro.data[o+2]=r*255;ro.data[o+3]=255}
  const tex=d=>{const k=document.createElement("canvas");k.width=k.height=size;k.getContext("2d").putImageData(d,0,0);const t=new T.CanvasTexture(k);t.wrapS=t.wrapT=T.RepeatWrapping;t.anisotropy=8;return t};
  return {normal:tex(n),rough:tex(ro)}}
const CONDENS=reliefMaps({count:380,rMax:11,mist:.2,strength:3.2});CONDENS.normal.repeat.set(2,1.4);CONDENS.rough.repeat.set(2,1.4);
const DRY=reliefMaps({count:60,rMax:4,mist:.05,strength:1.5});DRY.normal.repeat.set(2,2);DRY.rough.repeat.set(2,2);
const FROST=reliefMaps({size:256,count:900,rMin:1,rMax:6,mist:.25,strength:2.5});

// Verre fin : une couche teintée très légère + une couche de reflets ajoutée (le verre réel ne « blanchit » pas le contenu)
function glass(rf,h,{segs=72,wall=.035,base=.14,flat=false,cold=false}={}){
  const pts=[new T.Vector2(0,0)],N=48;
  for(let i=0;i<=N;i++){const y=h*i/N;pts.push(new T.Vector2(rf(y)*(i===0?.96:1),y))}
  pts.push(new T.Vector2(rf(h)-wall*.5,h+.012),new T.Vector2(rf(h)-wall,h));
  for(let i=N;i>=0;i--){const y=base+(h-base)*i/N;pts.push(new T.Vector2(Math.max(.01,rf(y)-wall),y))}
  pts.push(new T.Vector2(0,base));
  const geo=new T.LatheGeometry(pts,segs),maps=cold?CONDENS:DRY,g=new T.Group();
  const tint=new T.MeshPhysicalMaterial({color:0xF4F8F6,roughness:.08,roughnessMap:maps.rough,transparent:true,opacity:cold?.06:.05,side:T.DoubleSide,depthWrite:false,flatShading:flat});
  const refl=new T.MeshPhysicalMaterial({color:0x000000,roughness:.02,metalness:0,clearcoat:1,clearcoatRoughness:.02,normalMap:maps.normal,normalScale:new T.Vector2(.7,.7),
    clearcoatNormalMap:maps.normal,clearcoatNormalScale:new T.Vector2(.5,.5),envMapIntensity:1.5,transparent:true,blending:T.AdditiveBlending,depthWrite:false,side:T.FrontSide,flatShading:flat});
  const a=new T.Mesh(geo,tint),b=new T.Mesh(geo,refl);a.renderOrder=3;b.renderOrder=4;a.userData.noShadow=b.userData.noShadow=true;g.add(a,b);
  // fond épais du verre (prisme de lumière)
  const bottom=new T.Mesh(new T.CylinderGeometry(rf(base*.5)-wall*.8,rf(0)*.95,base,segs),new T.MeshPhysicalMaterial({color:0xE9F2EE,transmission:1,thickness:.4,ior:1.5,roughness:.04,envMapIntensity:1.5}));
  bottom.position.y=base/2;bottom.userData.noShadow=true;g.add(bottom);
  return g}
// Gouttes en relief sur la paroi extérieure (boissons froides)
function droplets(rf,h,n=70,ymin=.25,ymax=.92){const geo=new T.SphereGeometry(1,10,8,0,Math.PI*2,0,Math.PI/2);geo.rotateX(Math.PI/2);
  const m=new T.InstancedMesh(geo,new T.MeshPhysicalMaterial({color:0xffffff,roughness:0,transparent:true,opacity:.2,clearcoat:1,clearcoatRoughness:0,envMapIntensity:2.6,depthWrite:false}),n),o=new T.Object3D();
  for(let i=0;i<n;i++){const y=rnd(ymin,ymax)*h,a=rnd(0,Math.PI*2),r=rf(y)+.002,s=Math.random()<.85?rnd(.018,.035):rnd(.04,.06);
    o.position.set(Math.cos(a)*r,y,Math.sin(a)*r);o.lookAt(Math.cos(a)*r*2,y,Math.sin(a)*r*2);o.scale.set(s,s*rnd(1,1.5),s*.55);o.updateMatrix();m.setMatrixAt(i,o.matrix)}
  m.renderOrder=5;m.userData.noShadow=true;m.userData.noBox=true;m.frustumCulled=false;return m}
// Liquide : volume + surface (phys : options physiques, ex. transmission pour les liquides clairs)
function liquid(rf,y0,y1,{map,top,color=0xffffff,rough=.35,segs=72,inset=.045,phys,bump}={}){
  const g=new T.Group(),pts=[],N=36;
  pts.push(new T.Vector2(0,y0));
  for(let i=0;i<=N;i++){const y=y0+(y1-y0)*i/N;pts.push(new T.Vector2(Math.max(.01,rf(y)-inset),y))}
  pts.push(new T.Vector2(0,y1));
  const mat=new T.MeshPhysicalMaterial(Object.assign({color,map,roughness:rough,clearcoat:.35,clearcoatRoughness:.15,envMapIntensity:.55,bumpMap:bump||null,bumpScale:.004},phys||{}));
  const body=new T.Mesh(new T.LatheGeometry(pts,segs),mat);body.renderOrder=1;g.add(body);
  const dm=top==="same"?mat:top?new T.MeshPhysicalMaterial({map:top,roughness:.4,clearcoat:.6,clearcoatRoughness:.1,envMapIntensity:.6}):mat;
  const d=new T.Mesh(new T.CircleGeometry(rf(y1)-inset,segs),dm);d.rotation.x=-Math.PI/2;d.position.y=y1+.001;d.renderOrder=1;g.add(d);
  return g}
function iceCube(s){const g=new T.BoxGeometry(s,s,s,4,4,4),p=g.attributes.position,v=new T.Vector3();
  for(let i=0;i<p.count;i++){v.fromBufferAttribute(p,i);const n=v.clone().normalize().multiplyScalar(s*.8);v.lerp(n,.3);v.multiplyScalar(1+rnd(-.025,.025));p.setXYZ(i,v.x,v.y,v.z)}
  g.computeVertexNormals();return g}
// clear=true : glaçon translucide réfractant (au-dessus du liquide) ; false : glaçon vu à travers un liquide clair
const iceMat=(clear,tint)=>clear
  ?new T.MeshPhysicalMaterial({color:tint||0xffffff,transmission:1,thickness:.35,ior:1.31,roughness:.12,roughnessMap:FROST.rough,normalMap:FROST.normal,normalScale:new T.Vector2(.6,.6),clearcoat:1,clearcoatRoughness:.05,envMapIntensity:1.6,attenuationColor:new T.Color(tint||0xffffff),attenuationDistance:1.2})
  :new T.MeshPhysicalMaterial({color:tint||0xF4EBDF,roughness:.22,normalMap:FROST.normal,normalScale:new T.Vector2(.8,.8),clearcoat:1,clearcoatRoughness:.04,envMapIntensity:1.8});
function ices(n,rf,y,tint,size=.36,clear=true){const g=new T.Group();for(let i=0;i<n;i++){const s=size*rnd(.85,1.1),a=i/n*Math.PI*2+rnd(-.3,.3),rr=(rf(y)-.05-s*.55)*rnd(.25,1);
  const m=new T.Mesh(iceCube(s),iceMat(clear,tint));m.position.set(Math.cos(a)*rr,y+rnd(-.12,.12)-(i%2)*.32,Math.sin(a)*rr);m.rotation.set(rnd(0,3),rnd(0,3),rnd(0,3));m.renderOrder=0;m.userData.noShadow=true;g.add(m)}return g}
function citrusTex(peel,flesh,pith="#FFF4D6"){return cv(512,512,(x,w)=>{const c=w/2;x.fillStyle=peel;x.beginPath();x.arc(c,c,c,0,7);x.fill();
  x.fillStyle=pith;x.beginPath();x.arc(c,c,c*.9,0,7);x.fill();const n=10;
  for(let i=0;i<n;i++){const a0=i/n*Math.PI*2+.04,a1=(i+1)/n*Math.PI*2-.04;x.fillStyle=flesh;x.beginPath();x.moveTo(c+Math.cos((a0+a1)/2)*8,c+Math.sin((a0+a1)/2)*8);x.arc(c,c,c*.84,a0,a1);x.closePath();x.fill();
    for(let k=0;k<70;k++){const a=rnd(a0,a1),r=rnd(c*.15,c*.8);x.fillStyle="rgba(255,255,255,.2)";x.beginPath();x.ellipse(c+Math.cos(a)*r,c+Math.sin(a)*r,8,2.4,a,0,7);x.fill()}}
  x.fillStyle=pith;x.beginPath();x.arc(c,c,16,0,7);x.fill()})}
function citrusSlice(r,peel,flesh,{half=false,thick=.05}={}){const t=citrusTex(peel,flesh),side=new T.MeshPhysicalMaterial({color:peel,roughness:.45,clearcoat:.4,bumpMap:FROST.normal,bumpScale:.002});
  const face=new T.MeshPhysicalMaterial({map:t,roughness:.25,clearcoat:.8,clearcoatRoughness:.15,emissive:new T.Color(flesh),emissiveIntensity:.12,emissiveMap:t});
  const geo=new T.CylinderGeometry(r,r,thick,40,1,false,0,half?Math.PI:Math.PI*2);
  const m=new T.Mesh(geo,[side,face,face]);return m}
function straw(len,c1,c2,r=.045){const t=cv(64,256,(x,w,h)=>{x.fillStyle=c1;x.fillRect(0,0,w,h);x.fillStyle=c2;for(let i=-4;i<12;i++){x.beginPath();x.moveTo(0,i*32);x.lineTo(w,i*32+32);x.lineTo(w,i*32+48);x.lineTo(0,i*32+16);x.fill()}});
  t.wrapS=t.wrapT=T.RepeatWrapping;t.repeat.set(1,len*1.6);const m=new T.Mesh(new T.CylinderGeometry(r,r,len,20,1,true),new T.MeshStandardMaterial({map:t,roughness:.45,side:T.DoubleSide}));return m}
// Crème fouettée torsadée
function cream(r,h,color,ridges=8){const pts=[],N=48;
  for(let i=0;i<=N;i++){const k=i/N,y=k*h,rr=r*Math.pow(1-k,.72)*(1+.13*Math.sin(k*Math.PI*5.5))+.002;pts.push(new T.Vector2(rr,y))}
  const g=new T.LatheGeometry(pts,96),p=g.attributes.position,v=new T.Vector3();
  for(let i=0;i<p.count;i++){v.fromBufferAttribute(p,i);const a=Math.atan2(v.z,v.x),k=1+.1*Math.cos(ridges*a+v.y*9);p.setX(i,v.x*k);p.setZ(i,v.z*k)}
  g.computeVertexNormals();return new T.Mesh(g,new T.MeshPhysicalMaterial({color,roughness:.55,clearcoat:.2,clearcoatRoughness:.5,sheen:.6,sheenRoughness:.6,sheenColor:new T.Color(0xffffff),bumpMap:FROST.normal,bumpScale:.003}))}
function drizzle(r,h,color){const pts=[];for(let i=0;i<=120;i++){const k=i/120,a=k*Math.PI*7;const rr=r*Math.pow(1-k,.72)*1.05+.03;pts.push(new T.Vector3(Math.cos(a)*rr,k*h+.04,Math.sin(a)*rr))}
  return new T.Mesh(new T.TubeGeometry(new T.CatmullRomCurve3(pts),240,.045,8,false),new T.MeshPhysicalMaterial({color,roughness:.12,clearcoat:1,clearcoatRoughness:.05}))}
function crumbs(n,r,h,y,color){const g=new T.Group(),geo=new T.IcosahedronGeometry(.06,0),mat=new T.MeshStandardMaterial({color,roughness:.9});
  for(let i=0;i<n;i++){const k=Math.random(),a=rnd(0,7),rr=r*Math.pow(1-k,.72)*1.02;const m=new T.Mesh(geo,mat);m.position.set(Math.cos(a)*rr,y+k*h,Math.sin(a)*rr);m.scale.setScalar(rnd(.6,1.6));m.rotation.set(rnd(0,3),rnd(0,3),0);g.add(m)}return g}
function cookie(r){const g=new T.Group(),t=cv(256,256,(x,w)=>{const c=w/2;x.fillStyle="#2B1A12";x.fillRect(0,0,w,w);x.strokeStyle="#3D261A";x.lineWidth=5;
    x.beginPath();x.arc(c,c,c*.86,0,7);x.stroke();x.beginPath();x.arc(c,c,c*.5,0,7);x.stroke();
    for(let i=0;i<16;i++){const a=i/16*Math.PI*2;x.beginPath();x.moveTo(c+Math.cos(a)*c*.55,c+Math.sin(a)*c*.55);x.lineTo(c+Math.cos(a)*c*.82,c+Math.sin(a)*c*.82);x.stroke();
      x.beginPath();x.arc(c+Math.cos(a+.2)*c*.7,c+Math.sin(a+.2)*c*.7,6,0,7);x.stroke()}});
  const dark=new T.MeshStandardMaterial({color:0x2B1A12,roughness:.85}),face=new T.MeshStandardMaterial({map:t,roughness:.85,bumpMap:t,bumpScale:.03});
  const a=new T.Mesh(new T.CylinderGeometry(r,r,.07,40),[dark,face,face]);a.position.y=.06;
  const b=a.clone();b.position.y=-.06;const f=new T.Mesh(new T.CylinderGeometry(r*.93,r*.93,.06,40),new T.MeshStandardMaterial({color:0xF7F1E6,roughness:.7}));
  g.add(a,b,f);return g}
function pineappleWedge(s){const g=new T.Group(),sh=new T.Shape();sh.moveTo(0,0);sh.lineTo(s,0);sh.lineTo(s*.5,-s*.95);sh.closePath();
  const flesh=cv(128,128,(x,w,h)=>{x.fillStyle="#F6CC2A";x.fillRect(0,0,w,h);for(let i=0;i<120;i++){x.fillStyle=`rgba(255,${200+rnd(0,55)|0},80,.35)`;x.fillRect(rnd(0,w),rnd(0,h),rnd(1,3),rnd(6,14))}});
  const geo=new T.ExtrudeGeometry(sh,{depth:s*.32,bevelEnabled:true,bevelSize:.02,bevelThickness:.02,bevelSegments:2});geo.translate(-s/2,0,-s*.16);
  const m=new T.Mesh(geo,new T.MeshStandardMaterial({map:flesh,roughness:.45}));g.add(m);
  const rind=new T.Mesh(new T.BoxGeometry(s*1.04,.07,s*.36),new T.MeshStandardMaterial({color:0x8A6418,roughness:.9}));rind.position.y=.035;g.add(rind);
  const leafMat=new T.MeshStandardMaterial({color:0x3E7A23,roughness:.6,side:T.DoubleSide});
  for(let i=0;i<5;i++){const l=new T.Mesh(new T.ConeGeometry(.06,s*rnd(.9,1.25),4),leafMat);l.scale.z=.3;l.position.set((i-2)*s*.1,s*.55,0);l.rotation.z=(i-2)*-.22;g.add(l)}
  return g}
// textures de liquide
const liqTex={
  solid:(c1,c2,specks)=>cv(256,256,(x,w,h)=>{const g=x.createLinearGradient(0,0,0,h);g.addColorStop(0,c1);g.addColorStop(1,c2);x.fillStyle=g;x.fillRect(0,0,w,h);
    for(let i=0;i<700;i++){x.fillStyle=specks;x.globalAlpha=rnd(.05,.25);x.beginPath();x.arc(rnd(0,w),rnd(0,h),rnd(.6,2),0,7);x.fill()}x.globalAlpha=1}),
  swirl:(base,topCol,bands,dark)=>cv(512,512,(x,w,h)=>{x.fillStyle=base;x.fillRect(0,0,w,h);
    // haut foncé (café) qui descend en volutes vers le lait
    for(let i=0;i<260;i++){const y=Math.pow(Math.random(),1.6)*h*bands,cx=rnd(0,w);wrapBlob(x,w,cx,y,rnd(18,70),topCol,rnd(.12,.4))}
    for(let i=0;i<60;i++){const y=rnd(0,h*bands*1.1),cx=rnd(0,w);wrapBlob(x,w,cx,y,rnd(10,30),dark,rnd(.15,.45))}
    for(let i=0;i<40;i++){const y=rnd(h*.15,h*bands),cx=rnd(0,w);wrapBlob(x,w,cx,y,rnd(14,40),"rgb(250,246,238)",rnd(.25,.55))}}),
  drips:(base,choc)=>cv(512,512,(x,w,h)=>{x.fillStyle=base;x.fillRect(0,0,w,h);
    for(let i=0;i<1600;i++){x.fillStyle=Math.random()<.5?"rgba(60,30,15,.35)":"rgba(255,235,210,.22)";x.beginPath();x.arc(rnd(0,w),rnd(0,h),rnd(.8,2.6),0,7);x.fill()}
    x.fillStyle=choc;for(let i=0;i<6;i++){const cx=i*w/6+rnd(0,40),len=rnd(h*.55,h*.92),wd=rnd(10,20);x.beginPath();x.moveTo(cx-wd,0);
      x.bezierCurveTo(cx-wd*.6,len*.4,cx-wd*.9,len*.7,cx-wd*.4,len);x.arc(cx,len,wd*.45,Math.PI,0,true);x.bezierCurveTo(cx+wd*.8,len*.7,cx+wd*.5,len*.4,cx+wd,0);x.fill()}
    x.fillRect(0,0,w,12)}),
  flecks:(base,fleck)=>cv(512,512,(x,w,h)=>{x.fillStyle=base;x.fillRect(0,0,w,h);for(let i=0;i<2200;i++){x.fillStyle=fleck;x.globalAlpha=rnd(.3,.9);x.beginPath();x.arc(rnd(0,w),rnd(0,h),rnd(.6,2.2),0,7);x.fill()}x.globalAlpha=1;
    x.fillStyle="rgba(50,28,20,.8)";x.fillRect(0,0,w,10)})
};
function crema(){return cv(512,512,(x,w)=>{const c=w/2;x.fillStyle="#B57A3F";x.fillRect(0,0,w,w);
  const g=x.createRadialGradient(c,c,c*.2,c,c,c);g.addColorStop(0,"rgba(120,70,30,.0)");g.addColorStop(1,"rgba(100,55,20,.55)");x.fillStyle=g;x.fillRect(0,0,w,w);
  x.fillStyle="#24130A";x.beginPath();x.moveTo(c-60,c-150);x.bezierCurveTo(c+120,c-170,c+40,c-10,c-30,c+30);x.bezierCurveTo(c-110,c+80,c-20,c+170,c+60,c+150);
  x.bezierCurveTo(c-60,c+230,c-210,c+120,c-150,c);x.bezierCurveTo(c-110,c-80,c-170,c-120,c-60,c-150);x.fill();
  for(let i=0;i<260;i++){const a=rnd(0,7),r=c*rnd(.62,.97);x.strokeStyle="rgba(60,30,10,.55)";x.lineWidth=1.2;x.beginPath();x.arc(c+Math.cos(a)*r,c+Math.sin(a)*r,rnd(2,7),0,7);x.stroke()}
  for(let i=0;i<500;i++){x.fillStyle="rgba(230,170,100,.25)";x.beginPath();x.arc(rnd(0,w),rnd(0,w),rnd(.5,1.8),0,7);x.fill()}})}
  /* ---------- modèles ---------- */
const BUILD={
  cup(){const g=new T.Group(),h=1.75;
    const rf=y=>{const k=y/h;return .58+.42*Math.sin(Math.min(1,k*1.15)*Math.PI/2)};
    const pts=[new T.Vector2(0,0),new T.Vector2(.42,0),new T.Vector2(.46,.04),new T.Vector2(.5,.07)];
    for(let i=1;i<=30;i++){const y=.07+(h-.07)*i/30;pts.push(new T.Vector2(rf(y),y))}
    pts.push(new T.Vector2(rf(h)-.03,h+.02),new T.Vector2(rf(h)-.08,h-.01));
    for(let i=30;i>=0;i--){const y=.2+(h-.2)*i/30;pts.push(new T.Vector2(Math.max(.02,rf(y)-.08),y))}pts.push(new T.Vector2(0,.2));
    const cer=new T.MeshPhysicalMaterial({color:0xF6F4F0,roughness:.28,clearcoat:1,clearcoatRoughness:.06,sheen:.3,sheenColor:new T.Color(0xffffff),envMapIntensity:1.1});
    g.add(new T.Mesh(new T.LatheGeometry(pts,72),cer));
    const handle=new T.Mesh(new T.TorusGeometry(.36,.085,18,40,Math.PI*1.25),cer);handle.position.set(rf(1)+.12,1.0,0);handle.rotation.z=-Math.PI*.62;handle.scale.set(1,1.15,.7);g.add(handle);
    const top=new T.Mesh(new T.CircleGeometry(rf(h-.14)-.08,64),new T.MeshPhysicalMaterial({map:crema(),bumpMap:FROST.normal,bumpScale:.002,roughness:.3,clearcoat:1,clearcoatRoughness:.08}));
    top.rotation.x=-Math.PI/2;top.position.y=h-.14;top.rotation.z=.5;g.add(top);
    // vapeur légère
    const st=cv(64,256,(x,w,hh)=>{const gr=x.createLinearGradient(0,hh,0,0);gr.addColorStop(0,"rgba(255,255,255,0)");gr.addColorStop(.3,"rgba(255,255,255,.55)");gr.addColorStop(1,"rgba(255,255,255,0)");
      x.fillStyle=gr;x.beginPath();x.moveTo(w*.5,hh);x.bezierCurveTo(0,hh*.7,w,hh*.4,w*.4,0);x.lineTo(w*.6,0);x.bezierCurveTo(w*1.1,hh*.4,w*.15,hh*.7,w*.65,hh);x.fill()});
    g.userData.steam=[];for(let i=0;i<3;i++){const s=new T.Mesh(new T.PlaneGeometry(.38,1.3),new T.MeshBasicMaterial({map:st,transparent:true,opacity:0,depthWrite:false}));
      s.position.set((i-1)*.28,h+.7,(i%2)*.1);g.add(s);g.userData.steam.push({m:s,ph:i*2.1})}
    return g},
  icedLatte(){const g=new T.Group(),h=2.5,R=.78,rf=y=>{const b=Math.min(1,y/.25),t=Math.min(1,(h-y)/.32);return R*(.86+.14*Math.sin(b*Math.PI/2))*(.9+.1*Math.sin(t*Math.PI/2))};
    g.add(liquid(rf,.14,h-.22,{map:liqTex.swirl("rgb(246,242,234)","rgb(78,38,15)",.66,"rgb(30,14,5)"),top:liqTex.solid("#5A3218","#3A1E0E","rgba(255,230,200,.6)"),rough:.3}));
    g.add(ices(4,rf,h-.2,0xE8D6C2,.42));g.add(glass(rf,h,{cold:true}));g.add(droplets(rf,h,40,.12,.9));return g},
  mocha(){const g=new T.Group(),h=2.0,rf=y=>.8+.06*y/h;
    g.add(liquid(rf,.14,h-.06,{map:liqTex.drips("#9C6B48","#2A140A"),rough:.5,bump:FROST.normal}));
    const c=cream(.76,1.0,0xA87552,10);c.position.y=h-.08;g.add(c);
    const d=drizzle(.72,.95,0x2A1208);d.position.y=h-.08;g.add(d);
    g.add(glass(rf,h,{cold:true}));return g},
  shake(){const g=new T.Group(),h=3.0,rf=y=>.56+.24*Math.pow(y/h,1.1);
    g.add(liquid(rf,.16,h-.08,{map:liqTex.flecks("#B9A49C","#2A1A14"),rough:.6,segs:14}));
    const c=cream(.86,.85,0xF6EEDF,8);c.position.y=h-.1;g.add(c);g.add(crumbs(38,.86,.85,h-.08,0x2B1A12));
    const ck=cookie(.36);ck.position.set(.12,h+.42,.5);ck.rotation.set(Math.PI/2-.35,0,-.2);g.add(ck);
    const s=straw(2.0,"#F3ECE2","#4A2A1A");s.position.set(.32,h+.4,-.15);s.rotation.z=-.28;g.add(s);
    g.add(glass(rf,h,{segs:14,flat:true}));return g},
  boba(){const g=new T.Group(),h=3.0,rf=y=>.58+.22*Math.pow(y/h,1.05);
    const tex=cv(512,512,(x,w,hh)=>{x.fillStyle="rgb(226,186,135)";x.fillRect(0,0,w,hh);
      for(let i=0;i<220;i++){const cx=rnd(0,w),y=rnd(0,hh);wrapBlob(x,w,cx,y,rnd(12,46),"rgb(150,70,18)",rnd(.25,.6))}
      for(let i=0;i<80;i++){wrapBlob(x,w,rnd(0,w),rnd(0,hh),rnd(16,50),"rgb(250,236,212)",rnd(.3,.6))}});
    g.add(liquid(rf,.16,h-.4,{map:tex,rough:.32,segs:14}));
    const pearlGeo=new T.SphereGeometry(.075,18,12),pearlMat=new T.MeshPhysicalMaterial({color:0x0c0503,roughness:.25,clearcoat:1,clearcoatRoughness:.05,transmission:.15,thickness:.1,attenuationColor:new T.Color(0x3a1a08),attenuationDistance:.2,envMapIntensity:1.2});
    const inst=new T.InstancedMesh(pearlGeo,pearlMat,70),o=new T.Object3D();
    for(let i=0;i<70;i++){const y=.24+Math.floor(i/14)*.13+rnd(-.02,.02),a=(i%14)/14*Math.PI*2+Math.floor(i/14)*.22,rr=rf(y)-.085;o.position.set(Math.cos(a)*rr,y,Math.sin(a)*rr);o.updateMatrix();inst.setMatrixAt(i,o.matrix)}
    g.add(inst);g.add(ices(5,rf,h-.28,0xF0C08A,.4));g.add(glass(rf,h,{segs:14,flat:true,cold:true}));return g},
  smoothie(){const g=new T.Group(),h=2.8,rf=y=>.6+.16*y/h;
    g.add(liquid(rf,.14,h-.1,{map:liqTex.solid("#F8D660","#F1C232","rgba(255,250,210,.9)"),top:liqTex.solid("#F9DE74","#F4CF4C","rgba(255,255,230,.9)"),rough:.65}));
    const w=pineappleWedge(.85);w.position.set(rf(h)-.02,h+.22,0);w.rotation.set(0,0,.12);g.add(w);
    g.add(glass(rf,h,{cold:true}));return g},
  juice(){const g=new T.Group(),h=2.7,rf=y=>{const k=y/h;return .55+.22*Math.sin(Math.min(1,k*1.25)*Math.PI*.62)-.04*k};
    g.add(liquid(rf,.15,h-.14,{map:liqTex.solid("#FFA41F","#FF8F0A","rgba(255,220,140,.9)"),top:liqTex.solid("#FFC062","#FFA22A","rgba(255,245,215,.95)"),rough:.4,phys:{transmission:.3,thickness:1.2,ior:1.34,attenuationColor:new T.Color(0xFF7A00),attenuationDistance:.9}}));
    const s=citrusSlice(.46,"#F28A0C","#FFA525",{half:true});s.rotation.set(Math.PI/2,0,Math.PI/2);s.position.set(rf(h)-.02,h-.02,0);g.add(s);
    const st=straw(2.1,"#FFFFFF","#F4801F");st.position.set(-.18,h+.35,-.12);st.rotation.z=.2;g.add(st);
    g.add(glass(rf,h,{cold:true}));g.add(droplets(rf,h,90,.1,.9));return g},
  icedTea(){const g=new T.Group(),h=3.0,rf=y=>.6+.12*y/h;
    g.add(ices(6,rf,h-.22,0xF2E4D2,.4,false));
    const in1=citrusSlice(.28,"#F08A10","#FFAA2C");in1.rotation.set(Math.PI/2,0,0);in1.position.set(-.05,h*.62,rf(h*.62)-.2);g.add(in1);
    const in2=citrusSlice(.25,"#F08A10","#FFAA2C");in2.rotation.set(Math.PI/2,0,.4);in2.position.set(.18,h*.4,rf(h*.4)-.22);in2.rotation.y=.35;g.add(in2);
    g.add(liquid(rf,.14,h-.34,{color:0xFFE6C4,rough:.03,top:"same",phys:{transmission:1,thickness:1.0,ior:1.34,attenuationColor:new T.Color(0xA84508),attenuationDistance:.8,clearcoat:1,clearcoatRoughness:.02,envMapIntensity:1.1}}));
    const lime=citrusSlice(.4,"#7FB51E","#C9E46A");lime.rotation.set(Math.PI/2,0,Math.PI/2);lime.position.set(rf(h)-.02,h+.08,.05);g.add(lime);
    g.add(glass(rf,h,{cold:true}));g.add(droplets(rf,h,110,.08,.92));return g},
  soda(){const g=new T.Group(),h=3.0,rf=y=>.62+.08*y/h;
    g.add(ices(6,rf,h-.22,0xF0E2CE,.4,false));
    const bub=new T.InstancedMesh(new T.SphereGeometry(.028,8,6),new T.MeshPhysicalMaterial({color:0xFFF1D6,roughness:.02,clearcoat:1,clearcoatRoughness:0,envMapIntensity:3}),110);
    const bd=[];for(let i=0;i<110;i++){const a=rnd(0,7),r=rnd(.1,rf(1)-.1);bd.push({a,r,y:rnd(.2,h-.2),v:rnd(.25,.7)})}g.userData.bubbles={mesh:bub,data:bd,h};bub.userData.noBox=true;bub.frustumCulled=false;g.add(bub);
    g.add(liquid(rf,.14,h-.34,{color:0xFFE0B0,rough:.03,top:"same",phys:{transmission:1,thickness:1.0,ior:1.34,attenuationColor:new T.Color(0x7A3A10),attenuationDistance:.55,clearcoat:1,clearcoatRoughness:.02,envMapIntensity:1.1}}));
    const l=citrusSlice(.36,"#F6B70E","#FFD43B",{half:true});l.rotation.set(Math.PI/2,0,Math.PI/2);l.position.set(rf(h)-.02,h+.02,0);g.add(l);
    g.add(glass(rf,h,{base:.32,cold:true}));g.add(droplets(rf,h,110,.12,.92));return g},
      /* ---------- SUCRERIE : canette générique (sans marque) ---------- */
  can(){const g=new T.Group(),R=.55,H=2.1;
    const prof=[new T.Vector2(0,.06),new T.Vector2(R*.7,.0),new T.Vector2(R*.92,.02),new T.Vector2(R,.12)];
    for(let i=1;i<=20;i++)prof.push(new T.Vector2(R,.12+(H-.42)*i/20));
    prof.push(new T.Vector2(R*.97,H-.2),new T.Vector2(R*.84,H-.06),new T.Vector2(R*.85,H),new T.Vector2(R*.8,H+.01),new T.Vector2(R*.78,H-.04));
    const label=cv(1024,512,(x,w,h)=>{const gr=x.createLinearGradient(0,0,0,h);gr.addColorStop(0,"#B50F17");gr.addColorStop(.5,"#E01D25");gr.addColorStop(1,"#A80C14");x.fillStyle=gr;x.fillRect(0,0,w,h);
      x.fillStyle="rgba(255,255,255,.95)";x.beginPath();x.moveTo(0,h*.62);for(let i=0;i<=w;i+=8)x.lineTo(i,h*.62+Math.sin(i/w*Math.PI*2)*h*.07);for(let i=w;i>=0;i-=8)x.lineTo(i,h*.66+Math.sin(i/w*Math.PI*2+.4)*h*.07);x.fill();
      x.fillStyle="rgba(255,255,255,.18)";x.fillRect(0,h*.06,w,4);x.fillRect(0,h*.92,w,4)});
    const metal=new T.MeshPhysicalMaterial({color:0xD7D9DC,metalness:1,roughness:.28,envMapIntensity:1.3});
    const body=new T.MeshPhysicalMaterial({map:label,metalness:.55,roughness:.32,clearcoat:1,clearcoatRoughness:.08,normalMap:CONDENS.normal,normalScale:new T.Vector2(.6,.6),clearcoatNormalMap:CONDENS.normal,clearcoatNormalScale:new T.Vector2(.5,.5)});
    // la partie haute et basse en alu, le corps peint
    const geo=new T.LatheGeometry(prof,96),uv=geo.attributes.uv,pos=geo.attributes.position;
    geo.clearGroups();const per=prof.length;let idx=geo.index.array;
    const paintedRow=r=>{const y=prof[r].y;return y>.13&&y<H-.21};
    // matériaux par bande : on découpe l'index en 2 groupes
    const a=[],b=[];for(let i=0;i<idx.length;i+=3){const rs=[idx[i]%per,idx[i+1]%per,idx[i+2]%per];(rs.every(paintedRow)?a:b).push(idx[i],idx[i+1],idx[i+2])}
    geo.setIndex([...a,...b]);geo.addGroup(0,a.length,0);geo.addGroup(a.length,b.length,1);
    g.add(new T.Mesh(geo,[body,metal]));
    const lid=new T.Mesh(new T.CircleGeometry(R*.79,64),metal);lid.rotation.x=-Math.PI/2;lid.position.y=H-.035;g.add(lid);
    const tab=new T.Mesh(new T.TorusGeometry(.13,.035,10,28),metal);tab.rotation.x=-Math.PI/2;tab.scale.set(1,1.5,.4);tab.position.set(0,H-.015,.1);g.add(tab);
    const hole=new T.Mesh(new T.CircleGeometry(.09,24),new T.MeshStandardMaterial({color:0x6d6f72,metalness:1,roughness:.5}));hole.rotation.x=-Math.PI/2;hole.position.set(0,H-.03,-.22);hole.scale.set(1,1.4,1);g.add(hole);
    g.add(droplets(y=>y<.12||y>H-.2?R*.9:R,H,80,.1,.86));return g},

  /* ---------- GLACE : deux coupes vanille / chocolat ---------- */
  iceCream(){const g=new T.Group();
    const coupe=(flavor,col1,col2,specks)=>{const c=new T.Group();
      const pts=[new T.Vector2(0,0),new T.Vector2(.52,0),new T.Vector2(.54,.025),new T.Vector2(.2,.05),new T.Vector2(.07,.12),new T.Vector2(.055,.4),new T.Vector2(.055,.9),new T.Vector2(.09,1.05)];
      for(let i=0;i<=14;i++){const a=i/14;pts.push(new T.Vector2(.12+.68*Math.sin(a*Math.PI/2),1.05+.5*(1-Math.cos(a*Math.PI/2))))}
      pts.push(new T.Vector2(.77,1.56));for(let i=14;i>=0;i--){const a=i/14;pts.push(new T.Vector2(Math.max(.01,.1+.65*Math.sin(a*Math.PI/2)),1.09+.47*(1-Math.cos(a*Math.PI/2))))}
      const geo=new T.LatheGeometry(pts,72);
      const tint=new T.MeshPhysicalMaterial({color:0xF4F8F6,roughness:.06,transparent:true,opacity:.035,depthWrite:false});
      const refl=new T.MeshPhysicalMaterial({color:0x000000,roughness:.02,clearcoat:1,clearcoatRoughness:.02,envMapIntensity:.22,transparent:true,blending:T.AdditiveBlending,depthWrite:false});
      const m1=new T.Mesh(geo,tint),m2=new T.Mesh(geo,refl);m1.renderOrder=3;m2.renderOrder=4;m1.userData.noShadow=m2.userData.noShadow=true;c.add(m1,m2);
      const tex=cv(512,512,(x,w,h)=>{x.fillStyle=col1;x.fillRect(0,0,w,h);for(let i=0;i<900;i++){x.fillStyle=Math.random()<.5?col2:"rgba(255,255,255,.25)";x.globalAlpha=rnd(.15,.5);x.beginPath();x.ellipse(rnd(0,w),rnd(0,h),rnd(4,18),rnd(1.5,4),rnd(0,3),0,7);x.fill()}
        x.globalAlpha=1;if(specks)for(let i=0;i<500;i++){x.fillStyle="rgba(40,22,10,.75)";x.beginPath();x.arc(rnd(0,w),rnd(0,h),rnd(.8,1.8),0,7);x.fill()}});
      const mat=new T.MeshPhysicalMaterial({map:tex,roughness:.7,clearcoat:.1,clearcoatRoughness:.6,bumpMap:FROST.normal,bumpScale:.005});
      const scoop=(r,seed)=>{const geo=new T.SphereGeometry(r,64,40),p=geo.attributes.position,v=new T.Vector3();
        for(let i=0;i<p.count;i++){v.fromBufferAttribute(p,i);const n=v.clone().normalize(),k=1+.06*Math.sin(n.x*9+seed)*Math.sin(n.y*7+seed*2)+.04*Math.sin(n.z*13+n.y*5+seed)+.035*Math.sin(Math.atan2(n.z,n.x)*6+n.y*18);
          let y=v.y*k;if(n.y<-.35){y=-r*.35+(y+r*.35)*.25}p.setXYZ(i,v.x*k*(n.y<-.2?1.08:1),y,v.z*k*(n.y<-.2?1.08:1))}
        geo.computeVertexNormals();return new T.Mesh(geo,mat)};
      const s1=scoop(.4,1);s1.position.set(-.18,1.6,.08);const s2=scoop(.38,4);s2.position.set(.2,1.62,-.06);const s3=scoop(.36,7);s3.position.set(.02,1.94,.02);c.add(s1,s2,s3);
      return c};
    const v=coupe("vanille","#E9CF92","#D9B66C",true);v.position.x=-.62;
    const ch=coupe("chocolat","#5E2F17","#3D1D0C",false);ch.position.set(.62,0,-.25);
    g.add(v,ch);return g},

  /* ---------- FASTFOOD : burger ---------- */
  burger(){const g=new T.Group();
    const nz=(x,y,z)=>Math.sin(x*5.1+Math.sin(y*3.7))*.5+Math.sin(y*4.3+z*6.1)*.3+Math.sin(z*7.7+x*2.9)*.2;
    const bunTex=cv(64,512,(x,w,h)=>{const gr=x.createLinearGradient(0,0,0,h);gr.addColorStop(0,"#EBC27E");gr.addColorStop(.15,"#CF7A2A");gr.addColorStop(.5,"#B4520F");gr.addColorStop(1,"#94400A");x.fillStyle=gr;x.fillRect(0,0,w,h);
      for(let i=0;i<300;i++){x.fillStyle="rgba(255,230,190,.25)";x.fillRect(rnd(0,w),rnd(0,h),1.5,1.5)}});
    const bunMat=new T.MeshPhysicalMaterial({map:bunTex,roughness:.5,clearcoat:.45,clearcoatRoughness:.35,bumpMap:FROST.normal,bumpScale:.004,envMapIntensity:.7});
    const crumb=new T.MeshPhysicalMaterial({map:cv(256,256,(x,w,h)=>{x.fillStyle="#E7C38C";x.fillRect(0,0,w,h);for(let i=0;i<2000;i++){x.fillStyle=Math.random()<.5?"rgba(160,90,30,.35)":"rgba(255,245,220,.4)";x.beginPath();x.arc(rnd(0,w),rnd(0,h),rnd(.6,2.4),0,7);x.fill()}
      x.strokeStyle="rgba(70,35,10,.55)";x.lineWidth=10;for(let i=0;i<5;i++){x.beginPath();x.moveTo(0,i*56+20);x.lineTo(w,i*56+20);x.stroke()}}),roughness:.85});
    // pain du bas
    const bp=[new T.Vector2(0,0),new T.Vector2(.9,0)];for(let i=0;i<=10;i++){const a=i/10*Math.PI/2;bp.push(new T.Vector2(.9+.12*Math.sin(a),.16-.16*Math.cos(a)+.16*Math.sin(a)*.0+.16*(i/10)))}
    bp.push(new T.Vector2(1.0,.34),new T.Vector2(0,.34));
    const bottom=new T.Mesh(new T.LatheGeometry(bp,80),bunMat);g.add(bottom);
    const bcut=new T.Mesh(new T.CircleGeometry(1.0,80),crumb);bcut.rotation.x=-Math.PI/2;bcut.position.y=.341;g.add(bcut);
    // steak haché
    const pg=new T.CylinderGeometry(1.02,1.0,.34,96,8),pp=pg.attributes.position,v=new T.Vector3();
    for(let i=0;i<pp.count;i++){v.fromBufferAttribute(pp,i);const r=Math.hypot(v.x,v.z),k=1+.035*nz(v.x*2,v.y*4,v.z*2);if(r>.01){pp.setX(i,v.x*k);pp.setZ(i,v.z*k)}pp.setY(i,v.y+.02*nz(v.z*3,v.x*3,v.y))}
    pg.computeVertexNormals();
    const meat=cv(512,512,(x,w,h)=>{x.fillStyle="#5B331F";x.fillRect(0,0,w,h);for(let i=0;i<5000;i++){const d=Math.random();x.fillStyle=d<.4?"rgba(30,14,6,.6)":d<.8?"rgba(140,80,45,.45)":"rgba(200,130,80,.35)";x.beginPath();x.arc(rnd(0,w),rnd(0,h),rnd(.8,3.5),0,7);x.fill()}});
    const patty=new T.Mesh(pg,new T.MeshPhysicalMaterial({map:meat,roughness:.62,clearcoat:.35,clearcoatRoughness:.4,bumpMap:meat,bumpScale:.02}));patty.position.y=.53;g.add(patty);
    // tomates
    const tom=cv(512,512,(x,w,h)=>{const c=w/2;x.fillStyle="#C9221A";x.fillRect(0,0,w,h);x.fillStyle="#E8392B";x.beginPath();x.arc(c,c,c*.86,0,7);x.fill();
      for(let i=0;i<4;i++){const a=i/4*Math.PI*2+.4;x.fillStyle="#F06A4E";x.beginPath();x.ellipse(c+Math.cos(a)*c*.48,c+Math.sin(a)*c*.48,c*.26,c*.17,a,0,7);x.fill();
        for(let k=0;k<9;k++){x.fillStyle="#F7D47A";x.beginPath();x.ellipse(c+Math.cos(a)*c*(.36+k%3*.1),c+Math.sin(a)*c*(.36+k%3*.1)+(k-4)*3,4,7,a,0,7);x.fill()}}
      x.fillStyle="#D9301F";x.beginPath();x.arc(c,c,c*.18,0,7);x.fill()});
    const tomMat=new T.MeshPhysicalMaterial({map:tom,roughness:.18,clearcoat:1,clearcoatRoughness:.05});const tomSide=new T.MeshPhysicalMaterial({color:0xC61F17,roughness:.25,clearcoat:1});
    [[-.32,.25],[.36,-.18],[.0,.5]].forEach(([x,z],i)=>{const t=new T.Mesh(new T.CylinderGeometry(.52,.52,.07,48),[tomSide,tomMat,tomMat]);t.position.set(x,.75+i*.012,z);t.rotation.set(rnd(-.04,.04),rnd(0,3),rnd(-.04,.04));g.add(t)});
    // oignons
    const onion=new T.MeshPhysicalMaterial({color:0xF4EEE4,roughness:.25,clearcoat:1,clearcoatRoughness:.1,sheen:.5,sheenColor:new T.Color(0xffffff)});
    [[.75,-.2,.1],[.55,.3,-.35],[.62,-.1,.45]].forEach(([r,x,z],i)=>{const t=new T.Mesh(new T.TorusGeometry(r*.6,.045,10,64),onion);t.rotation.x=Math.PI/2+rnd(-.05,.05);t.position.set(x,.84+i*.01,z);g.add(t)});
    // salade frisée
    const lg=new T.CircleGeometry(1.18,128,0,Math.PI*2),lp=lg.attributes.position;
    for(let i=0;i<lp.count;i++){v.fromBufferAttribute(lp,i);const r=Math.hypot(v.x,v.y),a=Math.atan2(v.y,v.x),k=r/1.18;
      const rr=r*(1+.06*Math.sin(a*11)*k);lp.setXYZ(i,Math.cos(a)*rr,Math.sin(a)*rr,(.09*Math.sin(a*23)+.05*Math.sin(a*7))*k*k-.12*k*k*k)}
    lg.computeVertexNormals();
    const leaf=cv(256,256,(x,w,h)=>{const c=w/2,gr=x.createRadialGradient(c,c,0,c,c,c);gr.addColorStop(0,"#B8D86B");gr.addColorStop(.7,"#7FB637");gr.addColorStop(1,"#5E9A22");x.fillStyle=gr;x.fillRect(0,0,w,h);
      x.strokeStyle="rgba(230,250,190,.5)";x.lineWidth=2;for(let i=0;i<40;i++){const a=i/40*Math.PI*2;x.beginPath();x.moveTo(c,c);x.lineTo(c+Math.cos(a)*c,c+Math.sin(a)*c);x.stroke()}});
    const lettuce=new T.Mesh(lg,new T.MeshPhysicalMaterial({map:leaf,roughness:.35,clearcoat:.6,side:T.DoubleSide,sheen:.3}));lettuce.rotation.x=-Math.PI/2;lettuce.position.y=.92;g.add(lettuce);
    // pain du haut, bombé et brillant
    const tp=[new T.Vector2(0,0),new T.Vector2(1.0,0)];for(let i=0;i<=24;i++){const a=i/24*Math.PI/2;tp.push(new T.Vector2(Math.max(.001,1.04*Math.cos(a)*(1+.04*Math.sin(a*2))),.06+.86*Math.sin(a)))}
    const tg=new T.LatheGeometry(tp,96),tpp=tg.attributes.position;
    for(let i=0;i<tpp.count;i++){v.fromBufferAttribute(tpp,i);if(v.y>.1){const k=1+.018*nz(v.x*3,v.y*3,v.z*3);tpp.setXYZ(i,v.x*k,v.y*k,v.z*k)}}tg.computeVertexNormals();
    const top=new T.Mesh(tg,bunMat);top.position.y=.98;g.add(top);
    return g},

  /* ---------- CRÊPES & GAUFRES : gaufres de Bruxelles au sucre glace ---------- */
  waffle(){const g=new T.Group();
    const one=()=>{const w=g.userData.w=new T.Group(),W=1.5,D=1.9,TH=.16,RH=.15,cols=4,rows=5,bar=.08;
      const gold=cv(256,256,(x,ww,h)=>{x.fillStyle="#D88E30";x.fillRect(0,0,ww,h);for(let i=0;i<1500;i++){x.fillStyle=Math.random()<.5?"rgba(170,95,25,.3)":"rgba(255,225,160,.35)";x.beginPath();x.arc(rnd(0,ww),rnd(0,h),rnd(.6,2.2),0,7);x.fill()}
        for(let i=0;i<500;i++){x.fillStyle="rgba(255,255,255,.85)";x.fillRect(rnd(0,ww),rnd(0,h),rnd(1,2.5),rnd(1,2.5))}});
      const deep=cv(256,256,(x,ww,h)=>{const gr=x.createRadialGradient(ww/2,h/2,0,ww/2,h/2,ww*.7);gr.addColorStop(0,"#B86A1E");gr.addColorStop(1,"#844510");x.fillStyle=gr;x.fillRect(0,0,ww,h);for(let i=0;i<300;i++){x.fillStyle="rgba(255,255,255,.8)";x.fillRect(rnd(0,ww),rnd(0,h),2,2)}});
      const mGold=new T.MeshPhysicalMaterial({map:gold,roughness:.55,clearcoat:.35,clearcoatRoughness:.45,bumpMap:FROST.normal,bumpScale:.004});
      const mDeep=new T.MeshPhysicalMaterial({map:deep,roughness:.6});
      const base=new T.Mesh(new T.BoxGeometry(W,TH,D),[mGold,mGold,mDeep,mGold,mGold,mGold]);base.position.y=TH/2;w.add(base);
      const rb=(sx,sy,sz,x,z)=>{const b=new T.Mesh(new T.BoxGeometry(sx,sy,sz,2,2,2),mGold),p=b.geometry.attributes.position,v=new T.Vector3();
        for(let i=0;i<p.count;i++){v.fromBufferAttribute(p,i);if(v.y>0){p.setY(i,v.y*.85)}}b.geometry.computeVertexNormals();b.position.set(x,TH+sy/2,z);w.add(b)};
      const cw=(W-bar)/cols,cd=(D-bar)/rows;
      for(let i=0;i<=cols;i++)rb(bar,RH,D,-W/2+bar/2+i*cw,0);
      for(let j=0;j<=rows;j++)rb(W,RH,bar,0,-D/2+bar/2+j*cd);
      // sucre glace en relief
      const sug=new T.InstancedMesh(new T.BoxGeometry(.018,.012,.018),new T.MeshStandardMaterial({color:0xffffff,roughness:.9}),700),o=new T.Object3D();
      for(let i=0;i<700;i++){o.position.set(rnd(-W/2,W/2),TH+RH+.005,rnd(-D/2,D/2));if(Math.random()<.45)o.position.y=TH+.006;o.rotation.y=rnd(0,3);o.scale.setScalar(rnd(.5,1.4));o.updateMatrix();sug.setMatrixAt(i,o.matrix)}
      sug.userData.noShadow=true;w.add(sug);return w};
    const a=one();a.rotation.y=.25;a.position.set(-.35,0,.1);g.add(a);
    const b=one();b.rotation.set(0,-.35,-.3);b.position.set(.55,.42,-.15);g.add(b);
    return g},

  /* ---------- PÂTISSERIES : croissant feuilleté ---------- */
  croissant(){const g=new T.Group();
    const pts=[];for(let i=0;i<=12;i++){const t=i/12*2-1,a=t*1.5;pts.push(new T.Vector3(Math.sin(a)*1.25,0,(1-Math.cos(a))*-.75))}
    const curve=new T.CatmullRomCurve3(pts),TS=220,RS=40,geo=new T.TubeGeometry(curve,TS,1,RS,false),p=geo.attributes.position,v=new T.Vector3(),c=new T.Vector3();
    const col=new Float32Array(p.count*3),cGold=new T.Color("#D9801F"),cDark=new T.Color("#6E2A06"),cCream=new T.Color("#F0BE6A"),tmp=new T.Color();
    for(let i=0;i<=TS;i++){const t=i/TS;curve.getPointAt(t,c);
      const body=.08+.62*Math.pow(Math.sin(Math.PI*t),1.25),band=Math.abs(Math.sin(t*Math.PI*9)),ridge=Math.pow(band,.45);
      const s=body*(1+.16*ridge);
      for(let j=0;j<=RS;j++){const k=i*(RS+1)+j;v.fromBufferAttribute(p,k).sub(c);
        const ang=j/RS*Math.PI*2,fine=.012*Math.sin(ang*14+t*60);
        v.multiplyScalar(s+fine*body*3);v.y*=.74;const P=c.clone().add(v);P.y=Math.max(P.y,-body*.62);p.setXYZ(k,P.x,P.y,P.z);
        tmp.copy(cCream).lerp(cGold,Math.min(1,ridge*1.6)).lerp(cDark,Math.max(0,ridge-.45)*1.5*(v.y>0?1:.4));col.set([tmp.r,tmp.g,tmp.b],k*3)}}
    geo.setAttribute("color",new T.BufferAttribute(col,3));geo.computeVertexNormals();
    const box=new T.Box3().setFromBufferAttribute(p);geo.translate(0,-box.min.y,0);
    const m=new T.Mesh(geo,new T.MeshPhysicalMaterial({vertexColors:true,roughness:.45,clearcoat:.55,clearcoatRoughness:.25,bumpMap:FROST.normal,bumpScale:.003,envMapIntensity:.7}));
    g.add(m);g.rotation.y=Math.PI+.45;return g},
  brand(){ // gobelet du logo Aroma Café, en attendant la fiche de la catégorie
    const g=new T.Group(),h=2.4,rf=y=>.55+.2*y/h;
    const sleeveTex=cv(512,256,(x,w,hh)=>{x.fillStyle="#2A1A12";x.fillRect(0,0,w,hh);x.fillStyle="#F3E7D7";
      for(const cx of [w*.25,w*.75]){x.beginPath();x.ellipse(cx,hh/2,46,62,0,0,7);x.fill();x.strokeStyle="#2A1A12";x.lineWidth=9;x.beginPath();x.moveTo(cx-6,hh/2-56);x.bezierCurveTo(cx+30,hh/2-20,cx-30,hh/2+20,cx+6,hh/2+56);x.stroke()}});
    const pts=[];for(let i=0;i<=20;i++){const y=h*i/20;pts.push(new T.Vector2(rf(y),y))}
    const body=new T.Mesh(new T.LatheGeometry(pts,64),new T.MeshPhysicalMaterial({color:0xF6EEE3,roughness:.4,clearcoat:.3,side:T.DoubleSide}));g.add(body);
    const bot=new T.Mesh(new T.CircleGeometry(rf(0),48),body.material);bot.rotation.x=Math.PI/2;g.add(bot);
    const sp=[];for(let i=0;i<=10;i++){const y=.7+1.0*i/10;sp.push(new T.Vector2(rf(y)+.012,y))}
    g.add(new T.Mesh(new T.LatheGeometry(sp,64),new T.MeshPhysicalMaterial({map:sleeveTex,roughness:.55,side:T.DoubleSide})));
    const lp=[new T.Vector2(rf(h)+.06,h-.02),new T.Vector2(rf(h)+.08,h+.08),new T.Vector2(rf(h)-.02,h+.14)];
    for(let i=0;i<=16;i++){const a=i/16*Math.PI/2;lp.push(new T.Vector2(Math.max(.001,(rf(h)-.04)*Math.cos(a)),h+.14+.42*Math.sin(a)))}
    g.add(new T.Mesh(new T.LatheGeometry(lp,64),new T.MeshPhysicalMaterial({color:0x2A1A12,roughness:.3,clearcoat:.8})));
    const knob=new T.Mesh(new T.SphereGeometry(.09,16,12),new T.MeshPhysicalMaterial({color:0x2A1A12,roughness:.3}));knob.position.y=h+.6;g.add(knob);
    return g}
};
const cache={};
function getModel(k){if(cache[k])return cache[k];const inner=BUILD[k]();
  const skip=[];inner.traverse(o=>{if(o.userData.noBox)skip.push(o)});skip.forEach(o=>o.parent.remove(o));
  const box=new T.Box3().setFromObject(inner);skip.forEach(o=>inner.add(o));const size=box.getSize(new T.Vector3()),c=box.getCenter(new T.Vector3());
  const fitW={croissant:3.4,waffle:3.0}[k]||3.6;const s=Math.min(2.9/size.y,fitW/Math.max(size.x,size.z*.9));inner.scale.setScalar(s);inner.position.set(-c.x*s,-box.min.y*s,-c.z*s);
  inner.traverse(o=>{if(o.isMesh&&!o.userData.noShadow&&!(o.material&&o.material.transparent)){o.castShadow=true}});
  const holder=new T.Group();holder.add(inner);holder.rotation.x={cup:.42,waffle:.24,croissant:.3,burger:.12,iceCream:.12}[k]??.1;holder.userData=inner.userData;holder.userData.inner=inner;holder.userData.h=size.y*s;return cache[k]=holder}

/* ---------- boucle, interaction ---------- */
let active=null,spin=0,vel=0,drag=null,visible=true,t0=performance.now();
const reduce=matchMedia("(prefers-reduced-motion: reduce)").matches;
const camTarget={y:1.38};function aimCam(){camera.position.y=camTarget.y+1.32;camera.lookAt(0,camTarget.y,0)}
function resize(){const r=stage.getBoundingClientRect();renderer.setSize(r.width,r.height,false);camera.aspect=r.width/r.height;
  const z=r.width/r.height<1.05?9.4:7.6;camera.position.set(0,2.7,z);aimCam();camera.updateProjectionMatrix();
  const bh=2*30*Math.tan(T.MathUtils.degToRad(camera.fov/2));backdrop.scale.set(bh*camera.aspect*1.02,bh*1.02,1)}
new ResizeObserver(resize).observe(stage);resize();
canvas.addEventListener("pointerdown",e=>{drag={x:e.clientX,last:e.clientX,t:performance.now()};canvas.setPointerCapture(e.pointerId);$("hint").style.opacity=0});
canvas.addEventListener("pointermove",e=>{if(!drag)return;const dx=e.clientX-drag.last;drag.last=e.clientX;spin+=dx*.012;vel=dx*.012});
const end=()=>{drag=null};canvas.addEventListener("pointerup",end);canvas.addEventListener("pointercancel",end);
new IntersectionObserver(es=>{visible=es[0].isIntersecting}).observe(stage);
const dummy=new T.Object3D();
function tick(now){requestAnimationFrame(tick);if(!visible||document.hidden||glPaused){t0=now;return}
  const dt=Math.min(.05,(now-t0)/1000);t0=now;const t=now/1000;
  if(!drag){vel*=.93;spin+=vel+(reduce?0:dt*.35)}
  if(active){const inner=active.userData.inner;active.rotation.y=spin;inner.position.y=inner.userData.baseY+(reduce?0:Math.sin(t*1.4)*.05);
    shadow.scale.setScalar(1-(reduce?0:Math.sin(t*1.4)*.04));
    const ud=active.userData;
    if(ud.steam)ud.steam.forEach(s=>{const k=((t*.35+s.ph)%3)/3;s.m.position.y=1.75+.5+k*1.1;s.m.material.opacity=Math.sin(k*Math.PI)*.45;s.m.lookAt(camera.position.x,s.m.position.y,camera.position.z)});
    if(ud.bubbles){const b=ud.bubbles;b.data.forEach((p,i)=>{p.y+=p.v*dt;if(p.y>b.h-.2)p.y=.25;dummy.position.set(Math.cos(p.a)*p.r,p.y,Math.sin(p.a)*p.r);dummy.updateMatrix();b.mesh.setMatrixAt(i,dummy.matrix)});b.mesh.instanceMatrix.needsUpdate=true}}
  renderer.render(scene,camera)}
requestAnimationFrame(tick);

showModel=(k,instant)=>{const board=document.body.classList.contains("board");backdrop.visible=!board;renderer.toneMappingExposure=board?.82:1;const next=getModel(k);if(next===active)return;const prev=active;active=next;
  next.userData.inner.userData.baseY=next.userData.inner.userData.baseY??next.userData.inner.position.y;
  if(prev){if(instant||reduce||!window.gsap){scene.remove(prev)}else{gsap.to(prev.scale,{x:.5,y:.5,z:.5,duration:.28,ease:"power2.in",onComplete:()=>{scene.remove(prev);prev.scale.setScalar(1)}})}}
  scene.add(next);
  const ty=Math.min(1.38,next.userData.h*.5+.15);if(window.gsap&&!instant)gsap.to(camTarget,{y:ty,duration:.6,ease:"power2.out",onUpdate:aimCam});else{camTarget.y=ty;aimCam()}
  if(!instant&&!reduce&&window.gsap){next.scale.setScalar(.4);gsap.to(next.scale,{x:1,y:1,z:1,duration:.6,delay:prev?.18:0,ease:"back.out(1.6)"});vel=.18}};
})()}else{$("stage").hidden=true}