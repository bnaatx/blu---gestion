/* Blu Gestión — pedidos, ventas, inventario, catálogo, remodelación y parrilla de contenido.
   Los datos viven en Supabase, en la tabla "registros" (coleccion, id, data), protegidos por usuario. */
"use strict";

/* ---------- Constantes ---------- */
const ESTADOS = ["pendiente", "empacado", "enviado", "entregado"];
const EST_LABEL = { pendiente: "Pedido pendiente", empacado: "Empacado", enviado: "Enviado", entregado: "Entregado", perdido: "Envío perdido" };
const PAGO_LABEL = { pendiente: "Pago pendiente", abono: "Apartado", pagado: "Pagado" };
const pagoDe = p => p.pago || (p.pagado ? "pagado" : "pendiente");
const saldo = p => pagoDe(p) === "pagado" ? 0 : Math.max(0, pedTotal(p) - (pagoDe(p) === "abono" ? (+p.abono || 0) : 0));
/* Un pedido solo es "Pedido pendiente" cuando ya está pagado completo; antes es Apartado (con abono) o Pago pendiente */
const etapa = p => p.estado === "pendiente" && pagoDe(p) !== "pagado" ? (pagoDe(p) === "abono" ? "apartado" : "pagopend") : p.estado;
const ETAPA_LABEL = { apartado: "Apartado", pagopend: "Pago pendiente" };
const ETAPA_CLASE = { apartado: "pg-abono", pagopend: "pg-pendiente" };
const etLabel = k => ETAPA_LABEL[k] || EST_LABEL[k];
const etClase = k => ETAPA_CLASE[k] || "st-" + k;
const CANALES = { whatsapp: "WhatsApp Business", instagram: "Instagram" };
const canalDe = p => p.canal || "whatsapp";
const canalTag = p => `<span class="canal canal-${canalDe(p)}">${canalDe(p) === "instagram" ? "◎ Instagram" : "✆ WhatsApp"}</span>`;
const INV_CATS = ["Mercancía", "Insumos", "Empaques", "Publicidad", "Envíos", "Otros"];
const NEXT_LABEL = { pendiente: "Marcar empacado", empacado: "Marcar enviado", enviado: "Marcar entregado", perdido: "Marcar reenviado" };
const TIPOS = ["Pulsera", "Manilla individual", "Manillas parejas", "Manillas trios", "Cadenita individual", "Cadenitas parejas", "Collar individual", "Collares pareja", "Anillos", "Anillos pareja"];
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const DIAS = ["L", "M", "M", "J", "V", "S", "D"];
const REMO = { pendiente: "Pendiente", remodelado: "Remodelado", remate: "En remate", archivado: "Archivado" };
const SERIES = [
  { id: "remodelacion", nombre: "Remodelación del emprendimiento", sc: "#F1D1F6", si: "#7A3489" },
  { id: "rebranding", nombre: "Rebranding de productos", sc: "#FDDAE1", si: "#B9396F" },
  { id: "nuevo", nombre: "Producto nuevo", sc: "#F7E6BA", si: "#755510" },
  { id: "detalle", nombre: "Vista detallada", sc: "#CFF6F7", si: "#0F6468" },
  { id: "otro", nombre: "Otro", sc: "#FFF5F9", si: "#8C6A7C" },
];
const C_EST = ["idea", "guion", "grabado", "editado", "programado", "publicado"];
const C_EST_LABEL = { idea: "Idea", guion: "Guion listo", grabado: "Grabado", editado: "Editado", programado: "Programado", publicado: "Publicado" };
const PLATAFORMAS = ["TikTok", "Instagram", "TikTok e Instagram", "Facebook"];
const C_TIPOS = ["Video", "Reel", "Carrusel", "Historia", "Foto"];

const cop = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });
const $ = n => cop.format(Math.round(n || 0)).replace(/\s/g, " ");
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const pad = n => String(n).padStart(2, "0");
const isoDate = d => d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
const today = () => isoDate(new Date());
const fmtDate = s => { if (!s) return ""; const [y, m, d] = s.split("-"); return `${+d} ${MESES[+m - 1].slice(0, 3)} ${y}`; };
const buscaEn = s => String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim();
const norm = s => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
const num = v => { let s = String(v ?? "").trim().replace(/[^\d.,]/g, ""); s = s.replace(/[.,]\d{1,2}$/, ""); return Math.max(0, parseInt(s.replace(/[^\d]/g, ""), 10) || 0); };
const miles = n => n ? Number(n).toLocaleString("es-CO") : "";
const serie = id => SERIES.find(s => s.id === id) || SERIES[SERIES.length - 1];
const serStyle = id => { const s = serie(id); return `--sc:${s.sc};--si:${s.si}`; };
const safeUrl = u => /^https?:\/\//i.test(String(u || "").trim()) ? String(u).trim() : "";

/* Fotos de productos: bucket público "fotos" en Supabase Storage, una carpeta por usuario */
const rutaFoto = f => !f ? "" : /^(https?:|data:image\/)/i.test(f) ? f : window.BLU_CONFIG.supabaseUrl + "/storage/v1/object/public/fotos/" + f;
/* Reventa: el producto y su insumo comparten la foto (si uno no tiene, usa la del otro) */
const fotoUrl = p => { if (!p) return ""; if (p.foto) return rutaFoto(p.foto); if (!p.insumos || !S.materia) return ""; const m = insLinks(p).map(l => S.materia.find(x => x.id === l.id)).find(x => x && x.foto && catDe(x) === "Reventa"); return m ? rutaFoto(m.foto) : ""; };
/* Saca el link de un texto compartido (ej. "1 pieza Collar… https://onelink.shein.com/…") */
const extraerUrl = t => { const m = String(t || "").match(/https?:\/\/[^\s"'<>]+/i); return m ? m[0].replace(/[),.;]+$/, "") : String(t || "").trim(); };
const prodDe = codigo => codigo == null ? null : S.productos.find(x => x.codigo === codigo);
const thumb = (p, cls = "") => { const u = fotoUrl(p); return u ? `<img class="thumb ${cls}" src="${esc(u)}" alt="" loading="lazy" decoding="async">` : `<span class="thumb ph ${cls}" aria-hidden="true"></span>`; };
async function comprimirFoto(file) {
  const bmp = await createImageBitmap(file).catch(() => null);
  let w, h, src;
  if (bmp) { w = bmp.width; h = bmp.height; src = bmp; }
  else { src = await new Promise((ok, mal) => { const i = new Image(); i.onload = () => ok(i); i.onerror = mal; i.src = URL.createObjectURL(file); }); w = src.naturalWidth; h = src.naturalHeight; }
  const k = Math.min(1, 900 / Math.max(w, h)), c = document.createElement("canvas");
  c.width = Math.round(w * k); c.height = Math.round(h * k);
  c.getContext("2d").drawImage(src, 0, 0, c.width, c.height);
  return new Promise(ok => c.toBlob(ok, "image/jpeg", 0.82));
}
async function subirFoto(p, file) {
  toast("Subiendo foto…");
  try {
    const blob = await comprimirFoto(file);
    const path = uid + "/" + p.codigo + "-" + Date.now() + ".jpg";
    const { error } = await sb.storage.from("fotos").upload(path, blob, { contentType: "image/jpeg", cacheControl: "31536000", upsert: false });
    if (error) throw error;
    const vieja = p.foto; p.foto = path;
    if (vieja) sb.storage.from("fotos").remove([vieja]).catch(() => {});
    return true;
  } catch (e) {
    console.error(e);
    toast(/bucket/i.test(String(e && e.message)) ? "Falta crear el espacio de fotos en Supabase" : "No se pudo subir la foto. Revisa tu conexión");
    return false;
  }
}

const n0 = v => typeof v === "number" ? v : num(v);
/* Mano de obra por categoría (tomada del Excel de costos de Blu) */
const MO_CAT = { "Pulsera": 4000, "Manilla individual": 6000, "Manillas parejas": 12000, "Manillas trios": 18000, "Cadenita individual": 4000, "Cadenitas parejas": 8000, "Collar individual": 8000, "Collares pareja": 16000, "Anillos": 4000, "Anillos pareja": 4000 };
/* Materia prima por categoría. Dije, pasador, cadena, empaque y otros se compran por unidad (o docena);
   el hilo por metros y la mostacilla por gramos. */
const CAT_INS = {
  "Dije": { u: "unidad", pl: "unidades", c: "c/u", doc: true },
  "Pasador": { u: "unidad", pl: "unidades", c: "c/u", doc: true },
  "Cadena": { u: "unidad", pl: "unidades", c: "c/u", doc: true },
  "Porta dije": { u: "unidad", pl: "unidades", c: "c/u", doc: true },
  "Reventa": { u: "unidad", pl: "unidades", c: "c/u", doc: true },
  "Hilo": { u: "metro", pl: "metros", c: "por metro", doc: false },
  "Nailon": { u: "metro", pl: "metros", c: "por metro", doc: false },
  "Mostacilla": { u: "gramo", pl: "gramos", c: "por gramo", doc: false },
  "Empaque": { u: "unidad", pl: "unidades", c: "c/u", doc: true },
  "Otro": { u: "unidad", pl: "unidades", c: "c/u", doc: true },
};
const CATS = Object.keys(CAT_INS);
const catDe = m => (m && m.categoria) || "";
/* Categorías fijas + las que ella cree (salen de "Otro"), con "Otro" de última */
const catsTodas = () => { const extra = [...new Set(S.materia.map(m => m.categoria).filter(c => c && !CAT_INS[c]))].sort((a, b) => a.localeCompare(b, "es")); return [...CATS.filter(c => c !== "Otro"), ...extra, "Otro"]; };
const POR_GRAMO = { u: "gramo", pl: "gramos", c: "por gramo", doc: true };
/* Si lo compró por gramos y no sabe cuántas trae por gramo, se cuenta en gramos */
const infoCat = m => { const ic = CAT_INS[catDe(m)] || CAT_INS.Otro; return ic.doc && m && m.presentacion === "gramos" && !dec(m.porGramo) ? POR_GRAMO : ic; };
/* números con decimales: "0,5" "1.5" "1.000" */
const dec = v => { const s = String(v ?? "").trim().replace(/\s/g, "").replace(/\.(?=\d{3}(?:\D|$))/g, "").replace(",", "."); const n = parseFloat(s); return isFinite(n) && n > 0 ? n : 0; };
const decTxt = n => n ? String(Math.round(n * 1000) / 1000).replace(".", ",") : "";
const unitario = m => dec(m.cantidad) ? n0(m.precio) / dec(m.cantidad) : 0;
const $u = n => n > 0 && n < 1000 && Math.round(n * 10) !== Math.round(n) * 10 ? "$ " + n.toLocaleString("es-CO", { maximumFractionDigits: 1 }) : $(n);
const insLinks = p => (p.insumos || []).map(x => typeof x === "object" && x ? x : { id: x, usa: 1 });
/* Base predeterminada: si el producto artesanal no tiene su hilo/nailon/cadena escogido, usa el de por defecto */
const BASES = ["Hilo", "Nailon", "Cadena", "Herrajes"];
const baseDefecto = cat => { const ops = S.materia.filter(m => catDe(m) === cat).sort((x, y) => x.id - y.id); return ops.find(m => m.predeterminado) || ops[0] || null; };
/* Tallas de collar (guía de Blu) + 10 cm para amarres */
const TALLAS = [["Estándar", 35], ["Mediana", 41], ["Grande", 46], ["Extra grande", 50]];
const MARGEN_NUDO = 10;
const esCollarT = p => /collar/i.test(p.tipo || "");
const tallaCm = p => (TALLAS.find(([n]) => n === p.talla) || TALLAS[0])[1];
const nailonCollar = p => Math.round((tallaCm(p) + MARGEN_NUDO) / 100 * usaBase(p) * 100) / 100;
const usaDefecto = (cat, p) => cat === "Reventa" || cat === "Empaque" ? 1 : cat === "Herrajes" ? 2 * usaBase(p) + n0(p.balinesExtra) : cat === "Hilo" ? Math.round(1.3 * usaBase(p) * 10) / 10 : cat === "Nailon" && esCollarT(p) ? nailonCollar(p) : usaBase(p);
/* Lo que lleva fijo cada tipo: su base y, en manillas, los balines de los extremos */
const fijasDe = p => { if (esHecho(p)) return []; const b = baseCat(p); return [b, /manilla/i.test(p.tipo || "") ? "Herrajes" : ""].filter(Boolean); };
function linksEf(p) {
  let l = insLinks(p);
  fijasDe(p).forEach(cat => { if (l.some(x => { const m = S.materia.find(y => y.id === x.id); return m && catDe(m) === cat; })) return;
    const d = baseDefecto(cat); if (d) l = l.concat({ id: d.id, usa: usaDefecto(cat, p), defecto: true }); });
  return l;
}
const usaInsumos = p => linksEf(p).some(l => S.materia.some(m => m.id === l.id));
function materialesDe(p) {
  const r = { hilo: 0, dije: 0, mostacillas: 0, compra: 0 };
  linksEf(p).forEach(({ id, usa }) => { const m = S.materia.find(x => x.id === id); if (!m) return;
    const v = unitario(m) * dec(usa), c = catDe(m);
    if (c === "Hilo" || c === "Cadena" || c === "Nailon") r.hilo += v; else if (c === "Dije") r.dije += v; else if (c === "Mostacilla") r.mostacillas += v; else if (c !== "Empaque") r.compra += v; });
  Object.keys(r).forEach(k => r[k] = Math.round(r[k]));
  return r;
}
/* El costo arranca en 0: solo cuentan los materiales escogidos. En reventa sin insumo enlazado cuenta lo que pagó ("Lo compraste a"). */
const tieneReventa = p => insLinks(p).some(l => { const m = S.materia.find(x => x.id === l.id); return m && catDe(m) === "Reventa"; });
const costosDe = p => { const r = usaInsumos(p) ? materialesDe(p) : { hilo: 0, dije: 0, mostacillas: 0, compra: 0 }; if (esHecho(p) && !tieneReventa(p)) r.compra += n0(p.compra); return r; };
/* Empaque fijo: lo mismo para todos los productos. Si el producto tiene su propio empaque enlazado (ej. caja de anillos), ese reemplaza la caja. */
const KIT_DEF = [
  { id: "caja", nombre: "Caja", precio: 1500, rinde: 1, caja: true },
  { id: "vinipel", nombre: "Forro de la caja (papel vinipel)", precio: 20000, rinde: "" },
  { id: "seda", nombre: "Papel seda", precio: "", rinde: 1 },
  { id: "bolsa", nombre: "Bolsa transparente", precio: 65, rinde: 1 },
  { id: "stlogo", nombre: "Sticker del logo (caja)", precio: 80, rinde: 1 },
  { id: "stdatos", nombre: "Papel sticker (datos)", precio: 367, rinde: 1 },
  { id: "tgracias", nombre: "Tarjeta “Gracias por tu compra” (opalina)", precio: 314, rinde: 1 },
  { id: "tnombre", nombre: "Tarjeta con el nombre (opalina)", precio: 314, rinde: 1 },
  { id: "ttips", nombre: "Tarjeta tips de cuidado (opalina)", precio: "", rinde: 1 },
  { id: "imp", nombre: "Impresión de tarjetas", precio: 55, rinde: 1 },
  { id: "papel", nombre: "Papel", precio: 20, rinde: 1 },
  { id: "carton", nombre: "Cartón / cartulina", precio: 100, rinde: 1 }];
const kit = () => { let k = S.ajustes.find(a => a.id === "empaque"); if (!k) { k = { id: "empaque", items: KIT_DEF.map(x => ({ ...x })) }; S.ajustes.push(k); } return k; };
const kitFalta = it => it.precio === "" || it.precio == null || !dec(it.rinde);
const kitCosto = it => kitFalta(it) ? 0 : n0(it.precio) / dec(it.rinde);
function empaqueDe(p) {
  const items = kit().items, propios = insLinks(p).map(l => ({ l, m: S.materia.find(x => x.id === l.id) })).filter(x => x.m && catDe(x.m) === "Empaque").map(({ l, m }) => ({ nombre: m.nombre, costo: unitario(m) * dec(l.usa), propio: true }));
  const cambiaCaja = propios.length > 0;
  const lineas = items.map(it => ({ nombre: it.nombre, costo: cambiaCaja && it.caja ? 0 : kitCosto(it), falta: kitFalta(it), quitada: cambiaCaja && it.caja })).concat(propios);
  return { total: Math.round(lineas.reduce((a, x) => a + x.costo, 0)), lineas, cambiaCaja };
}
const empaqueBox = (p, editable) => { const e = empaqueDe(p); return `<details class="emp-fijo"${window._empA ? " open" : ""} ontoggle="window._empA=this.open"><summary><span>Empaque <span class="muted small">(fijo${e.cambiaCaja ? " + su empaque" : ""})</span></span><b class="num">${$(e.total)}</b></summary>
  <div class="emp-list">${e.lineas.map(x => `<div class="row between${x.quitada ? " tachado" : ""}"><span>${esc(x.nombre)}${x.propio ? ' <span class="tag">de este producto</span>' : ""}${x.quitada ? ' <span class="muted small">(la reemplaza su empaque)</span>' : ""}${x.falta && !x.quitada ? ' <span class="tag loss">falta precio</span>' : ""}</span><span class="num">${$u(x.costo)}</span></div>`).join("")}</div>
  <button class="btn sm ghost" type="button" data-action="ver-kit">Editar empaque fijo</button></details>`; };
function costoProd(p) { const c = costosDe(p); return c.hilo + c.dije + c.mostacillas + c.compra + manoDe(p) + empaqueDe(p).total; }
const remo = p => p.remodelacion || "pendiente";
/* Base del producto: hilo solo en manillas; collares, cadenitas y pulseras van en cadena */
/* Base fija por tipo: manillas → hilo, pulseras y collares → nailon, cadenitas → cadena */
const baseCat = p => { const t = p.tipo || ""; return /manilla/i.test(t) ? "Hilo" : /pulsera|collar/i.test(t) ? "Nailon" : /cadenit/i.test(t) ? "Cadena" : ""; };
const baseLbl = p => baseCat(p) || "Base";
/* Reventa: lo compra ya hecho (ej. collares de SHEIN): no lleva mano de obra */
const esHecho = p => !!p.hecho || insLinks(p).some(l => { const m = S.materia.find(x => x.id === l.id); return m && catDe(m) === "Reventa"; });
/* Collares, cadenitas y pulseras artesanales: cadena + dije + porta dije, escogidos de la materia prima */
const esCollar = p => !esHecho(p);
const usaBase = p => /trio/i.test(p.tipo || "") ? 3 : /pareja/i.test(p.tipo || "") ? 2 : 1;
/* Piezas según el tipo + las categorías que ella crea (Cuentas, Fimo…). Las opcionales sin insumos no se muestran */
const piezasDe = p => {
  if (esHecho(p)) return [["Reventa", "Lo que compraste (Reventa)"], ["Empaque", "Empaque propio (opcional)"]];
  const b = baseCat(p);
  const base = b === "Hilo" ? [["Hilo", "Base: Hilo"], ["Herrajes", "Herrajes (balines de los extremos)"], ["Dije", "Dije (opcional)"], ["Pasador", "Pasador (opcional)"], ["Mostacilla", "Mostacilla (opcional)"]]
    : b === "Nailon" ? [["Nailon", "Base: Nailon"], ["Dije", "Dije (opcional)"], ["Porta dije", "Porta dije (opcional)"], ["Mostacilla", "Mostacilla (opcional)"], ["Pasador", "Pasador (opcional)"]]
    : b === "Cadena" ? [["Cadena", "Base: Cadena"], ["Dije", "Dije"], ["Porta dije", "Porta dije (opcional)"], ["Pasador", "Pasador (opcional)"]]
    : [["Dije", "Dije (opcional)"], ["Pasador", "Pasador (opcional)"]];
  const extra = catsTodas().filter(c => !CAT_INS[c] && !base.some(([x]) => x === c)).map(c => [c, c + " (opcional)"]);
  const hay = c => S.materia.some(m => catDe(m) === c), puesta = c => insLinks(p).some(l => { const m = S.materia.find(x => x.id === l.id); return m && catDe(m) === c; });
  return base.concat(extra).filter(([c, l]) => !/opcional/.test(l) || hay(c) || puesta(c));
};
function drawPiezas() {
  const box = $id("ppPiezas"); if (!box || !editing || window._noPz) return; const p = editing;
  const links = linksEf(p), manual = false;
  const optsDe = (ops, selId, usados) => ops.filter(m => m.id === selId || !usados.includes(m.id)).map(m => `<option value="${m.id}" ${m.id === selId ? "selected" : ""}>${esc(m.nombre)} · ${$u(unitario(m))}</option>`).join("");
  const filaPieza = (cat, sel, ln, ops, usados, vacio) => { const usa = dec(ln.usa);
    return `<div class="row" style="gap:6px"><select class="grow" data-pieza="${cat}" data-old="${sel.id}"><option value="">${vacio}</option>${optsDe(ops, sel.id, usados)}</select><span class="muted small">×</span><input class="usa-in" inputmode="decimal" aria-label="Cuántas usa de ${esc(sel.nombre)}" data-pzusa="${sel.id}" value="${esc(decTxt(usa))}"></div>
      <span class="muted small">${esc(sel.nombre)}: ${unidadTxt(sel, usa)} · <b class="num" id="pzsub_${sel.id}">${$u(unitario(sel) * usa)}</b></span>
      ${esLetras(sel) ? `<div class="palabras">${Array.from({ length: usaBase(p) }, (_, i) => `<input data-palabra="${i}" data-ins="${sel.id}" value="${esc((p.palabras || [])[i] || "")}" placeholder="${usaBase(p) > 1 ? "Palabra manilla " + (i + 1) : "Palabra"}" autocapitalize="characters" aria-label="Palabra ${i + 1}">`).join("")}<span class="muted small" id="pal_n">${p.palabras && p.palabras.some(Boolean) ? contarLetras(p.palabras) + " letras" : "Escribe la palabra y la app cuenta las letras"}</span></div>` : ""}`; };
  box.innerHTML = `<div class="piezas">${piezasDe(p).map(([cat, lbl]) => { const ops = S.materia.filter(m => catDe(m) === cat).sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
    const sels = links.map(l => ({ l, m: S.materia.find(m => m.id === l.id) })).filter(x => x.m && catDe(x.m) === cat), usados = sels.map(x => x.m.id), porDef = sels.some(x => x.l.defecto);
    const opcional = /opcional/.test(lbl), vacio = opcional ? "No lleva" : "Escoge…", id = "pz_" + cat.replace(/ /g, "");
    const libres = ops.filter(m => !usados.includes(m.id));
    return `<div class="field pieza"><label for="${id}">${lbl}${porDef ? ' <span class="tag">por defecto</span>' : ""}</label>
      ${sels.map(x => filaPieza(cat, x.m, x.l, ops, usados, sels.length > 1 ? "Quitar" : vacio)).join("")}
      ${!sels.length ? `<select id="${id}" data-pieza="${cat}" data-old=""><option value="">${vacio}</option>${optsDe(ops, null, [])}</select>`
        : libres.length ? `<select class="otro-sel" id="${id}" data-pieza="${cat}" data-old=""><option value="">+ Agregar otro de ${cat.toLowerCase()}</option>${optsDe(libres, null, [])}</select>` : ""}
      ${!ops.length ? `<span class="muted small">No tienes insumos de ${cat.toLowerCase()} en Materia.</span>` : ""}</div>${cat === "Herrajes" && /manilla/i.test(p.tipo || "") ? `<div class="row between" style="gap:8px;margin-top:-4px"><span class="small">Balines extra <span class="muted">(además de los ${2 * usaBase(p)} de los extremos)</span></span><div class="stepper"><button class="icon-btn" type="button" data-action="pp-extra" data-d="-1" aria-label="Quitar un balín extra">−</button><b>${n0(p.balinesExtra)}</b><button class="icon-btn" type="button" data-action="pp-extra" data-d="1" aria-label="Agregar un balín extra">+</button></div></div>` : ""}${cat === "Nailon" && esCollarT(p) ? `<div class="field"><span class="lbl">Talla del collar</span><div class="chips">${TALLAS.map(([n, cm]) => `<button class="chip" type="button" data-action="pp-talla" data-v="${n}" aria-pressed="${(p.talla || "Estándar") === n}">${n} · ${cm} cm</button>`).join("")}</div><span class="muted small">Usa ${tallaCm(p)} cm + ${MARGEN_NUDO} cm para amarres${usaBase(p) > 1 ? " × " + usaBase(p) : ""} = ${decTxt(nailonCollar(p))} m de nailon</span></div>` : ""}`; }).join("")}</div>
    ${manual ? `<p class="muted small" style="margin:0">Mientras no escojas, se usan los valores que tenía: ${n0(p.hilo) ? baseLbl(p).toLowerCase() + " " + $(p.hilo) : ""}${n0(p.hilo) && n0(p.dije) ? ", " : ""}${n0(p.dije) ? "dije " + $(p.dije) : ""}${n0(p.mostacillas) ? ", mostacillas " + $(p.mostacillas) : ""}${n0(p.compra) ? (n0(p.hilo) || n0(p.dije) ? ", " : "") + "otros " + $(p.compra) : ""}.</p>` : ""}`;
}
/* Letras: escribe la palabra de cada manilla y la app cuenta cuántas letras usa */
const esLetras = m => /letra/i.test(m.nombre || "");
const contarLetras = ws => (ws || []).join("").replace(/[^\p{L}\p{N}]/gu, "").length;
/* Materia prima en casa: cuánto le queda de cada insumo y si alcanza para armar un producto agotado */
const tieneCasa = m => m && m.enCasa !== undefined && m.enCasa !== null && m.enCasa !== "";
const casaTxt = m => decTxt(Math.round(dec(m.enCasa) * 100) / 100) + " " + (dec(m.enCasa) === 1 ? infoCat(m).u : infoCat(m).pl);
function puedeHacer(p, n = 1) {
  const ls = linksEf(p).map(l => ({ l, m: S.materia.find(x => x.id === l.id) })).filter(x => x.m);
  if (!ls.length) return null;
  const faltan = ls.filter(x => tieneCasa(x.m) && dec(x.m.enCasa) < dec(x.l.usa) * n).map(x => x.m.nombre);
  const sinDato = ls.filter(x => !tieneCasa(x.m)).map(x => x.m.nombre);
  return { ok: !faltan.length && !sinDato.length, faltan, sinDato };
}
function gastarMateria(p, n) { if (n <= 0) return;
  linksEf(p).forEach(l => { const m = S.materia.find(x => x.id === l.id); if (!tieneCasa(m)) return; m.enCasa = Math.max(0, Math.round((dec(m.enCasa) - dec(l.usa) * n) * 100) / 100); guardar("materia", m); }); }
const tagHacer = p => { const r = puedeHacer(p); if (!r) return ""; if (r.ok) return '<span class="tag ok">Se puede hacer</span>'; if (r.faltan.length) return `<span class="tag loss">Falta ${esc(r.faltan.slice(0, 2).join(", "))}${r.faltan.length > 2 ? "…" : ""}</span>`; return ""; };
const manoDe = p => esHecho(p) ? 0 : n0(p.manoObra);
const activos = () => S.productos.filter(p => remo(p) !== "archivado");

const pedSub = p => p.lineas.reduce((a, l) => a + n0(l.cantidad) * n0(l.precio), 0);
/* Envío: "contado" = viene en la factura y el cliente lo paga con el pedido; "contraentrega" = lo paga al recibir y no entra en el total */
const modoEnvio = p => p.envioModo || (p.envioPaga === "yo" ? "blu" : "contado");
const pedTotal = p => pedSub(p) + (modoEnvio(p) === "contado" ? (+p.envio || 0) : 0);
/* Tarifas de Interrapidísimo que maneja Blu, por zona de destino */
const ZONAS_ENVIO = [
  { nombre: "Bogotá y alrededores", valor: 8800, ciudades: ["bogota", "bogota dc", "bogota d c", "soacha", "sibate", "mosquera", "funza", "madrid", "facatativa", "bojaca", "el rosal", "subachoque", "tenjo", "tabio", "cota", "chia", "cajica", "zipaquira", "cogua", "nemocon", "tocancipa", "gachancipa", "sopo", "la calera", "guasca", "sesquile", "guatavita", "usme", "suba", "bosa", "kennedy", "engativa", "fontibon", "usaquen", "ciudad bolivar"] },
  { nombre: "Ciudades intermedias", valor: 12000, ciudades: ["villavicencio", "acacias", "granada", "puerto lopez", "restrepo", "cumaral", "fusagasuga", "girardot", "la mesa", "villeta", "ubate", "choconta", "silvania", "anapoima", "apulo", "tocaima", "agua de dios", "ricaurte", "nilo", "guaduas", "pacho", "gacheta", "medina", "tunja", "duitama", "sogamoso", "chiquinquira", "paipa", "villa de leyva", "moniquira", "garagoa", "puerto boyaca", "ibague", "espinal", "melgar", "honda", "mariquita", "chaparral", "flandes", "guamo", "neiva", "pitalito", "garzon", "la plata", "campoalegre", "yopal", "aguazul", "villanueva", "paz de ariporo"] },
  { nombre: "Ciudades principales", valor: 18500, ciudades: ["medellin", "envigado", "itagui", "bello", "sabaneta", "la estrella", "caldas", "copacabana", "girardota", "rionegro", "marinilla", "la ceja", "guarne", "cali", "palmira", "jamundi", "yumbo", "candelaria", "tulua", "buga", "cartago", "zarzal", "sevilla", "barranquilla", "soledad", "malambo", "puerto colombia", "cartagena", "turbaco", "santa marta", "cienaga", "bucaramanga", "floridablanca", "giron", "piedecuesta", "barrancabermeja", "san gil", "socorro", "cucuta", "villa del rosario", "los patios", "ocana", "pamplona", "pereira", "dosquebradas", "santa rosa de cabal", "manizales", "chinchina", "villamaria", "la dorada", "armenia", "calarca", "montenegro", "quimbaya", "la tebaida", "pasto", "ipiales", "popayan", "santander de quilichao", "monteria", "cerete", "lorica", "sahagun", "sincelejo", "corozal", "valledupar", "aguachica", "riohacha", "maicao", "florencia", "apartado", "turbo", "caucasia", "magangue", "buenaventura", "tumaco"] },
];
const ENVIO_LEJANO = { nombre: "Municipio lejano", valor: 20900 };
function envioPorCiudad(ciudad) {
  const c = norm(ciudad).replace(/[.,]/g, " ").replace(/\s+/g, " ").trim(); if (!c) return null;
  const z = ZONAS_ENVIO.find(z => z.ciudades.includes(c)) || ZONAS_ENVIO.find(z => z.ciudades.some(x => c.startsWith(x + " ") || c.endsWith(" " + x)));
  return z ? { valor: z.valor, zona: z.nombre, seguro: true } : { valor: ENVIO_LEJANO.valor, zona: ENVIO_LEJANO.nombre, seguro: false };
}
const pedCosto = p => p.lineas.reduce((a, l) => a + n0(l.cantidad) * n0(l.costo), 0);
const pedGan = p => pedSub(p) - pedCosto(p) - (p.envioPaga === "yo" ? (+p.envio || 0) : 0);
const unidades = p => p.lineas.reduce((a, l) => a + l.cantidad, 0);

/* ---------- Supabase ---------- */
const sb = window.supabase.createClient(window.BLU_CONFIG.supabaseUrl, window.BLU_CONFIG.supabaseKey, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
});
let uid = null, email = "";
let S = { productos: [], materia: [], pedidos: [], contenido: [], inversiones: [], proveedores: [], ajustes: [] };
let estado = "cargando"; // cargando | listo | error
const COLS = ["productos", "materia", "pedidos", "contenido", "inversiones", "proveedores", "ajustes"];
const ID_OF = { productos: p => String(p.codigo), materia: m => String(m.id), pedidos: p => p.id, contenido: c => c.id, inversiones: i => i.id, proveedores: v => String(v.id), ajustes: a => a.id };

async function cargar() {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from("registros").select("coleccion,id,data").range(from, from + 999);
    if (error) throw error;
    rows.push(...data);
    if (data.length < 1000) break;
  }
  const n = { productos: [], materia: [], pedidos: [], contenido: [], inversiones: [], proveedores: [], ajustes: [] };
  rows.forEach(r => { if (n[r.coleccion]) n[r.coleccion].push(r.data); });
  n.productos.sort((a, b) => a.codigo - b.codigo);
  n.materia.sort((a, b) => a.id - b.id);
  n.pedidos.sort((a, b) => a.n - b.n);
  S = n;
}

const colas = {};
let pendientes = 0;
function escribir(key, op) {
  pendientes++;
  colas[key] = (colas[key] || Promise.resolve()).then(op).then(r => { if (r && r.error) throw r.error; })
    .catch(e => { console.error(e); toast("No se guardó un cambio. Revisa tu conexión e inténtalo de nuevo"); })
    .finally(() => { pendientes--; });
  return colas[key];
}
function guardar(col, obj) {
  const id = ID_OF[col](obj), data = JSON.parse(JSON.stringify(obj, (k, v) => k === "_t" ? undefined : v));
  return escribir(col + "/" + id, () => sb.from("registros").upsert({ user_id: uid, coleccion: col, id, data, actualizado: new Date().toISOString() }));
}
function borrar(col, id) {
  return escribir(col + "/" + id, () => sb.from("registros").delete().eq("coleccion", col).eq("id", String(id)));
}
const nextN = () => S.pedidos.reduce((a, p) => Math.max(a, p.n || 0), 0) + 1;

/* ---------- Sesión ---------- */
const $id = id => document.getElementById(id);
async function iniciar(session) {
  if (!session) { $id("shell").hidden = true; $id("login").hidden = false; return; }
  uid = session.user.id; email = session.user.email || "";
  $id("login").hidden = true; $id("shell").hidden = false;
  estado = "cargando"; render();
  try { await cargar(); estado = "listo"; } catch (e) { console.error(e); estado = "error"; }
  render();
}
$id("loginForm").addEventListener("submit", async e => {
  e.preventDefault();
  const err = $id("loginErr"), btn = $id("loginBtn");
  err.hidden = true; btn.disabled = true; btn.textContent = "Entrando…";
  const { data, error } = await sb.auth.signInWithPassword({ email: $id("l_email").value.trim(), password: $id("l_pass").value });
  btn.disabled = false; btn.textContent = "Entrar";
  if (error) { err.hidden = false; err.textContent = /invalid/i.test(error.message) ? "El correo o la contraseña no coinciden." : "No se pudo entrar. Revisa tu conexión e inténtalo de nuevo."; return; }
  iniciar(data.session);
});
let ultimaCarga = Date.now();
document.addEventListener("visibilitychange", async () => {
  if (document.visibilityState !== "visible" || !uid || pendientes || sheetRoot.innerHTML || Date.now() - ultimaCarga < 30000) return;
  ultimaCarga = Date.now();
  try { await cargar(); render(); } catch (e) { /* sin conexión: se queda lo que hay */ }
});

/* ---------- Navegación ---------- */
let tab = "inicio";
const now = new Date();
let ui = { matSeg: "insumos", matQ: "", matCat: null, pedFiltro: "activos", ventasMes: "", ventasSeg: "ventas", ventasEst: "", invMes: "", stockQ: "", stockTipo: "", catSeg: "productos", catQ: "", remFiltro: "pendiente",
  cVista: "calendario", cMes: now.getFullYear() + "-" + pad(now.getMonth() + 1), cDia: "", cSerie: "" };
const TITLES = { inicio: "Inicio", pedidos: "Pedidos", ventas: "Ventas", stock: "Inventario", catalogo: "Catálogo", materia: "Materia prima", contenido: "Contenido" };
function go(t) { tab = t; render(); window.scrollTo(0, 0); }

function render() {
  $id("viewTitle").textContent = TITLES[tab];
  document.querySelectorAll("nav.tabs button").forEach(b => b.setAttribute("aria-current", b.dataset.tab === tab ? "page" : "false"));
  const fab = $id("fab");
  fab.hidden = estado !== "listo" || !["inicio", "pedidos", "contenido", "stock"].includes(tab);
  fab.classList.toggle("fab-round", tab === "stock");
  fab.textContent = tab === "stock" ? "+" : tab === "contenido" ? "+ Nuevo contenido" : "+ Nuevo pedido";
  fab.setAttribute("aria-label", tab === "stock" ? "Registrar producto nuevo" : fab.textContent);
  fab.dataset.action = tab === "stock" ? "new-prod" : tab === "contenido" ? "new-content" : "new-order";
  if (estado !== "listo") {
    $id("app").innerHTML = estado === "cargando"
      ? `<div class="empty"><div class="iso"></div><b>Cargando tus datos…</b></div>`
      : `<div class="empty"><div class="iso"></div><b>No se pudieron cargar tus datos</b><span class="small">Revisa tu conexión.</span><button class="btn" type="button" data-action="reintentar">Intentar de nuevo</button></div>`;
    return;
  }
  $id("app").innerHTML = { inicio: vInicio, pedidos: vPedidos, ventas: vVentas, stock: vStock, catalogo: vCatalogo, materia: vMateria, contenido: vContenido }[tab]();
}

/* ---------- Inicio ---------- */
function vInicio() {
  const d = new Date(), ym = d.getFullYear() + "-" + pad(d.getMonth() + 1);
  const vacio = !S.productos.length && !S.pedidos.length && !S.materia.length;
  const cuenta = e => S.pedidos.filter(p => etapa(p) === e && (e !== "entregado" || p.fecha.startsWith(ym))).length;
  const mes = S.pedidos.filter(p => p.estado === "entregado" && p.fecha.startsWith(ym));
  const vendido = mes.reduce((a, p) => a + pedSub(p), 0), costo = mes.reduce((a, p) => a + pedCosto(p), 0), gan = mes.reduce((a, p) => a + pedGan(p), 0);
  const act = activos(), uno = act.filter(p => p.stock === 1), agot = act.filter(p => p.stock <= 0);
  const hoy = today(), semana = isoDate(new Date(Date.now() + 7 * 864e5));
  const prox = S.contenido.filter(c => c.estado !== "publicado" && c.fechaPublicacion && c.fechaPublicacion >= hoy && c.fechaPublicacion <= semana)
    .sort((a, b) => (a.fechaPublicacion + (a.hora || "")).localeCompare(b.fechaPublicacion + (b.hora || "")));
  const importar = `<section class="card acct">
      <h3>${vacio ? "Pasa tus datos a la app" : "Importar respaldo"}</h3>
      <p class="muted small" style="margin:0">${vacio ? "Tu cuenta está vacía. Sube el archivo de respaldo (.json) que te pasé para cargar productos, stock, materia prima y ventas." : "Sube un archivo de respaldo (.json). Reemplaza los registros que tengan el mismo código y agrega los nuevos."}</p>
      <label class="btn ${vacio ? "" : "ghost"} filebtn">Subir respaldo<input type="file" id="fileImport" accept=".json,application/json"></label>
    </section>`;
  return `${vacio ? importar : ""}
  <section class="states" aria-label="Pedidos por estado">
    ${ESTADOS.map(e => `<button type="button" class="state st-${e}" data-action="filtro-ped" data-v="${e}"><b>${cuenta(e)}</b><span>${EST_LABEL[e]}${e === "entregado" ? "<br>este mes" : ""}</span></button>`).join("")}
  </section>
  ${(() => {
    const ap = S.pedidos.filter(p => pagoDe(p) === "abono" && p.estado !== "perdido"), pp = S.pedidos.filter(p => pagoDe(p) === "pendiente" && p.estado !== "perdido");
    const deben = arr => arr.reduce((s, p) => s + saldo(p), 0);
    return `<section class="pagos" aria-label="Pagos por cobrar">
      <button type="button" class="pago-tile pg-abono" data-action="ir-ventas" data-v="apartado"><b>${ap.length}</b><span>Apartados</span><em>Deben ${$(deben(ap))}</em></button>
      <button type="button" class="pago-tile pg-pendiente" data-action="ir-ventas" data-v="pagopend"><b>${pp.length}</b><span>Pago pendiente</span><em>Deben ${$(deben(pp))}</em></button>
    </section>`; })()}
  <section class="hero">
    <span class="sub">Ganancia de ${MESES[d.getMonth()]}</span>
    <span class="big">${$(gan)}</span>
    <span class="sub">${mes.length ? `${mes.length} pedido${mes.length > 1 ? "s" : ""} entregado${mes.length > 1 ? "s" : ""} este mes` : "Todavía no hay pedidos entregados este mes"}</span>
    ${(() => { const inv = S.inversiones.filter(i => i.fecha.startsWith(ym)).reduce((s, i) => s + (+i.valor || 0), 0); return inv ? `<span class="sub">Invertido este mes: <b>${$(inv)}</b></span>` : ""; })()}
    <div class="split"><div>Vendido<b>${$(vendido)}</b></div><div>Costo<b>${$(costo)}</b></div><div>Margen<b>${vendido ? Math.round(gan / vendido * 100) : 0}%</b></div></div>
  </section>
  <section class="card" style="display:flex;flex-direction:column;gap:10px">
    <div class="row between"><h3>Para publicar esta semana</h3><button class="btn sm ghost" data-action="tab" data-v="contenido" type="button">Ver parrilla</button></div>
    ${prox.length ? `<div class="list">${prox.slice(0, 5).map(c => `<div class="row between tappable" data-action="edit-content" data-id="${c.id}" role="button" tabindex="0">
        <div class="grow"><div style="font-weight:500">${esc(c.titulo || "Sin título")}</div><div class="muted small">${fmtDate(c.fechaPublicacion)}${c.hora ? " · " + esc(c.hora) : ""} · ${esc(c.plataforma || "")}</div></div>
        <span class="pill cst-${c.estado}">${C_EST_LABEL[c.estado]}</span></div>`).join("")}</div>`
      : `<p class="muted small" style="margin:0">No tienes contenido programado para los próximos 7 días.</p>`}
  </section>
  <section class="card" style="display:flex;flex-direction:column;gap:10px">
    <div class="row between"><h3>Stock bajo</h3><button class="btn sm ghost" data-action="tab" data-v="stock" type="button">Ver inventario</button></div>
    <div class="row wrap" style="gap:8px"><span class="tag ok">${uno.length} con 1 unidad</span><span class="tag">${agot.length} agotados</span></div>
    <div class="chips">${uno.slice(0, 14).map(p => `<span class="chip" style="cursor:default">${esc(p.nombre)} <span class="muted small">· ${esc(p.tipo)}</span></span>`).join("")}</div>
  </section>
  <section class="card acct">
    <h3>Descargar</h3>
    <p class="muted small" style="margin:0">El Excel trae pedidos, ventas, inventario, costos, materia prima y la parrilla. El respaldo sirve para restaurar la app si algo pasa.</p>
    <div class="row wrap" style="gap:8px"><button class="btn grow" type="button" data-action="excel">Descargar Excel</button><button class="btn ghost grow" type="button" data-action="respaldo">Descargar respaldo</button></div>
  </section>
  ${vacio ? "" : importar}
  <section class="card acct">
    <h3>Cuenta</h3>
    <p class="muted small" style="margin:0">${esc(email)}</p>
    <button class="btn ghost" type="button" data-action="ayuda-rec">Configurar recordatorios de Apple</button>
    <button class="btn ghost" type="button" data-action="actualizar">Buscar actualización</button>
    <button class="btn ghost" type="button" data-action="logout">Cerrar sesión</button>
    <p class="muted small" style="margin:0">Versión ${esc(window.BLU_VERSION || "")}</p>
  </section>`;
}

/* ---------- Pedidos ---------- */
function orderCard(p, opts = {}) {
  const i = ESTADOS.indexOf(p.estado);
  return `<article class="card order oc-${etapa(p)}">
    <div class="row between" style="align-items:flex-start">
      <div class="grow"><div class="who">${esc(p.cliente)}</div><div class="muted small">#${p.n} · ${fmtDate(p.fecha)} · ${esc(p.ciudad)}</div></div>
      <span class="pill ${etClase(etapa(p))}">${etLabel(etapa(p))}</span>
    </div>
    ${opts.track && p.estado !== "perdido" ? `<div class="track" aria-hidden="true">${ESTADOS.map((e, k) => `<i class="${k <= i ? "on" : ""}"></i>`).join("")}</div>` : ""}
    <div class="items">${p.lineas.map(l => `<div class="it"><div class="it-main">${thumb(prodDe(l.codigo), "sm")}<span class="qty">${l.cantidad}</span><div class="grow"><b>${esc(l.nombre)}</b><div class="muted small">${esc(l.tipo)}${l.cantidad > 1 ? " · " + $(l.precio) + " c/u" : ""}${l.nota ? " · " + esc(l.nota) : ""}</div>${l.tarjeta ? '<span class="tag card-tag">💌 Tarjeta personalizada</span>' : ""}</div></div><span class="num">${$(l.cantidad * l.precio)}</span></div>`).join("")}
      ${p.envio || modoEnvio(p) === "contraentrega" ? `<div class="muted"><span>Envío ${modoEnvio(p) === "contraentrega" ? "contraentrega · lo paga al recibir" : modoEnvio(p) === "blu" ? "· lo pagó Blu" : "contado"}</span><span class="num">${p.envio ? $(p.envio) : "—"}</span></div>` : ""}</div>
    <div class="row between wrap">
      <div class="row wrap" style="gap:6px">${pagoDe(p) !== "pagado" && p.estado !== "pendiente" ? `<span class="pill pg-${pagoDe(p)}">${PAGO_LABEL[pagoDe(p)]}</span>` : ""}${p.precioTipo === "mayor" ? '<span class="pill wa-mayorista">Cliente mayorista</span>' : ""}${canalTag(p)}${p.importado ? '<span class="tag">Del Excel</span>' : ""}</div>
      <div style="text-align:right"><span class="money">${$(pedTotal(p))}</span>${saldo(p) && saldo(p) < pedTotal(p) ? `<div class="small muted">Abonó ${$(p.abono)} · debe ${$(saldo(p))}</div>` : saldo(p) ? `<div class="small" style="color:var(--loss)">Debe ${$(saldo(p))}</div>` : ""}</div>
    </div>
    ${opts.actions ? `<div class="row" style="gap:8px">
      ${etapa(p) === "apartado" || etapa(p) === "pagopend"
        ? `<button class="btn grow" type="button" data-action="pago-completo" data-id="${p.id}">Ya pagó todo</button>`
        : `<button class="btn grow" type="button" data-action="avanzar" data-id="${p.id}">${NEXT_LABEL[p.estado]}</button>`}
      ${["pendiente", "empacado"].includes(etapa(p)) ? `<button class="btn ghost" type="button" data-action="rec-ped" data-id="${p.id}" aria-label="Crear recordatorio">⏰</button>` : ""}
      <button class="btn ghost" type="button" data-action="ver" data-id="${p.id}">Detalle</button></div>` : ""}
    ${opts.detalle ? `<button class="btn ghost sm" type="button" data-action="ver" data-id="${p.id}" style="align-self:flex-start">Detalle</button>` : ""}
  </article>`;
}
function vPedidos() {
  const f = ui.pedFiltro;
  const act = S.pedidos.filter(p => p.estado !== "entregado");
  const lista = (f === "activos" ? act : act.filter(p => etapa(p) === f)).slice().sort((a, b) => b.n - a.n);
  const filtros = [["activos", "Todos (" + act.length + ")"], ...["apartado", "pagopend", "pendiente", "empacado", "enviado", "perdido"].map(e => [e, etLabel(e) + " (" + act.filter(p => etapa(p) === e).length + ")"]).filter(([k, l]) => k !== "perdido" || !l.endsWith("(0)"))];
  return `<div class="scroller">${filtros.map(([k, l]) => `<button class="chip wa-chip ${k === "activos" ? "" : etClase(k)}" type="button" data-action="filtro-ped" data-v="${k}" aria-pressed="${f === k}">${l}</button>`).join("")}</div>
  <div class="list">${lista.length ? lista.map(p => orderCard(p, { track: true, actions: true })).join("") :
    `<div class="empty"><div class="iso"></div><b>No hay pedidos aquí</b><span class="small">Toca “Nuevo pedido” para registrar uno. Cuando lo marques como entregado pasa a Ventas.</span></div>`}</div>`;
}

/* ---------- Ventas ---------- */
const mlabel = ym => { const [y, m] = ym.split("-"); return MESES[+m - 1][0].toUpperCase() + MESES[+m - 1].slice(1) + " " + y; };
const V_FILTROS = [["", "Todas"], ["pendiente", "Pedido pendiente"], ["apartado", "Apartado"], ["pagopend", "Pago pendiente"], ["empacado", "Empacado"], ["enviado", "Enviado"], ["entregado", "Entregado"], ["mayorista", "Cliente mayorista"], ["perdido", "Envío perdido"], ["whatsapp", "WhatsApp"], ["instagram", "Instagram"]];
const V_CLASE = { pendiente: "st-pendiente", apartado: "pg-abono", pagopend: "pg-pendiente", empacado: "st-empacado", enviado: "st-enviado", entregado: "st-entregado", mayorista: "wa-mayorista", perdido: "st-perdido" };
function cumple(p, f) {
  if (!f) return true;
  if (f === "apartado") return pagoDe(p) === "abono";
  if (f === "pagopend") return pagoDe(p) === "pendiente";
  if (f === "mayorista") return p.precioTipo === "mayor";
  if (f === "whatsapp" || f === "instagram") return canalDe(p) === f;
  return etapa(p) === f;
}
function vVentas() {
  const seg = `<div class="seg" role="group" aria-label="Ventas"><button type="button" data-action="v-seg" data-v="ventas" aria-pressed="${ui.ventasSeg === "ventas"}">Ventas</button><button type="button" data-action="v-seg" data-v="invertido" aria-pressed="${ui.ventasSeg === "invertido"}">Invertido</button></div>`;
  if (ui.ventasSeg === "invertido") return seg + vInvertido();
  const todas = S.pedidos.slice().sort((a, b) => b.fecha.localeCompare(a.fecha) || b.n - a.n);
  const meses = [...new Set(todas.map(p => p.fecha.slice(0, 7)))].sort().reverse();
  if (ui.ventasMes && !meses.includes(ui.ventasMes)) ui.ventasMes = "";
  const delPeriodo = ui.ventasMes ? todas.filter(p => p.fecha.startsWith(ui.ventasMes)) : todas;
  const lista = delPeriodo.filter(p => cumple(p, ui.ventasEst));
  const validas = lista.filter(p => p.estado !== "perdido");
  const tot = validas.reduce((a, p) => a + pedSub(p), 0), gan = validas.reduce((a, p) => a + pedGan(p), 0), u = validas.reduce((a, p) => a + unidades(p), 0);
  const porCobrar = lista.reduce((a, p) => a + saldo(p), 0);
  return `${seg}<div class="field"><label for="mesSel">Periodo</label>
    <select id="mesSel" data-change="mes"><option value="">Todo el historial</option>${meses.map(m => `<option value="${m}" ${m === ui.ventasMes ? "selected" : ""}>${mlabel(m)}</option>`).join("")}</select></div>
  <div class="scroller">${V_FILTROS.map(([k, l]) => { const n = delPeriodo.filter(p => cumple(p, k)).length; return `<button class="chip wa-chip ${k ? V_CLASE[k] : ""}" type="button" data-action="v-est" data-v="${k}" aria-pressed="${ui.ventasEst === k}">${l} <b>${n}</b></button>`; }).join("")}</div>
  <section class="hero"><span class="sub">Vendido</span><span class="big">${$(tot)}</span>
    <div class="split"><div>Pedidos<b>${validas.length}</b></div><div>Unidades<b>${u}</b></div><div>Ganancia<b>${$(gan)}</b></div></div>
    ${porCobrar ? `<span class="sub" style="margin-top:8px">Por cobrar: <b>${$(porCobrar)}</b></span>` : ""}
    ${(() => { const w = validas.filter(p => canalDe(p) === "whatsapp"), ig = validas.filter(p => canalDe(p) === "instagram"); return validas.length ? `<span class="sub">WhatsApp: <b>${w.length}</b> (${$(w.reduce((s, p) => s + pedSub(p), 0))}) · Instagram: <b>${ig.length}</b> (${$(ig.reduce((s, p) => s + pedSub(p), 0))})</span>` : ""; })()}</section>
  <div class="list">${lista.length ? lista.map(p => orderCard(p, { detalle: true })).join("") : `<div class="empty"><div class="iso"></div><b>No hay ventas con este filtro</b></div>`}</div>`;
}

/* ---------- Invertido ---------- */
function vInvertido() {
  const todas = S.inversiones.slice().sort((a, b) => b.fecha.localeCompare(a.fecha));
  const meses = [...new Set([...todas.map(i => i.fecha.slice(0, 7)), ...S.pedidos.map(p => p.fecha.slice(0, 7))])].sort().reverse();
  if (ui.invMes && !meses.includes(ui.invMes)) ui.invMes = "";
  const lista = ui.invMes ? todas.filter(i => i.fecha.startsWith(ui.invMes)) : todas;
  const invertido = lista.reduce((a, i) => a + (+i.valor || 0), 0);
  const ventas = S.pedidos.filter(p => p.estado !== "perdido" && (!ui.invMes || p.fecha.startsWith(ui.invMes)));
  const vendido = ventas.reduce((a, p) => a + pedSub(p), 0);
  const cobrado = ventas.reduce((a, p) => a + pedTotal(p) - saldo(p), 0);
  const bal = vendido - invertido;
  const porCat = INV_CATS.map(c => [c, lista.filter(i => (i.categoria || "Otros") === c).reduce((a, i) => a + (+i.valor || 0), 0)]).filter(([, v]) => v);
  return `<div class="row"><div class="field grow"><label for="invMes">Periodo</label>
    <select id="invMes" data-change="invmes"><option value="">Todo el historial</option>${meses.map(m => `<option value="${m}" ${m === ui.invMes ? "selected" : ""}>${mlabel(m)}</option>`).join("")}</select></div>
    <button class="btn" type="button" data-action="new-inv" style="align-self:flex-end">+ Compra</button></div>
  <section class="hero"><span class="sub">Invertido</span><span class="big">${$(invertido)}</span>
    <div class="split"><div>Vendido<b>${$(vendido)}</b></div><div>Cobrado<b>${$(cobrado)}</b></div><div>${bal >= 0 ? "Recuperado" : "Falta recuperar"}<b>${$(Math.abs(bal))}</b></div></div></section>
  ${porCat.length ? `<section class="card" style="display:flex;flex-direction:column;gap:8px"><h3>En qué se fue</h3>${porCat.map(([c, v]) => `<div class="row between"><span>${c}</span><b class="num">${$(v)}</b></div><div class="progress" aria-hidden="true"><i style="width:${Math.round(v / invertido * 100)}%"></i></div>`).join("")}</section>` : ""}
  <div class="list">${lista.length ? lista.map(i => `<article class="card ccard" data-action="edit-inv" data-id="${i.id}" role="button" tabindex="0">
      <div class="row between" style="align-items:flex-start"><div class="t grow">${esc(i.descripcion || "Compra")}</div><b class="money">${$(i.valor)}</b></div>
      <div class="meta">${fmtDate(i.fecha)} · ${esc(i.categoria || "Otros")}${i.lugar ? " · " + esc(i.lugar) : ""}</div>
      ${i.detalle ? `<div class="small" style="white-space:pre-line">${esc(i.detalle)}</div>` : ""}</article>`).join("")
    : `<div class="empty"><div class="iso"></div><b>Todavía no registras compras</b><span class="small">Toca “+ Compra” para anotar lo que inviertes en mercancía, insumos o empaques.</span></div>`}</div>`;
}
let editingInv = null;
function editInv(id) {
  const nuevo = id == null;
  const i = nuevo ? { id: "i" + Date.now(), fecha: today(), descripcion: "", categoria: "Mercancía", lugar: "", valor: 0, detalle: "" } : { ...S.inversiones.find(x => x.id === id) };
  openSheet(nuevo ? "Registrar compra" : "Editar compra", `
    <div class="field"><label for="iv_desc">Qué compraste</label><input id="iv_desc" data-iv="descripcion" value="${esc(i.descripcion)}" placeholder="Ej: Pedido SHEIN de dijes y cadenas"></div>
    <div class="grid2"><div class="field"><label for="iv_fecha">Fecha</label><input id="iv_fecha" type="date" data-iv="fecha" value="${esc(i.fecha)}"></div>
      <div class="field"><label for="iv_valor">Valor total</label><input id="iv_valor" inputmode="numeric" data-iv="valor" value="${miles(i.valor)}" placeholder="0" class="money-in"></div></div>
    <div class="grid2"><div class="field"><label for="iv_cat">Categoría</label><select id="iv_cat" data-iv="categoria">${INV_CATS.map(c => `<option ${c === i.categoria ? "selected" : ""}>${c}</option>`).join("")}</select></div>
      <div class="field"><label for="iv_lugar">Dónde</label><input id="iv_lugar" data-iv="lugar" value="${esc(i.lugar)}" placeholder="SHEIN, Santorini…"></div></div>
    <div class="field"><label for="iv_det">Detalle (opcional)</label><textarea id="iv_det" data-iv="detalle" rows="3" placeholder="Qué incluía la compra">${esc(i.detalle)}</textarea></div>
    <button class="btn block" type="button" data-action="save-inv">Guardar</button>
    ${nuevo ? "" : `<div id="delIBox"><button class="btn block danger" type="button" data-action="del-inv-ask">Eliminar compra</button></div>`}`, () => { editingInv = i; });
}

/* ---------- Inventario ---------- */
/* Familias para filtrar el inventario */
const FAMILIAS = [["Manillas", /manilla/i], ["Pulseras", /pulsera/i], ["Cadenitas", /cadenit/i], ["Collares", /collar/i], ["Anillos", /anillo/i]];
const famDe = p => (FAMILIAS.find(([, r]) => r.test(p.tipo || "")) || ["Otros"])[0];
function vStock() {
  const q = buscaEn(ui.stockQ);
  const lista = activos().filter(p => (!ui.stockTipo || famDe(p) === ui.stockTipo))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
  const unid = activos().reduce((a, p) => a + Math.max(0, p.stock), 0);
  return `<input class="search" id="stockQ" data-input="stockQ" placeholder="Buscar producto" value="${esc(ui.stockQ)}" aria-label="Buscar producto">
  <div class="chips mat-chips"><button class="chip" type="button" data-action="stock-tipo" data-v="" aria-pressed="${!ui.stockTipo}">Todos (${activos().length})</button>${FAMILIAS.map(([f]) => [f, activos().filter(p => famDe(p) === f).length]).concat([["Otros", activos().filter(p => famDe(p) === "Otros").length]]).filter(([, n]) => n).map(([f, n]) => `<button class="chip" type="button" data-action="stock-tipo" data-v="${f}" aria-pressed="${ui.stockTipo === f}">${f} (${n})</button>`).join("")}</div>
  <p class="muted small" style="margin:0">${unid} unidades en stock · <span id="cuentaQ">${lista.filter(p => !q || buscaEn(p.nombre + " " + p.tipo).includes(q)).length}</span> productos</p>
  <section class="card" style="padding-block:4px">${lista.map(p => `<div class="prow tappable" data-action="ver-prod" data-c="${p.codigo}" role="button" tabindex="0" data-s="${esc(buscaEn(p.nombre + " " + p.tipo))}"${q && !buscaEn(p.nombre + " " + p.tipo).includes(q) ? " hidden" : ""}>
    ${thumb(p)}<div class="grow"><div class="name">${esc(p.nombre)}</div><div class="muted small">${esc(p.tipo)}${p.stock <= 0 ? " · Agotado" : ""}</div>${p.stock <= 0 ? tagHacer(p) : ""}${enRemate(p) ? `<span class="tag remate">Remate ${$(p.precioRemate)}</span>` : ""}</div>
    <div class="stepper"><button class="icon-btn" type="button" data-action="stock" data-c="${p.codigo}" data-d="-1" aria-label="Restar uno a ${esc(p.nombre)}">−</button>
    <b class="${p.stock <= 0 ? "zero" : ""}">${p.stock}</b>
    <button class="icon-btn" type="button" data-action="stock" data-c="${p.codigo}" data-d="1" aria-label="Sumar uno a ${esc(p.nombre)}">+</button></div></div>`).join("") || '<div class="empty">No hay productos con ese filtro</div>'}</section>`;
}

/* ---------- Catálogo: productos, materia prima, remodelación ---------- */
function vCatalogo() {
  if (ui.catSeg === "materia") ui.catSeg = "productos";
  const seg = ui.catSeg, q = buscaEn(ui.catQ);
  let body;
  if (seg === "productos") {
    const lista = activos().slice().sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
    const perd = activos().filter(p => p.mayor - costoProd(p) < 0).length;
    body = `${perd ? `<div class="warn">${perd} producto${perd > 1 ? "s" : ""} te dan pérdida al por mayor. Están marcados en rojo.</div>` : ""}
    <section class="card" style="padding-block:4px">${lista.map(p => { const c = costoProd(p), gm = p.mayor - c; return `<div class="prow tappable" data-action="ver-prod" data-c="${p.codigo}" role="button" tabindex="0" data-s="${esc(buscaEn(p.nombre + " " + p.tipo))}"${q && !buscaEn(p.nombre + " " + p.tipo).includes(q) ? " hidden" : ""}>
      ${thumb(p)}<div class="grow"><div class="name">${esc(p.nombre)}</div><div class="muted small">${esc(p.tipo)} · #${p.codigo}</div>
      ${enRemate(p) ? `<span class="tag remate">Remate ${$(p.precioRemate)}</span>` : ""}${gm < 0 ? `<span class="tag loss">Pérdida al por mayor ${$(gm)}</span>` : ""}${!p.menor ? `<span class="tag loss">Sin precio</span>` : ""}</div>
      <div class="prices"><span>Costo</span><span>Mayor</span><span>Detal</span><b>${$(c)}</b><b>${$(p.mayor)}</b><b>${$(p.menor)}</b></div></div>`; }).join("") || '<div class="empty">Sin resultados</div>'}</section>`;
  } else {
    const todos = S.productos, arch = todos.filter(p => remo(p) === "archivado").length, base = todos.filter(p => remo(p) === "pendiente" || remo(p) === "remodelado").length;
    const hechos = todos.filter(p => remo(p) === "remodelado").length;
    const lista = todos.filter(p => remo(p) === ui.remFiltro).sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
    const cnt = k => todos.filter(p => remo(p) === k).length;
    body = `<section class="card" style="display:flex;flex-direction:column;gap:8px">
      <div class="row between"><b>${hechos} de ${base} remodelados</b><span class="muted small">${arch} archivados</span></div>
      <div class="progress" aria-hidden="true"><i style="width:${base ? Math.round(hechos / base * 100) : 0}%"></i></div></section>
    <div class="scroller">${Object.keys(REMO).map(k => `<button class="chip" type="button" data-action="rem-filtro" data-v="${k}" aria-pressed="${ui.remFiltro === k}">${REMO[k]} (${cnt(k)})</button>`).join("")}</div>
    ${ui.remFiltro === "remate" ? vSugeridosRemate() : ""}
    ${ui.remFiltro === "archivado" ? `<p class="note" style="margin:0">Los archivados no salen en inventario, catálogo ni pedidos nuevos. Sus ventas viejas se conservan. Puedes recuperarlos cuando quieras.</p>` : ""}
    <section class="card" style="padding-block:2px">${lista.map(p => { const r = remo(p), v = S.contenido.filter(c => c.productoCodigo === p.codigo).length; return `<div class="rmrow" data-s="${esc(buscaEn(p.nombre + " " + p.tipo))}"${q && !buscaEn(p.nombre + " " + p.tipo).includes(q) ? " hidden" : ""}>
      <div class="row between" style="align-items:flex-start">${thumb(p, "lg")}<div class="grow"><div class="name">${esc(p.nombre)}</div><div class="muted small">${esc(p.tipo)} · #${p.codigo}${v ? ` · ${v} video${v > 1 ? "s" : ""}` : ""}</div></div>
      ${r !== "archivado" ? `<button class="btn sm ghost" type="button" data-action="video-prod" data-c="${p.codigo}">Crear video</button>` : ""}</div>
      <div class="rm-st" role="group" aria-label="Estado de ${esc(p.nombre)}">
        <button type="button" data-action="remo" data-c="${p.codigo}" data-v="pendiente" aria-pressed="${r === "pendiente"}">Pendiente</button>
        <button type="button" data-action="remo" data-c="${p.codigo}" data-v="remodelado" aria-pressed="${r === "remodelado"}">Remodelado</button>
        <button type="button" class="rem" data-action="remo" data-c="${p.codigo}" data-v="remate" aria-pressed="${r === "remate"}">Remate</button>
        <button type="button" class="arch" data-action="remo" data-c="${p.codigo}" data-v="archivado" aria-pressed="${r === "archivado"}">${r === "archivado" ? "Archivado" : "Archivar"}</button>
      </div>${r === "remate" ? `<div class="row between small" style="gap:8px"><span>Antes ${$(p.menor)} → <b>remate ${$(p.precioRemate)}</b> · ${p.stock} ${p.stock === 1 ? "unidad" : "unidades"}</span><button class="btn sm ghost" type="button" data-action="remate-precio" data-c="${p.codigo}">Cambiar precio</button></div>` : ""}</div>`; }).join("") || '<div class="empty">No hay productos en este estado</div>'}</section>`;
  }
  return `<div class="seg" role="group" aria-label="Catálogo">
    <button type="button" data-action="seg" data-v="productos" aria-pressed="${seg === "productos"}">Productos</button>
    <button type="button" data-action="seg" data-v="remodelacion" aria-pressed="${seg === "remodelacion"}">Remodelación</button></div>
  <div class="row"><input class="search grow" id="catQ" data-input="catQ" placeholder="Buscar" value="${esc(ui.catQ)}" aria-label="Buscar en catálogo">
  ${seg !== "remodelacion" ? `<button class="btn" type="button" data-action="new-prod">+ Nuevo</button>` : ""}</div>${body}`;
}

/* ---------- Materia prima: insumos y proveedores ---------- */
const provDe = m => S.proveedores.find(v => v.id === m.proveedorId);
const igUrl = v => { const h = String(v || "").trim().replace(/^@/, ""); if (!h) return ""; if (/^https?:\/\//i.test(h)) return safeUrl(h); return "https://instagram.com/" + h.replace(/^(www\.)?instagram\.com\//i, "").replace(/[\/?#].*$/, ""); };
const igHandle = v => { const u = igUrl(v); return u ? "@" + u.replace(/[?#].*$/, "").replace(/\/+$/, "").split("/").pop() : ""; };
const provNombre = m => (provDe(m) || {}).nombre || m.lugar || "";
const logoUrl = v => v && v.logo ? rutaFoto(v.logo) : "";
const logo = (v, cls = "") => { const u = logoUrl(v); return u ? `<img class="logo-prov ${cls}" src="${esc(u)}" alt="" loading="lazy">` : `<span class="logo-prov ph ${cls}" aria-hidden="true">${esc((v && v.nombre || "?").trim().charAt(0).toUpperCase())}</span>`; };

/* Foto de cada insumo: se trae sola del link de compra (función og-image en Supabase) o se sube a mano */
const insFoto = m => { if (!m) return ""; if (m.foto) return rutaFoto(m.foto); if (catDe(m) !== "Reventa") return ""; const p = S.productos.find(x => x.foto && insLinks(x).some(l => l.id === m.id)); return p ? rutaFoto(p.foto) : ""; };
const insThumb = (m, cls = "") => { const u = insFoto(m); return u ? `<img class="thumb ${cls}" src="${esc(u)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="this.outerHTML='<span class=&quot;thumb ph ${cls}&quot;></span>'">` : `<span class="thumb ph ${cls}" aria-hidden="true"></span>`; };
async function fotoDeLink(link) {
  const u = safeUrl(link); if (!u) return "";
  try { const { data, error } = await sb.functions.invoke("og-image", { body: { url: u } }); if (error) throw error; return (data && data.img) || ""; }
  catch (e) { console.error(e); return null; }
}
let traendoFotos = false;
async function traerFotos() {
  if (traendoFotos) return;
  const pend = S.materia.filter(m => safeUrl(m.link) && !m.foto && m.fotoIntento !== m.link); if (!pend.length) return;
  traendoFotos = true; let ok = 0;
  for (const m of pend) { const img = await fotoDeLink(m.link); if (img === null) continue; m.fotoIntento = m.link; if (img) { m.foto = img; ok++; } guardar("materia", m); }
  traendoFotos = false;
  if (ok) { toast(ok + (ok > 1 ? " fotos traídas" : " foto traída") + " de los links"); if (tab === "materia" && !$id("matForm")) render(); }
}
async function subirFotoIns(m, file) {
  toast("Subiendo foto…");
  try {
    const blob = await comprimirFoto(file), path = uid + "/ins-" + m.id + "-" + Date.now() + ".jpg";
    const { error } = await sb.storage.from("fotos").upload(path, blob, { contentType: "image/jpeg", cacheControl: "31536000", upsert: false });
    if (error) throw error;
    const vieja = m.foto; m.foto = path; if (vieja && !/^https?:/i.test(vieja)) sb.storage.from("fotos").remove([vieja]).catch(() => {});
    return true;
  } catch (e) { console.error(e); toast("No se pudo subir la foto. Revisa tu conexión"); return false; }
}
const prodDeIns = m => S.productos.find(p => insLinks(p).some(l => l.id === m.id));
const fotoInsBox = m => `${insThumb(m, "lg")}<div class="row wrap" style="gap:8px">${safeUrl(m.link) ? `<button class="btn sm" type="button" data-action="mm-traer">${m.foto ? "Volver a traer del link" : "Traer foto del link"}</button>` : ""}<label class="btn sm ghost filebtn">${m.foto ? "Cambiar" : "Subir foto"}<input type="file" id="mmFotoIn" accept="image/*"></label>${m.foto ? `<button class="btn sm ghost" type="button" data-action="mm-quitar-foto">Quitar</button>` : ""}<span class="muted small solo-compu" style="flex-basis:100%">o pega un pantallazo con ⌘V, o arrastra la imagen aquí</span></div>`;
function provPorLink(link) {
  const l = buscaEn(lugarDeLink(link)); if (!l) return null;
  return S.proveedores.find(v => { const n = buscaEn(v.nombre); return n && (n.includes(l) || l.includes(n.split(" ").pop())); }) || null;
}
function vMateria() {
  const seg = ui.matSeg, q = buscaEn(ui.matQ);
  const tabs = `<div class="seg" role="group" aria-label="Materia prima"><button type="button" data-action="mat-seg" data-v="insumos" aria-pressed="${seg === "insumos"}">Insumos</button><button type="button" data-action="mat-seg" data-v="proveedores" aria-pressed="${seg === "proveedores"}">Proveedores</button><button type="button" data-action="mat-seg" data-v="empaque" aria-pressed="${seg === "empaque"}">Empaque fijo</button></div>`;
  if (seg === "empaque") { const items = kit().items, tot = Math.round(items.reduce((a, it) => a + kitCosto(it), 0)), faltan = items.filter(kitFalta).length;
    return `${tabs}<section class="card emp-hero"><span class="muted small">Empaque de cada pedido</span><b>${$(tot)}</b><span class="muted small">Se suma igual a todos los productos. Si un producto tiene su propio empaque enlazado (como la caja de anillos), ese reemplaza la caja.</span></section>
    ${faltan ? `<div class="warn">${faltan === 1 ? "Falta el precio de 1 cosa" : "Faltan los precios de " + faltan + " cosas"}. Tócalas para completarlas.</div>` : ""}
    <section class="card" style="padding-block:4px">${items.map(it => `<div class="prow tappable" data-action="kit-edit" data-id="${esc(it.id)}" role="button" tabindex="0"><div class="grow"><div class="name">${esc(it.nombre)}${it.caja ? ' <span class="tag">caja</span>' : ""}</div><div class="muted small">${kitFalta(it) ? `<span class="tag loss">${it.precio === "" || it.precio == null ? "Falta precio" : "Falta: ¿para cuántos alcanza?"}</span>` : dec(it.rinde) > 1 ? `${$(it.precio)} ÷ ${decTxt(dec(it.rinde))} empaques` : "Por empaque"}${provDe(it) ? ` · ${logo(provDe(it), "xs")} ${esc(provDe(it).nombre)}` : ""}</div></div><b class="num">${$u(kitCosto(it))}</b>${waProv(provDe(it)) ? `<a class="buy" href="${esc(waProv(provDe(it)))}" target="_blank" rel="noopener">Pedir</a>` : ""}</div>`).join("")}</section>
    <button class="btn block line" type="button" data-action="kit-edit">+ Agregar al empaque</button>`; }
  if (seg === "proveedores") {
    const lista = S.proveedores.slice().sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
    return `${tabs}<div class="row"><input class="search grow" id="matQ" data-input="matQ" placeholder="Buscar proveedor" value="${esc(ui.matQ)}" aria-label="Buscar proveedor"><button class="btn" type="button" data-action="new-prov">+ Proveedor</button></div>
    <div class="prov-grid">${lista.map(v => { const n = S.materia.filter(m => m.proveedorId === v.id).length + kit().items.filter(it => +it.proveedorId === v.id).length, s = buscaEn(v.nombre + " " + (v.instagram || ""));
      return `<button type="button" class="prov-card" data-action="ver-prov" data-id="${v.id}" data-s="${esc(s)}"${q && !s.includes(q) ? " hidden" : ""}>${logo(v, "lg")}<b>${esc(v.nombre)}</b><span class="muted small" title="${esc(igHandle(v.instagram))}">${esc(igHandle(v.instagram))}</span><span class="tag">${n} insumo${n === 1 ? "" : "s"}</span></button>`; }).join("")
      || `<div class="empty" style="grid-column:1/-1"><div class="iso"></div><b>Aún no tienes proveedores</b><span class="small">Toca “+ Proveedor” para agregar el primero.</span></div>`}</div>`;
  }
  /* Hilo, Nailon y Cadena van juntos como "Bases" */
  const BASE3 = ["Hilo", "Nailon", "Cadena"], ordenar = l => l.sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
  const todosG = [["Bases", ordenar(S.materia.filter(m => BASE3.includes(catDe(m))))], ...[...catsTodas(), ""].filter(c => !BASE3.includes(c)).map(c => [c, ordenar(S.materia.filter(m => catDe(m) === c))])].filter(([, l]) => l.length);
  if (ui.matCat != null && !todosG.some(([c]) => c === ui.matCat)) ui.matCat = null;
  /* Reventa se agrupa con las mismas categorías del catálogo (tipo del producto) */
  const grupos = (ui.matCat == null ? todosG : todosG.filter(([c]) => c === ui.matCat)).flatMap(([c, l]) => { if (c === "Bases") return BASE3.map(b => ["Bases · " + b, l.filter(m => catDe(m) === b)]).filter(([, x]) => x.length); if (c !== "Reventa") return [[c, l]];
    const por = {}; l.forEach(m => { const p = prodDeIns(m), k = p ? p.tipo || "Sin tipo" : "Sin producto enlazado"; (por[k] = por[k] || []).push(m); });
    const orden = TIPOS.filter(t => por[t]).concat(Object.keys(por).filter(k => !TIPOS.includes(k)));
    return orden.map(k => ["Reventa · " + k, por[k]]); });
  const chips = `<div class="chips mat-chips"><button class="chip" type="button" data-action="mat-cat" data-v="*" aria-pressed="${ui.matCat == null}">Todos</button>${todosG.map(([c, l]) => `<button class="chip" type="button" data-action="mat-cat" data-v="${esc(c)}" aria-pressed="${ui.matCat === c}">${c || "Sin categoría"} (${l.length})</button>`).join("")}</div>`;
  const fila = m => { const url = safeUrl(m.link), ic = infoCat(m), cant = dec(m.cantidadIngresada) || dec(m.cantidad), pres = m.presentacion === "docenas" ? (cant === 1 ? "docena" : "docenas") : m.presentacion === "tiras" ? (cant === 1 ? "tira" : "tiras") + " de " + decTxt(dec(m.porTira)) : m.presentacion === "gramos" ? (cant === 1 ? "gramo" : "gramos") : (cant === 1 ? ic.u : ic.pl), s = buscaEn(m.nombre + " " + provNombre(m) + " " + catDe(m));
    return `<div class="prow tappable" data-action="edit-mat" data-id="${m.id}" role="button" tabindex="0" data-s="${esc(s)}"${q && !s.includes(q) ? " hidden" : ""}>
    ${insThumb(m)}<div class="grow"><div class="name">${esc(m.nombre)}</div><div class="muted small">${logo(provDe(m) || { nombre: provNombre(m) }, "xs")} ${esc(provNombre(m))} · ${decTxt(cant)} ${pres} por ${$(m.precio)} · <b class="num">${$u(unitario(m))}</b> ${ic.c}</div>${tieneCasa(m) ? `<span class="tag ${dec(m.enCasa) > 0 ? "" : "loss"}">En casa: ${casaTxt(m)}</span>` : ""}${(m.colores || []).length ? ` <span class="tag">${m.colores.length} colores</span>` : ""}</div>
    ${url ? `<a class="buy" href="${esc(url)}" target="_blank" rel="noopener">Comprar</a>` : ""}</div>`; };
  setTimeout(traerFotos, 400);
  return `${tabs}<div class="row"><input class="search grow" id="matQ" data-input="matQ" placeholder="Buscar insumo o proveedor" value="${esc(ui.matQ)}" aria-label="Buscar insumo"><button class="btn" type="button" data-action="new-mat">+ Insumo</button></div>
  ${chips}
  ${grupos.length ? grupos.map(([c, l]) => `<h3 style="margin-top:4px">${c || "Sin categoría"} <span class="muted">(${l.length})</span></h3>
    ${c ? "" : `<p class="muted small" style="margin:0">Toca cada uno para asignarle su categoría.</p>`}${c === "Reventa · Sin producto enlazado" ? `<p class="muted small" style="margin:0">Ábrelos y escoge qué producto del catálogo son.</p>` : ""}
    <section class="card" style="padding-block:4px">${l.map(fila).join("")}</section>`).join("") : '<div class="empty">Todavía no tienes materia prima</div>'}`;
}

let editingKit = null;
function editKit(id) {
  const k = kit(), it = id ? { ...k.items.find(x => x.id === id) } : { id: "k" + Date.now(), nombre: "", precio: "", rinde: 1 };
  editingKit = it;
  openSheet(id ? "Empaque fijo" : "Agregar al empaque", `
    <div class="field"><label for="kt_nombre">Qué es</label><input id="kt_nombre" data-kit="nombre" value="${esc(it.nombre)}" placeholder="Ej: Papel seda"></div>
    <div class="grid2"><div class="field"><label for="kt_precio">Lo compraste a</label><input id="kt_precio" inputmode="numeric" class="money-in" data-kit="precio" value="${it.precio === "" || it.precio == null ? "" : miles(it.precio)}" placeholder="$"></div>
    <div class="field"><label for="kt_rinde">Te alcanza para</label><input id="kt_rinde" inputmode="decimal" data-kit="rinde" value="${esc(decTxt(dec(it.rinde)))}" placeholder="Ej: 40"></div></div>
    ${selectProv(it.proveedorId, "kit").replace('<option value="otro" >Otro…</option>', "").replace('<option value="otro" selected>Otro…</option>', "")}
    <p class="muted small" style="margin:-6px 0 0">Si el precio es por unidad, deja 1. Si compraste un paquete o un rollo, pon para cuántos empaques te alcanza.${it.nota ? " " + esc(it.nota) + "." : ""} Si no lo usas, pon 0 en el precio.</p>
    <label class="row" style="gap:8px"><input type="checkbox" data-kit="caja" ${it.caja ? "checked" : ""}> <span>Es la caja (se reemplaza cuando el producto tiene su propio empaque)</span></label>
    <div class="totals"><div class="t"><span>Te sale por empaque</span><span id="ktCosto">${$u(kitCosto(it))}</span></div></div>
    <button class="btn block" type="button" data-action="kit-save">Guardar</button>
    ${id ? `<button class="btn block ghost" type="button" data-action="kit-del">Quitar del empaque</button>` : ""}`);
}
let editingProv = null;
const waProv = v => { if (!v) return ""; const cel = String(v.celular || "").replace(/[^\d]/g, ""); return cel ? "https://wa.me/" + (cel.length === 10 ? "57" + cel : cel) : ""; };
function verProv(id) {
  const v = S.proveedores.find(x => x.id === id); if (!v) return;
  const ins = S.materia.filter(m => m.proveedorId === v.id).sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
  const cel = String(v.celular || "").replace(/[^\d]/g, ""), wa = cel ? "https://wa.me/" + (cel.length === 10 ? "57" + cel : cel) : "";
  const web = safeUrl(v.web), ig = igUrl(v.instagram), mapa = v.direccion ? "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(v.direccion) : "";
  openSheet(v.nombre, `
    <div class="row" style="gap:14px">${logo(v, "xl")}<div class="grow"><b style="font-size:18px">${esc(v.nombre)}</b><div class="muted">${esc(igHandle(v.instagram))}</div></div></div>
    <section class="card" style="display:flex;flex-direction:column;gap:10px">
      ${cel ? `<div class="row between" style="gap:8px"><div><span class="muted small">Celular</span><br><b class="num" style="user-select:all">${esc(v.celular)}</b></div><div class="row" style="gap:6px"><a class="buy" href="${wa}" target="_blank" rel="noopener">WhatsApp</a><button class="btn sm ghost" type="button" data-action="copiar" data-v="${esc(v.celular)}">Copiar</button></div></div>` : ""}
      ${v.direccion ? `<div class="row between" style="gap:8px"><div class="grow"><span class="muted small">Dirección</span><br>${esc(v.direccion)}</div><a class="buy" href="${esc(mapa)}" target="_blank" rel="noopener">Mapa</a></div>` : ""}
      ${web ? `<div class="row between" style="gap:8px"><div class="grow" style="min-width:0"><span class="muted small">Página web</span><br><span style="overflow-wrap:anywhere">${esc(web)}</span></div><a class="buy" href="${esc(web)}" target="_blank" rel="noopener">Abrir</a></div>` : ""}
      ${ig ? `<div class="row between" style="gap:8px"><div class="grow" style="min-width:0"><span class="muted small">Instagram</span><br>${esc(igHandle(v.instagram))}</div><a class="buy" href="${esc(ig)}" target="_blank" rel="noopener">Abrir</a></div>` : ""}
      ${!cel && !v.direccion && !web && !ig ? `<p class="muted small" style="margin:0">Sin datos de contacto todavía.</p>` : ""}
    </section>
    ${(() => { const kk = kit().items.filter(it => +it.proveedorId === v.id); return kk.length ? `<h3>Empaque fijo que le compras (${kk.length})</h3><section class="card" style="padding-block:4px">${kk.map(it => `<div class="prow"><div class="grow"><div class="name">${esc(it.nombre)}</div><div class="muted small">${dec(it.rinde) > 1 ? `${$(it.precio)} por ${decTxt(dec(it.rinde))}` : "Por unidad"}</div></div><b class="num">${$u(kitCosto(it))} c/u</b></div>`).join("")}</section>` : ""; })()}
    <h3>Insumos que le compras (${ins.length})</h3>
    ${ins.length ? `<section class="card" style="padding-block:4px">${ins.map(m => { const u = safeUrl(m.link); return `<div class="prow"><div class="grow"><div class="name">${esc(m.nombre)}</div><div class="muted small">${catDe(m) || "Sin categoría"} · <b class="num">${$u(unitario(m))}</b> ${infoCat(m).c}</div></div>${u ? `<a class="buy" href="${esc(u)}" target="_blank" rel="noopener">Comprar</a>` : ""}</div>`; }).join("")}</section>` : `<p class="muted small" style="margin:0">Todavía no hay insumos de este proveedor.</p>`}
    <button class="btn block" type="button" data-action="edit-prov" data-id="${v.id}">Editar proveedor</button>`);
}
function editProv(id) {
  const nuevo = id == null;
  const v = nuevo ? { id: Math.max(0, ...S.proveedores.map(x => x.id)) + 1, nombre: "", celular: "", direccion: "", instagram: "", web: "", logo: "" } : { ...S.proveedores.find(x => x.id === id) };
  openSheet(nuevo ? "Nuevo proveedor" : "Editar proveedor", `
    <div class="row" style="gap:14px;align-items:center" id="provLogo"></div>
    <div class="field"><label for="pv_nombre">Nombre</label><input id="pv_nombre" data-pv="nombre" value="${esc(v.nombre)}" placeholder="Ej: Bisutería Whims"></div>
    <div class="field"><label for="pv_cel">Celular de contacto</label><input id="pv_cel" type="tel" data-pv="celular" value="${esc(v.celular)}"></div>
    <div class="field"><label for="pv_dir">Dirección</label><input id="pv_dir" data-pv="direccion" value="${esc(v.direccion)}"></div>
    <div class="field"><label for="pv_ig">Instagram</label><input id="pv_ig" data-pv="instagram" value="${esc(v.instagram || "")}" placeholder="@usuario" autocapitalize="off"></div>
    <div class="field"><label for="pv_web">Página web</label><input id="pv_web" type="url" data-pv="web" value="${esc(v.web)}" placeholder="https://"></div>
    <button class="btn block" type="button" data-action="save-prov">Guardar proveedor</button>`, () => { editingProv = v; drawProvLogo(); });
}
function drawProvLogo() {
  const el = $id("provLogo"); if (!el || !editingProv) return;
  el.innerHTML = `${logo(editingProv, "xl")}<div class="row wrap" style="gap:8px"><label class="btn sm ${logoUrl(editingProv) ? "ghost" : ""} filebtn">${logoUrl(editingProv) ? "Cambiar logo" : "Agregar logo"}<input type="file" id="pvLogoIn" accept="image/*"></label>${logoUrl(editingProv) ? `<button class="btn sm ghost" type="button" data-action="quitar-logo">Quitar</button>` : ""}<span class="muted small solo-compu" style="flex-basis:100%">o pega un pantallazo con ⌘V, o arrastra la imagen aquí</span></div>`;
}
async function subirLogo(v, file) {
  toast("Subiendo logo…");
  try {
    const blob = await comprimirFoto(file), path = uid + "/prov-" + v.id + "-" + Date.now() + ".jpg";
    const { error } = await sb.storage.from("fotos").upload(path, blob, { contentType: "image/jpeg", cacheControl: "31536000", upsert: false });
    if (error) throw error;
    const vieja = v.logo; v.logo = path; if (vieja) sb.storage.from("fotos").remove([vieja]).catch(() => {});
    return true;
  } catch (e) { console.error(e); toast("No se pudo subir el logo. Revisa tu conexión"); return false; }
}
/* selector de proveedor en los formularios de insumo */
const selectProv = (sel, pre) => `<div class="field"><label for="${pre}_prov">Proveedor</label><select id="${pre}_prov" data-${pre}="proveedorId"><option value="">Escoge…</option>${S.proveedores.slice().sort((a, b) => a.nombre.localeCompare(b.nombre, "es")).map(v => `<option value="${v.id}" ${+sel === v.id ? "selected" : ""}>${esc(v.nombre)}</option>`).join("")}<option value="otro" ${sel === "otro" ? "selected" : ""}>Otro…</option></select></div>`;

/* ---------- Contenido ---------- */
function cCard(c) {
  const s = serie(c.serie);
  return `<article class="card ccard" data-action="edit-content" data-id="${c.id}" role="button" tabindex="0">
    <div class="row between" style="align-items:flex-start"><div class="t grow">${esc(c.titulo || "Sin título")}</div><span class="pill cst-${c.estado}">${C_EST_LABEL[c.estado]}</span></div>
    <div class="row wrap" style="gap:6px"><span class="ser" style="${serStyle(c.serie)}">${esc(s.nombre)}${c.capitulo ? " · Cap. " + c.capitulo : ""}</span></div>
    <div class="meta">${c.fechaPublicacion ? fmtDate(c.fechaPublicacion) + (c.hora ? " · " + esc(c.hora) : "") : "Sin fecha de publicación"}${c.plataforma ? " · " + esc(c.plataforma) : ""}${c.tipo ? " · " + esc(c.tipo) : ""}</div>
  </article>`;
}
function vContenido() {
  const vista = ui.cVista;
  const seg = `<div class="seg" role="group" aria-label="Vista"><button type="button" data-action="c-vista" data-v="calendario" aria-pressed="${vista === "calendario"}">Calendario</button><button type="button" data-action="c-vista" data-v="series" aria-pressed="${vista === "series"}">Por serie</button></div>`;
  const legend = `<div class="legend">${SERIES.slice(0, 4).map(s => `<span class="ser" style="${serStyle(s.id)}">${esc(s.nombre)}</span>`).join("")}</div>`;
  if (vista === "series") {
    const filtro = ui.cSerie;
    const grupos = SERIES.filter(s => !filtro || s.id === filtro).map(s => {
      const items = S.contenido.filter(c => (c.serie || "otro") === s.id).sort((a, b) => (a.capitulo || 999) - (b.capitulo || 999) || (a.fechaPublicacion || "9").localeCompare(b.fechaPublicacion || "9"));
      if (!items.length && filtro !== s.id) return "";
      const pub = items.filter(c => c.estado === "publicado").length;
      return `<section style="display:flex;flex-direction:column;gap:10px"><div class="row between"><span class="ser" style="${serStyle(s.id)}">${esc(s.nombre)}</span><span class="muted small">${pub} de ${items.length} publicados</span></div>
        <div class="list">${items.map(cCard).join("") || '<div class="empty small">Todavía no hay capítulos</div>'}</div></section>`;
    }).join("");
    return `${seg}<div class="scroller"><button class="chip" type="button" data-action="c-serie" data-v="" aria-pressed="${!filtro}">Todas</button>${SERIES.map(s => `<button class="chip" type="button" data-action="c-serie" data-v="${s.id}" aria-pressed="${filtro === s.id}">${esc(s.nombre)}</button>`).join("")}</div>
      ${grupos || `<div class="empty"><div class="iso"></div><b>Aún no hay contenido</b><span class="small">Toca “Nuevo contenido” para planear el primer video.</span></div>`}`;
  }
  const [y, m] = ui.cMes.split("-").map(Number);
  const first = new Date(y, m - 1, 1), dias = new Date(y, m, 0).getDate(), offset = (first.getDay() + 6) % 7;
  const delMes = S.contenido.filter(c => (c.fechaPublicacion || "").startsWith(ui.cMes));
  const hoy = today();
  let cells = "";
  for (let i = 0; i < offset; i++) cells += `<button type="button" class="out" tabindex="-1" aria-hidden="true"></button>`;
  for (let d = 1; d <= dias; d++) {
    const iso = ui.cMes + "-" + pad(d), items = delMes.filter(c => c.fechaPublicacion === iso);
    cells += `<button type="button" data-action="c-dia" data-v="${iso}" class="${iso === hoy ? "today" : ""}" aria-pressed="${ui.cDia === iso}" aria-label="${d} de ${MESES[m - 1]}, ${items.length} publicaciones">
      <span>${d}</span><span class="dots">${items.slice(0, 6).map(c => `<i style="${serStyle(c.serie)}"></i>`).join("")}</span></button>`;
  }
  const lista = (ui.cDia ? delMes.filter(c => c.fechaPublicacion === ui.cDia) : delMes).sort((a, b) => (a.fechaPublicacion + (a.hora || "")).localeCompare(b.fechaPublicacion + (b.hora || "")));
  const sinFecha = S.contenido.filter(c => !c.fechaPublicacion);
  const pub = delMes.filter(c => c.estado === "publicado").length;
  return `${seg}
  <div class="monthbar"><button class="icon-btn" type="button" data-action="c-mes" data-d="-1" aria-label="Mes anterior">‹</button>
    <h2>${MESES[m - 1][0].toUpperCase() + MESES[m - 1].slice(1)} ${y}</h2>
    <button class="icon-btn" type="button" data-action="c-mes" data-d="1" aria-label="Mes siguiente">›</button></div>
  <p class="muted small" style="margin:0;text-align:center">${delMes.length} ${delMes.length === 1 ? "publicación planeada" : "publicaciones planeadas"} · ${pub} ${pub === 1 ? "publicada" : "publicadas"}</p>
  <div class="cal">${DIAS.map(d => `<span class="dow">${d}</span>`).join("")}${cells}</div>
  ${legend}
  <div class="row between"><h3>${ui.cDia ? fmtDate(ui.cDia) : "Todo el mes"}</h3>${ui.cDia ? `<button class="btn sm ghost" type="button" data-action="c-dia" data-v="">Ver todo el mes</button>` : ""}</div>
  <div class="list">${lista.map(cCard).join("") || `<div class="empty"><div class="iso"></div><b>${ui.cDia ? "Nada planeado este día" : "Nada planeado este mes"}</b><span class="small">Toca “Nuevo contenido” para agregar un video.</span></div>`}</div>
  ${sinFecha.length ? `<h3>Ideas sin fecha (${sinFecha.length})</h3><div class="list">${sinFecha.map(cCard).join("")}</div>` : ""}`;
}

/* ---------- Hojas ---------- */
const sheetRoot = $id("sheetRoot");
function openSheet(title, html, onMount) {
  sheetRoot.innerHTML = `<div class="sheet-bg" data-action="close-bg"><div class="sheet" role="dialog" aria-modal="true" aria-label="${esc(title)}">
    <div class="grab"></div><div class="sheet-head"><h2>${esc(title)}</h2><button class="icon-btn" type="button" data-action="close" aria-label="Cerrar">×</button></div>${html}</div></div>`;
  document.body.style.overflow = "hidden";
  onMount && onMount(sheetRoot.querySelector(".sheet"));
}
function closeSheet() { editingKit = null; editingProv = null; remateDraft = null; insForm = null; editPed = null; sheetRoot.innerHTML = ""; document.body.style.overflow = ""; draft = null; editing = null; editingMat = null; editingC = null; editingInv = null; }

/* Nuevo pedido */
let draft = null;
function newOrder() {
  draft = { fecha: today(), cliente: "", celular: "", cc: "", ciudad: "", direccion: "", precioTipo: "detal", envio: 0, envioModo: "contraentrega", envioAuto: true, pago: "pendiente", abono: 0, estado: "pendiente", canal: "whatsapp", lineas: [], q: "", pegado: "" };
  openSheet("Nuevo pedido", `<div id="orderForm"></div>`, () => drawOrderForm());
}
const enRemate = p => remo(p) === "remate" && n0(p.precioRemate) > 0;
const priceFor = (p, t) => enRemate(p) ? n0(p.precioRemate) : t === "mayor" ? p.mayor : p.menor;
function drawOrderForm(focusId) {
  const d = draft, box = $id("orderForm"); if (!box) return;
  const q = norm(d.q);
  const res = q ? activos().filter(p => norm(p.nombre).includes(q) || norm(p.tipo).includes(q)).slice(0, 8) : [];
  const faltan = d.lineas.filter(l => { const p = S.productos.find(x => x.codigo === l.codigo); return p && l.cantidad > p.stock; });
  box.innerHTML = `
  <div class="card" style="display:flex;flex-direction:column;gap:10px;background:var(--soft);border-color:transparent">
    <div class="field"><label for="f_pegado">Pegar mensaje del cliente o la factura</label>
      <textarea id="f_pegado" data-f="pegado" rows="4" placeholder="Pega los datos de envío o la factura que le mandaste. Puedes pegar uno y después el otro.">${esc(d.pegado || "")}</textarea></div>
    <div class="row" style="gap:8px"><button class="btn grow" type="button" data-action="organizar">Organizar</button>${navigator.clipboard && navigator.clipboard.readText ? `<button class="btn ghost" type="button" data-action="pegar">Pegar</button>` : ""}</div>
  </div>
  <div class="field"><span class="lbl">¿Por dónde llegó el pedido?</span><div class="seg"><button type="button" data-action="canal" data-v="whatsapp" aria-pressed="${d.canal === "whatsapp"}">WhatsApp Business</button><button type="button" data-action="canal" data-v="instagram" aria-pressed="${d.canal === "instagram"}">Instagram</button></div></div>
  <div class="grid2"><div class="field"><label for="f_fecha">Fecha</label><input id="f_fecha" type="date" data-f="fecha" value="${d.fecha}"></div>
    <div class="field"><label for="f_cc">Cédula</label><input id="f_cc" inputmode="numeric" data-f="cc" value="${esc(d.cc)}"></div></div>
  <div class="field"><label for="f_cliente">Cliente</label><input id="f_cliente" data-f="cliente" value="${esc(d.cliente)}" placeholder="Nombre y apellido" autocomplete="off"></div>
  <div class="grid2"><div class="field"><label for="f_cel">Celular</label><input id="f_cel" type="tel" data-f="celular" value="${esc(d.celular)}"></div>
    <div class="field"><label for="f_ciudad">Ciudad</label><input id="f_ciudad" data-f="ciudad" value="${esc(d.ciudad)}"></div></div>
  <div class="field"><label for="f_dir">Dirección</label><input id="f_dir" data-f="direccion" value="${esc(d.direccion)}" placeholder="O punto Interrapidísimo"></div>
  <div class="field"><span class="lbl">Precio</span><div class="seg" role="group" aria-label="Precio">
    <button type="button" data-action="ptipo" data-v="detal" aria-pressed="${d.precioTipo === "detal"}">Detal</button>
    <button type="button" data-action="ptipo" data-v="mayor" aria-pressed="${d.precioTipo === "mayor"}">Por mayor</button></div></div>
  <div class="field"><label for="f_q">Productos</label>
    <input id="f_q" class="search" data-f="q" value="${esc(d.q)}" placeholder="Buscar para agregar" autocomplete="off">
    ${res.length ? `<div class="results">${res.map(p => `<button type="button" data-action="add-line" data-c="${p.codigo}"><span class="row" style="gap:10px">${thumb(p, "sm")}<span><b>${esc(p.nombre)}</b> <span class="muted small">${esc(p.tipo)}</span></span></span><span class="small ${p.stock > 0 ? "" : "muted"}">${p.stock > 0 ? p.stock + " en stock" : "Agotado"}</span></button>`).join("")}</div>` : (q ? '<span class="muted small">Sin resultados</span>' : "")}
  </div>
  ${d.lineas.length ? `<div class="list">${d.lineas.map((l, i) => `<div class="line-item">
    <div class="row" style="gap:10px;align-items:flex-start">${thumb(prodDe(l.codigo))}<div><b>${esc(l.nombre)}</b><div class="muted small">${esc(l.tipo)}${l.nota ? " · " + esc(l.nota) : ""}</div></div></div>
    <button class="icon-btn" type="button" data-action="del-line" data-i="${i}" aria-label="Quitar ${esc(l.nombre)}">×</button>
    <div class="ctl"><span class="lbl">Cantidad</span><div class="stepper"><button class="icon-btn" type="button" data-action="qty" data-i="${i}" data-d="-1" aria-label="Menos">−</button><b>${l.cantidad}</b><button class="icon-btn" type="button" data-action="qty" data-i="${i}" data-d="1" aria-label="Más">+</button></div>
    <span class="muted small" style="margin-left:auto">c/u</span><input id="lp_${i}" inputmode="numeric" data-lp="${i}" value="${miles(l.precio)}" class="money-in" aria-label="Precio por unidad de ${esc(l.nombre)}"></div>
    <div class="ctl"><span class="lbl">Tarjeta personalizada</span><div class="seg mini" role="group" aria-label="Tarjeta personalizada para ${esc(l.nombre)}" style="margin-left:auto"><button type="button" data-action="tarjeta" data-i="${i}" data-v="1" aria-pressed="${!!l.tarjeta}">Sí</button><button type="button" data-action="tarjeta" data-i="${i}" data-v="0" aria-pressed="${!l.tarjeta}">No</button></div></div></div>`).join("")}</div>` : ""}
  ${faltan.length ? `<div class="warn">No alcanza el stock de: ${faltan.map(l => esc(l.nombre)).join(", ")}. Puedes guardarlo igual; el inventario quedará en negativo hasta que las fabriques.</div>` : ""}
  <div class="field"><span class="lbl">Envío</span><div class="seg"><button type="button" data-action="envmodo" data-v="contado" aria-pressed="${d.envioModo === "contado"}">Contado</button><button type="button" data-action="envmodo" data-v="contraentrega" aria-pressed="${d.envioModo === "contraentrega"}">Contraentrega</button></div></div>
  <div class="field"><label for="f_envio">Valor del envío ${d.envioModo === "contraentrega" ? "(lo paga al recibir)" : ""}</label><input id="f_envio" inputmode="numeric" data-f="envio" value="${miles(d.envio)}" placeholder="0" class="money-in"></div>
  ${(() => { const e = envioPorCiudad(d.ciudad);
    return `<div class="row wrap small muted" style="gap:8px;margin-top:-6px">${e ? `<span>${esc(d.ciudad)}: <b>${esc(e.zona)}</b> · ${$(e.valor)}${e.seguro ? "" : " (no la tengo en la lista, revísala)"}</span>${+d.envio !== e.valor ? `<button class="btn sm ghost" type="button" data-action="usar-envio" data-v="${e.valor}">Usar</button>` : ""}` : ""}
      <a class="buy" href="https://www.interrapidisimo.com/" target="_blank" rel="noopener" style="background:var(--soft);color:var(--pink-press)">Cotizar en Interrapidísimo</a></div>`; })()}
  <div class="field"><span class="lbl">Pago</span><div class="seg" style="grid-template-columns:repeat(3,1fr)">
    <button type="button" data-action="pago" data-v="pagado" aria-pressed="${d.pago === "pagado"}">Pagó todo</button>
    <button type="button" data-action="pago" data-v="abono" aria-pressed="${d.pago === "abono"}">Abonó</button>
    <button type="button" data-action="pago" data-v="pendiente" aria-pressed="${d.pago === "pendiente"}">No ha pagado</button></div></div>
  ${d.pago === "abono" ? `<div class="field"><label for="f_abono">Valor del abono</label><input id="f_abono" inputmode="numeric" data-f="abono" value="${miles(d.abono)}" class="money-in" placeholder="${Math.round(pedTotal(d) / 2)}"></div>` : ""}
  <div class="totals"><div><span>Productos</span><span>${$(pedSub(d))}</span></div>
    ${d.envio ? `<div><span>Envío ${d.envioModo === "contraentrega" ? "(contraentrega, no se suma)" : "contado"}</span><span>${d.envioModo === "contraentrega" ? "—" : $(d.envio)}</span></div>` : ""}
    <div class="t"><span>Total a cobrar</span><span>${$(pedTotal(d))}</span></div>
    ${d.pago === "abono" ? `<div><span>Abono</span><span>${$(d.abono)}</span></div><div><span>Saldo pendiente</span><span>${$(Math.max(0, pedTotal(d) - (+d.abono || 0)))}</span></div>` : ""}
    <div class="small muted"><span>Ganancia estimada</span><span>${$(pedGan(d))}</span></div></div>
  <div id="formErr" class="warn" hidden></div>
  <button class="btn block" type="button" data-action="save-order">Guardar pedido</button>`;
  if (focusId) { const el = $id(focusId); if (el) { el.focus(); const v = el.value; try { el.setSelectionRange(v.length, v.length); } catch (e) { } } }
}
/* Organiza el mensaje que manda el cliente por WhatsApp (nombre, ciudad, dirección, celular, cédula) */
const CIUDADES = ["bogota", "medellin", "cali", "barranquilla", "cartagena", "bucaramanga", "pereira", "manizales", "ibague", "neiva", "villavicencio", "pasto", "santa marta", "cucuta", "armenia", "tunja", "popayan", "monteria", "sincelejo", "valledupar", "palmira", "soacha", "facatativa", "zipaquira", "chia", "sopo", "fusagasuga", "girardot", "mosquera", "madrid", "funza", "cajica", "envigado", "itagui", "bello", "rionegro", "floridablanca", "giron", "piedecuesta", "dosquebradas", "duitama", "sogamoso", "yopal", "florencia", "riohacha", "quibdo", "tulua", "buga", "cartago", "jamundi", "yumbo", "la calera", "tocancipa", "tenjo", "cota", "la mesa", "villeta", "ubate", "honda", "espinal", "melgar", "sabaneta", "la estrella", "caldas", "apartado", "turbo", "barrancabermeja", "ocaña", "pamplona", "san andres", "leticia", "mocoa", "arauca", "san gil", "chiquinquira", "ipiales", "tumaco", "buenaventura", "magangue", "cienaga", "soledad", "malambo", "maicao", "aguachica", "lorica", "cerete", "sahagun", "caucasia", "guarne", "marinilla", "la ceja", "santander de quilichao", "zarzal", "sevilla", "calarca", "la dorada", "chinchina", "puerto boyaca", "garzon", "pitalito", "la plata"];
const RX_DIR = /^(cra|cr|kra|kr|carrera|calle|cll|cl|clle|av|avda|avenida|ak|ac|diagonal|diag|dg|transversal|transv|trans|tv|tr|mz|manzana|vereda|km|kilometro|conjunto|edificio|torre|apto|apartamento|casa|barrio|urbanizacion|urb|interrapidisimo|punto|oficina)\b/i;
function organizar(texto) {
  const out = {}, libres = [];
  let lineas = String(texto || "").replace(/\r/g, "").replace(/[​-‏⁠﻿*_~]/g, "").split("\n").map(l => l.replace(/^[\s•\-–·>✨💗💖❤️🩷📍📌🏠🏡📱☎️🪪👤]+/u, "").trim()).filter(Boolean);
  if (lineas.length === 1) lineas = (/:/.test(lineas[0]) ? lineas[0].split(/\s*;\s*|\s*,\s*(?=[a-záéíóúñ. ]{2,25}\s*:)/i) : lineas[0].split(/\s*[,;]\s*/)).filter(Boolean);
  // Etiquetas con o sin dos puntos, en cualquier orden: "Ciudad Itagüí", "Nombre completo: Ana", "Número de documento 104..."
  const SEP = "(?:\\s+de\\s+(?:env[ií]o|entrega|destino|residencia))?(?:\\s+completos?|\\s+completas?)?\\s*(?:[:\\-–=.]\\s*|\\s+)";
  const R = (palabras) => new RegExp("^(?:" + palabras + ")" + SEP, "i");
  const etiquetas = [
    [R("n[uú]mero\\s+de\\s+(?:documento|c[eé]dula|identificaci[oó]n)|c[eé]dula(?:\\s+de\\s+ciudadan[ií]a)?|c\\.?\\s?c\\.?|documento(?:\\s+de\\s+identidad)?|identificaci[oó]n|nit|doc"), "cc"],
    [R("n[uú]mero\\s+de\\s+(?:celular|tel[eé]fono|contacto|whatsapp|cel)|n[uú]mero\\s+celular|celular|cel|tel[eé]fono|tel|whatsapp|contacto|m[oó]vil"), "celular"],
    [R("nombres?\\s+y\\s+apellidos?|nombres?(?:\\s+de\\s+quien\\s+recibe)?|cliente|destinatari[oa]|quien\\s+recibe|recibe|a\\s+nombre\\s+de"), "cliente"],
    [R("ciudad(?:\\s*(?:y|\\/)\\s*(?:departamento|depto))?|municipio(?:\\s*(?:y|\\/)\\s*departamento)?"), "ciudad"],
    [R("direcci[oó]n|dir"), "direccion"],
    [R("barrio"), "barrio"],
    [R("departamento|depto"), "depto"],
    [R("n[uú]mero"), "numero"],
  ];
  for (const l of lineas) {
    const et = etiquetas.find(([rx]) => rx.test(l));
    if (et) { const v = l.replace(et[0], "").trim(); if (!v) continue;
      const k = et[1], dig = v.replace(/[^\d]/g, "");
      if (k === "depto") continue;
      if (k === "barrio") out.barrio = v;
      else if (k === "cc") out.cc = dig;
      else if (k === "celular") out.celular = dig.replace(/^57(?=3\d{9}$)/, "");
      else if (k === "numero") { const n = dig.replace(/^57(?=3\d{9}$)/, ""); if (/^3\d{9}$/.test(n) && !out.celular) out.celular = n; else out.cc = out.cc || dig; }
      else if (k === "ciudad") out.ciudad = v.split(/\s*[,(]\s*|\s+[-–]\s+/)[0].trim();
      else out[k] = v;
      continue; }
    const dig = l.replace(/[\s.\-()+]/g, "");
    if (/^\d{6,13}$/.test(dig)) {
      const n = dig.replace(/^57(?=3\d{9}$)/, "");
      if (/^3\d{9}$/.test(n) && !out.celular) out.celular = n; else if (!out.cc) out.cc = dig; else if (!out.celular) out.celular = n;
      continue;
    }
    const n = norm(l);
    if (RX_DIR.test(n) || /#|\bno\.?\s*\d|\d+\s*-\s*\d+/.test(l)) { out.direccion = out.direccion ? out.direccion + ", " + l : l; continue; }
    if (CIUDADES.includes(n.replace(/[.,]/g, "")) && !out.ciudad) { out.ciudad = l; continue; }
    libres.push(l);
  }
  // Lo que queda: el nombre suele ser lo más largo; la ciudad, lo corto
  libres.sort((a, b) => b.split(/\s+/).length - a.split(/\s+/).length);
  for (const l of libres) {
    const palabras = l.split(/\s+/).length;
    if (!out.cliente && palabras >= 2 && !/\d/.test(l)) out.cliente = l;
    else if (!out.ciudad && palabras <= 3 && !/\d/.test(l)) out.ciudad = l;
    else if (!out.cliente) out.cliente = l;
    else if (/barrio/i.test(l) || !out.barrio) out.barrio = l;
  }
  if (out.barrio && out.direccion && !norm(out.direccion).includes(norm(out.barrio))) out.direccion += ", " + out.barrio;
  else if (out.barrio && !out.direccion) out.direccion = out.barrio;
  delete out.barrio;
  return out;
}
/* Lee la factura que le mandas al cliente: "(1) collar Soy Luna: 35.000", "Abono (50%): 17.500", "Envío: 12.000" */
const plata = s => parseInt(String(s).replace(/[^\d]/g, ""), 10) || 0;
const TIPO_PALABRAS = [["manillas", "Manillas parejas"], ["manilla", "Manilla individual"], ["pulsera", "Pulsera"], ["cadenitas", "Cadenitas parejas"], ["cadenas", "Cadenitas parejas"], ["cadenita", "Cadenita individual"], ["cadena", "Cadenita individual"], ["collares", "Collares pareja"], ["collar", "Collar individual"], ["choker", "Collares pareja"], ["anillos", "Anillos pareja"], ["anillo", "Anillos"]];
function buscarProducto(texto) {
  const n = norm(texto).replace(/[^a-z0-9ñ ]/g, " ").replace(/\s+/g, " ").trim();
  const tipoTxt = (TIPO_PALABRAS.find(([w]) => new RegExp("\\b" + w + "\\b").test(n)) || [])[1];
  const trio = /\btrio|tres\b/.test(n), pareja = /\bpareja|parejas|duo\b/.test(n);
  let mejor = null, puntos = 0;
  for (const p of activos()) {
    const nom = norm(p.nombre).replace(/[^a-z0-9ñ ]/g, " ").replace(/\s+/g, " ").trim();
    if (!nom || !(" " + n + " ").includes(" " + nom + " ")) continue;
    let s = nom.length * 2;
    if (tipoTxt && p.tipo === tipoTxt) s += 30;
    else if (tipoTxt && p.tipo.split(" ")[0].toLowerCase().startsWith(tipoTxt.split(" ")[0].toLowerCase().slice(0, 6))) s += 15;
    if (trio && /trios/.test(p.tipo)) s += 20;
    if (pareja && /parejas|pareja/.test(p.tipo)) s += 10;
    if (s > puntos) { puntos = s; mejor = p; }
  }
  return mejor;
}
function leerFactura(texto) {
  const res = { lineas: [], abono: 0, envio: 0, pagado: false };
  String(texto || "").replace(/[\u200B-\u200F\u2060\uFEFF*_~]/g, "").split("\n").map(l => l.replace(/^[\s•\-–·>✨💗💖❤️🩷]+/u, "").trim()).filter(Boolean).forEach(l => {
    const n = norm(l);
    if (/^total|saldo/.test(n.replace(/[^a-z ]/g, "").trim())) return;
    if (/abono/.test(n)) { res.abono = plata(l.split(":").pop()); return; }
    if (/env[ií]o|domicilio|flete/.test(n) && /\d/.test(l)) { res.envio = plata(l.split(":").pop()); return; }
    if (/pag[oó] (completo|total)|ya pag/.test(n)) { res.pagado = true; return; }
    let nota = "";
    const np = l.match(/^(.*?\d[\d.,]*)\s*[(\[]([^)\]]*)[)\]]\s*$/);
    if (np) { l = np[1]; nota = np[2].trim(); }
    let m = l.match(/^\(?\s*(\d+)\s*\)?\s*(?:x|×|und\.?|unid\.?|uds?\.?)?\s+(.+?)\s*[:=\-–]\s*\$?\s*([\d.,]+)\s*$/i)
      || l.match(/^(.+?)\s*(?:x|×)\s*(\d+)\s*[:=\-–]\s*\$?\s*([\d.,]+)\s*$/i);
    if (!m) return;
    let cant, nombre, total;
    if (/^\(?\s*\d/.test(l)) { cant = +m[1]; nombre = m[2]; total = plata(m[3]); } else { nombre = m[1]; cant = +m[2]; total = plata(m[3]); }
    if (!cant || !total || !nombre) return;
    const tarjeta = /tarjeta/i.test(nota + " " + nombre);
    nombre = nombre.replace(/\s*[(\[][^)\]]*tarjeta[^)\]]*[)\]]/i, "").trim();
    res.lineas.push({ texto: nombre, cantidad: cant, total, tarjeta, nota: tarjeta ? "" : nota });
  });
  return res;
}
function aplicarOrganizado() {
  const r = organizar(draft.pegado), f = leerFactura(draft.pegado);
  // una factura trae productos y valores; los datos de envío llegan en otro mensaje
  const campos = f.lineas.length ? [] : ["cliente", "ciudad", "direccion", "celular", "cc"].filter(k => r[k]);
  campos.forEach(k => draft[k] = r[k]);
  const sinMatch = [];
  f.lineas.forEach(x => {
    const p = buscarProducto(x.texto), precio = Math.round(x.total / x.cantidad);
    if (p) {
      const ex = draft.lineas.find(l => l.codigo === p.codigo);
      if (ex) { ex.cantidad = x.cantidad; ex.precio = precio; ex.tarjeta = x.tarjeta; ex.nota = x.nota; }
      else draft.lineas.push({ codigo: p.codigo, nombre: p.nombre, tipo: p.tipo, cantidad: x.cantidad, precio, costo: costoProd(p), tarjeta: x.tarjeta, nota: x.nota });
      if (precio === p.mayor && p.mayor !== p.menor) draft.precioTipo = "mayor";
    } else { sinMatch.push(x.texto); draft.lineas.push({ codigo: null, nombre: x.texto, tipo: "No está en el catálogo", cantidad: x.cantidad, precio, costo: 0, tarjeta: x.tarjeta, nota: x.nota }); }
  });
  if (f.envio) { draft.envio = f.envio; draft.envioModo = "contado"; draft.envioAuto = false; }
  else if (f.lineas.length) { draft.envioModo = "contraentrega"; }
  autoEnvio();
  if (f.abono) { draft.pago = "abono"; draft.abono = f.abono; } else if (f.pagado) draft.pago = "pagado";
  if (!campos.length && !f.lineas.length) { toast("No encontré datos en ese mensaje"); return; }
  if (campos.includes("ciudad")) autoEnvio();
  draft.pegado = ""; drawOrderForm();
  toast(sinMatch.length ? "Revisa: no encontré “" + sinMatch.join("”, “") + "” en el catálogo" : f.lineas.length ? "Listo: " + f.lineas.length + " producto" + (f.lineas.length > 1 ? "s" : "") + " agregado" + (f.lineas.length > 1 ? "s" : "") + ". Revisa antes de guardar" : "Listo. Revisa que cada dato quedó en su lugar");
}
let draftPegadoUsado = false;

/* En contraentrega, si no has escrito el valor, se llena con la tarifa de la zona de la ciudad */
function autoEnvio() {
  if (!draft || draft.envioModo !== "contraentrega" || !draft.envioAuto) return;
  const e = envioPorCiudad(draft.ciudad); draft.envio = e ? e.valor : 0;
}
function saveOrder() {
  const d = draft, err = $id("formErr"), miss = [];
  if (!d.cliente.trim()) miss.push("el nombre del cliente");
  if (!d.lineas.length) miss.push("al menos un producto");
  if (miss.length) { err.hidden = false; err.textContent = "Falta " + miss.join(" y ") + "."; return; }
  const agotados = [];
  d.lineas.forEach(l => { const p = S.productos.find(x => x.codigo === l.codigo); if (p) { gastarMateria(p, Math.min(l.cantidad, l.cantidad - Math.max(0, p.stock))); p.stock -= l.cantidad; if (remo(p) === "remate" && p.stock <= 0) { p.remodelacion = "archivado"; agotados.push(p.nombre); } guardar("productos", p); } });
  if (agotados.length) setTimeout(() => toast("Se vendió el remate de " + agotados.join(", ") + " · quedó archivado"), 2900);
  const ped = { ...d, id: "p" + Date.now(), n: nextN(), envio: +d.envio || 0, envioPaga: undefined, pagado: d.pago === "pagado", abono: d.pago === "abono" ? (+d.abono || 0) : 0 }; delete ped.q; delete ped.pegado; delete ped.envioAuto; delete ped.envioPaga;
  S.pedidos.push(ped); guardar("pedidos", ped); closeSheet(); ui.pedFiltro = "activos"; go("pedidos"); toast("Pedido #" + ped.n + " guardado · stock descontado");
}
function verPedido(id) {
  const p = S.pedidos.find(x => x.id === id); if (!p) return;
  const prev = p.estado === "perdido" ? null : ESTADOS[ESTADOS.indexOf(p.estado) - 1];
  editPed = { id: p.id, lineas: p.lineas.map(l => ({ ...l })), abierto: false };
  openSheet("Pedido #" + p.n, `${orderCard(p, { track: true })}
    <div id="editLineas"></div>
    <div class="card" style="display:grid;gap:6px;font-size:14px">
      <div><span class="muted small">Celular</span><br>${esc(p.celular) || "—"}</div>
      <div><span class="muted small">Cédula</span><br>${esc(p.cc) || "—"}</div>
      <div><span class="muted small">Dirección</span><br>${esc(p.direccion) || "—"}</div>
      <div><span class="muted small">Precio</span><br>${p.precioTipo === "mayor" ? "Por mayor" : "Detal"}</div></div>
    <div class="field"><span class="lbl">Llegó por</span><div class="seg">${Object.keys(CANALES).map(k => `<button type="button" data-action="set-canal" data-id="${p.id}" data-v="${k}" aria-pressed="${canalDe(p) === k}">${CANALES[k]}</button>`).join("")}</div></div>
    <div class="field"><span class="lbl">Pago</span><div class="seg" style="grid-template-columns:repeat(3,1fr)">
      ${["pagado", "abono", "pendiente"].map(k => `<button type="button" data-action="set-pago" data-id="${p.id}" data-v="${k}" aria-pressed="${pagoDe(p) === k}">${{ pagado: "Pagó todo", abono: "Abonó", pendiente: "No ha pagado" }[k]}</button>`).join("")}</div></div>
    ${pagoDe(p) === "abono" ? `<div class="field"><label for="d_abono">Valor del abono</label><input id="d_abono" inputmode="numeric" data-abono="${p.id}" value="${miles(p.abono)}" class="money-in"></div>` : ""}
    ${p.estado === "enviado" ? `<button class="btn block ghost" type="button" data-action="perdido" data-id="${p.id}" style="color:var(--loss)">Marcar envío perdido</button>` : ""}
    ${prev ? `<button class="btn block ghost" type="button" data-action="retroceder" data-id="${p.id}">Devolver a ${EST_LABEL[prev].toLowerCase()}</button>` : ""}
    <div id="cancelBox"><button class="btn block danger" type="button" data-action="cancel-ask" data-id="${p.id}">${p.estado === "entregado" ? "Borrar venta" : "Cancelar pedido"}</button></div>`, () => drawEditLineas());
}
let editPed = null;
function drawEditLineas() {
  const box = $id("editLineas"); if (!box || !editPed) return;
  if (!editPed.abierto) { box.innerHTML = `<button class="btn block line" type="button" data-action="edit-lineas">Cambiar productos o precios</button>`; return; }
  const sub = editPed.lineas.reduce((s, l) => s + l.cantidad * l.precio, 0);
  box.innerHTML = `<div class="card" style="display:flex;flex-direction:column;gap:10px">
    <h3>Productos de este pedido</h3>
    <p class="muted small" style="margin:0">El precio que cambies aquí aplica solo a este pedido. El catálogo no cambia.</p>
    ${editPed.lineas.map((l, i) => `<div class="line-item">
      <div><b>${esc(l.nombre)}</b><div class="muted small">${esc(l.tipo)}</div></div><span></span>
      <div class="ctl"><span class="lbl">Cantidad</span><div class="stepper"><button class="icon-btn" type="button" data-action="eq" data-i="${i}" data-d="-1" aria-label="Menos">−</button><b>${l.cantidad}</b><button class="icon-btn" type="button" data-action="eq" data-i="${i}" data-d="1" aria-label="Más">+</button></div>
      <span class="muted small" style="margin-left:auto">c/u</span><input id="ep_${i}" inputmode="numeric" class="money-in" data-ep="${i}" value="${miles(l.precio)}" aria-label="Precio por unidad de ${esc(l.nombre)}"></div></div>`).join("")}
    <div class="totals"><div class="t"><span>Productos</span><span id="epSub">${$(sub)}</span></div></div>
    <div class="row" style="gap:8px"><button class="btn grow" type="button" data-action="save-lineas">Guardar cambios</button><button class="btn ghost" type="button" data-action="cancel-lineas">Cancelar</button></div></div>`;
}

/* Materia prima de cada producto: se enlaza con la lista de Catálogo → Materia prima */
const insumosDe = p => insLinks(p).map(l => S.materia.find(m => m.id === l.id)).filter(Boolean);
function lugarDeLink(u) {
  const h = (String(u).match(/^https?:\/\/([^/]+)/i) || [])[1] || "";
  const d = h.replace(/^www\.|^m\.|^api-/, "").toLowerCase();
  if (/shein/.test(d)) return "SHEIN"; if (/temu/.test(d)) return "TEMU"; if (/santorini/.test(d)) return "SANTORINI";
  if (/whimsofgirls/.test(d)) return "WHIMS"; if (/aliexpress/.test(d)) return "ALIEXPRESS"; if (/mercadolibre/.test(d)) return "MERCADO LIBRE"; if (/amazon/.test(d)) return "AMAZON";
  return d ? d.split(".")[0].toUpperCase() : "";
}
let insForm = null;
const opcionesCat = sel => `<option value="">Sin categoría</option>` + catsTodas().map(c => `<option ${c === sel ? "selected" : ""}>${c}</option>`).join("");
function camposCompra(f, pre) {
  const icc = CAT_INS[f.categoria] || CAT_INS.Otro, ic = infoCat(f), base = baseCantidad(f), tiras = icc.doc && f.presentacion === "tiras", gramos = icc.doc && f.presentacion === "gramos";
  const pu = base ? num(f.precio) / base : 0;
  return `<div class="grid2"><div class="field"><label for="${pre}_cant">${tiras ? "Tiras o paquetes comprados" : gramos ? "Gramos comprados" : "Cantidad comprada"}</label><input id="${pre}_cant" inputmode="decimal" data-${pre}="cantidadIngresada" value="${esc(decTxt(dec(f.cantidadIngresada)))}" placeholder="Ej: 50"></div>
    <div class="field"><label for="${pre}_precio">Precio total</label><input id="${pre}_precio" inputmode="numeric" class="money-in" data-${pre}="precio" value="${miles(f.precio)}" placeholder="0"></div></div>
    ${icc.doc ? `<div class="seg" role="group" aria-label="Viene por"><button type="button" data-action="${pre}-pres" data-v="unidades" aria-pressed="${!["docenas", "tiras", "gramos"].includes(f.presentacion)}">Unidades</button><button type="button" data-action="${pre}-pres" data-v="docenas" aria-pressed="${f.presentacion === "docenas"}">Docenas</button><button type="button" data-action="${pre}-pres" data-v="tiras" aria-pressed="${tiras}">Tiras</button><button type="button" data-action="${pre}-pres" data-v="gramos" aria-pressed="${gramos}">Gramos</button></div>
      ${gramos ? `<div class="field"><label for="${pre}_pgr">¿Cuántas trae por gramo? (opcional)</label><input id="${pre}_pgr" inputmode="decimal" data-${pre}="porGramo" value="${esc(f.porGramo || "")}" placeholder="Ej: 10"></div><p class="muted small" style="margin:-6px 0 0">Si lo llenas, en el producto pones cuántas piezas usa. Si no, pones cuántos gramos usa.</p>` : ""}
      ${tiras ? `<div class="field"><label for="${pre}_ptira">¿Cuántas trae cada tira?</label><input id="${pre}_ptira" inputmode="numeric" data-${pre}="porTira" value="${esc(f.porTira || "")}" placeholder="Ej: 40 perlas"></div><p class="muted small" style="margin:-6px 0 0">En el producto pones cuántas usa (ej. 12 perlas) y la app saca el precio.</p>` : ""}`
      : `<p class="muted small" style="margin:0">Escribe la cantidad en ${ic.pl}.</p>`}
    ${f.categoria === "Mostacilla" ? `<div class="field"><label for="${pre}_cpg">Cuentas por gramo (opcional)</label><input id="${pre}_cpg" inputmode="numeric" data-${pre}="cuentasPorGramo" value="${f.cuentasPorGramo || ""}" placeholder="Cuenta las que caben en 1 gramo"></div>` : ""}
    <div class="totals"><div class="t"><span>Te sale a</span><span id="${pre}_pu">${pu ? $u(pu) + " " + ic.c : "—"}</span></div></div>`;
}
const baseCantidad = f => { const doc = (CAT_INS[f.categoria] || CAT_INS.Otro).doc; return (doc && f.presentacion === "docenas" ? 12 : doc && f.presentacion === "tiras" ? dec(f.porTira) : doc && f.presentacion === "gramos" ? (dec(f.porGramo) || 1) : 1) * dec(f.cantidadIngresada); };
function refrescarPU(f, pre) { const el = $id(pre + "_pu"); if (!el) return; const ic = infoCat(f), b = baseCantidad(f); el.textContent = b && num(f.precio) ? $u(num(f.precio) / b) + " " + ic.c : "—"; }
function drawProdIns() {
  const box = $id("ppIns"); if (!box || !editing) return;
  const links = insLinks(editing), usados = links.map(l => l.id);
  const libres = S.materia.filter(m => !usados.includes(m.id));
  const grupos = ["", ...catsTodas()].map(c => [c, libres.filter(m => catDe(m) === c).sort((a, b) => a.nombre.localeCompare(b.nombre, "es"))]).filter(([, l]) => l.length);
  box.innerHTML = `${links.length ? `<div class="list">${links.map(l => { const m = S.materia.find(x => x.id === l.id); if (!m) return ""; const u = safeUrl(m.link), ic = infoCat(m), usa = dec(l.usa);
      return `<div class="ins-row">
        <div class="row between" style="gap:8px"><div class="grow"><b>${esc(m.nombre)}</b><div class="muted small">${catDe(m) || "Sin categoría"} · ${$u(unitario(m))} ${ic.c}</div></div>
        ${u ? `<a class="buy" href="${esc(u)}" target="_blank" rel="noopener">Comprar</a>` : ""}
        <button class="icon-btn" type="button" data-action="ins-quitar" data-id="${m.id}" aria-label="Quitar ${esc(m.nombre)}">×</button></div>
        <div class="row" style="gap:8px"><label class="small muted" for="usa_${m.id}">Usa</label><input id="usa_${m.id}" class="usa-in" inputmode="decimal" data-usa="${m.id}" value="${esc(decTxt(usa))}">
        <span class="small muted" id="uni_${m.id}">${unidadTxt(m, usa)}</span><b class="num" style="margin-left:auto" id="sub_${m.id}">${$u(unitario(m) * usa)}</b></div></div>`; }).join("")}</div>
      <p class="muted small" style="margin:0">El costo de materiales del producto se calcula con esta materia prima.</p>`
    : `<p class="muted small" style="margin:0">Todavía no le has puesto materia prima: el costo va solo con mano de obra y empaque.</p>`}
  ${grupos.length ? `<div class="field"><label for="ppInsSel">Agregar de tu materia prima</label><select id="ppInsSel" data-ins="sel"><option value="">Escoge un insumo…</option>${grupos.map(([c, l]) => `<optgroup label="${c || "Sin categoría"}">${l.map(m => `<option value="${m.id}">${esc(m.nombre)} · ${$u(unitario(m))} ${infoCat(m).c}</option>`).join("")}</optgroup>`).join("")}</select></div>` : ""}
  ${insForm ? `<div class="card" style="display:flex;flex-direction:column;gap:10px">
      <div class="field"><label for="inf_cat">Categoría</label><select id="inf_cat" data-inf="categoria">${opcionesCat(insForm.categoria)}</select></div>
      <div class="field"><label for="inf_link">Link de compra</label><input id="inf_link" type="url" data-inf="link" value="${esc(insForm.link)}" placeholder="Pega el link de SHEIN, Temu, Santorini…"></div>
      <div class="grid2"><div class="field"><label for="inf_nombre">Nombre</label><input id="inf_nombre" data-inf="nombre" value="${esc(insForm.nombre)}" placeholder="Ej: Dije girasol"></div>
        ${selectProv(insForm.proveedorId, "inf")}</div>
      ${insForm.proveedorId === "otro" ? `<div class="field"><label for="inf_lugar">¿Dónde lo compras?</label><input id="inf_lugar" data-inf="lugar" value="${esc(insForm.lugar)}"></div>` : ""}
      ${camposCompra(insForm, "inf")}
      <div class="row" style="gap:8px"><button class="btn grow" type="button" data-action="ins-crear">Agregar a materia prima</button><button class="btn ghost" type="button" data-action="ins-cancelar">Cancelar</button></div>
    </div>` : `<button class="btn block line" type="button" data-action="ins-nuevo">+ Nuevo insumo con link</button>`}`;
  bloquearCostos();
}
const unidadTxt = (m, usa) => { const ic = infoCat(m); return (usa === 1 ? ic.u : ic.pl) + (catDe(m) === "Mostacilla" && m.cuentasPorGramo ? " ≈ " + Math.round(usa * m.cuentasPorGramo) + " cuentas" : ""); };
/* Con materia prima enlazada, los campos de hilo, dije, mostacillas y compra se llenan solos */
function bloquearCostos() {
  if (!editing) return; const auto = usaInsumos(editing), mat = auto ? materialesDe(editing) : null;
  ["hilo", "dije", "mostacillas", "compra"].forEach(k => { const el = $id("pp_" + k); if (!el) return; el.readOnly = auto; el.classList.toggle("auto", auto); if (auto) el.value = miles(mat[k]) || "0"; });
  const eb = $id("ppEmp"); if (eb) eb.innerHTML = empaqueBox(editing);
  drawPiezas();
  drawProdTot();
}

/* Remate: últimas unidades más baratas; al venderse la última, el producto se archiva solo */
const ultimaVenta = p => S.pedidos.filter(x => x.estado !== "perdido" && x.lineas.some(l => l.codigo === p.codigo)).map(x => x.fecha).sort().pop() || "";
function sugerenciaRemate(p) {
  const cd = costosDe(p), directo = cd.hilo + cd.dije + cd.mostacillas + cd.compra + empaqueDe(p).total;
  const base = Math.round(n0(p.menor) * 0.6 / 1000) * 1000;
  return Math.max(base, Math.ceil(directo / 1000) * 1000, 5000);
}
function vSugeridosRemate() {
  const hace = isoDate(new Date(Date.now() - 60 * 864e5));
  const sug = S.productos.filter(p => (remo(p) === "pendiente" || remo(p) === "remodelado") && p.stock > 0 && (ultimaVenta(p) || "") < hace)
    .sort((a, b) => b.stock - a.stock || a.nombre.localeCompare(b.nombre, "es"));
  if (!sug.length) return "";
  return `<section class="card" style="display:flex;flex-direction:column;gap:8px">
    <h3>Sugeridos para remate</h3>
    <p class="muted small" style="margin:0">Tienen unidades y no se han vendido en los últimos 60 días.</p>
    ${sug.slice(0, 15).map(p => `<div class="row between" style="gap:8px">${thumb(p, "sm")}<div class="grow"><b>${esc(p.nombre)}</b><div class="muted small">${esc(p.tipo)} · ${p.stock} en stock · ${ultimaVenta(p) ? "última venta " + fmtDate(ultimaVenta(p)) : "sin ventas registradas"}</div></div>
      <button class="btn sm" type="button" data-action="remo" data-c="${p.codigo}" data-v="remate">Rematar</button></div>`).join("")}
    ${sug.length > 15 ? `<p class="muted small" style="margin:0">Y ${sug.length - 15} más.</p>` : ""}
  </section>`;
}
let remateDraft = null;
function pedirPrecioRemate(p) {
  remateDraft = { codigo: p.codigo, precio: n0(p.precioRemate) || sugerenciaRemate(p) };
  const cd = costosDe(p), directo = cd.hilo + cd.dije + cd.mostacillas + cd.compra + empaqueDe(p).total;
  openSheet("Precio de remate", `
    <div class="row" style="gap:10px">${thumb(p, "lg")}<div><b>${esc(p.nombre)}</b><div class="muted small">${esc(p.tipo)} · ${p.stock} en stock</div></div></div>
    <div class="totals"><div><span>Precio normal</span><span>${$(p.menor)}</span></div><div><span>Lo que pagaste en materiales y empaque</span><span>${$(directo)}</span></div></div>
    <div class="field"><label for="rm_precio">Precio de remate</label><input id="rm_precio" inputmode="numeric" class="money-in" data-remate="precio" value="${miles(remateDraft.precio)}"></div>
    <p class="muted small" style="margin:0">Te sugiero ${$(sugerenciaRemate(p))}: cerca del 40% menos y sin bajar de lo que pagaste en materiales. Aplica para detal y por mayor.</p>
    <button class="btn block" type="button" data-action="remate-ok">Poner en remate</button>`);
}

/* Detalle del producto */
function verProd(codigo) {
  const p = S.productos.find(x => x.codigo === codigo); if (!p) return;
  const c = costoProd(p), u = fotoUrl(p);
  const ventas = S.pedidos.filter(x => x.estado !== "perdido").flatMap(x => x.lineas.filter(l => l.codigo === p.codigo).map(l => ({ ...l, fecha: x.fecha })));
  const vendidas = ventas.reduce((a, l) => a + n0(l.cantidad), 0), ingreso = ventas.reduce((a, l) => a + n0(l.cantidad) * n0(l.precio), 0);
  const ultima = ventas.map(l => l.fecha).sort().pop();
  const cd = costosDe(p);
  const costos = [[baseLbl(p), cd.hilo], ["Dije", cd.dije], ["Mostacillas", cd.mostacillas], [esHecho(p) ? "Lo compraste a" : usaInsumos(p) ? "Pasadores y otros" : "Compra", cd.compra], ["Mano de obra", manoDe(p)]].filter(([, v]) => n0(v));
  openSheet(p.nombre, `
    ${u ? `<img class="foto-big" src="${esc(u)}" alt="Foto de ${esc(p.nombre)}">` : `<div class="foto-big ph"><span>Sin foto</span></div>`}
    <div class="row between wrap" style="gap:8px"><span class="muted">${esc(p.tipo)} · #${p.codigo}${esHecho(p) ? " · Reventa" : ""}</span><span class="tag ${remo(p) === "remodelado" ? "ok" : remo(p) === "archivado" ? "loss" : ""}">${REMO[remo(p)]}</span></div>
    <section class="card" style="display:flex;align-items:center;justify-content:space-between;gap:10px">
      <div><h3>Stock</h3><span class="muted small">${p.stock <= 0 ? "Agotado" : p.stock === 1 ? "Queda 1" : "Disponibles"}</span></div>
      <div class="stepper"><button class="icon-btn" type="button" data-action="stock-det" data-c="${p.codigo}" data-d="-1" aria-label="Restar uno">−</button><b class="${p.stock <= 0 ? "zero" : ""}" style="font-size:22px">${p.stock}</b><button class="icon-btn" type="button" data-action="stock-det" data-c="${p.codigo}" data-d="1" aria-label="Sumar uno">+</button></div>
    </section>
    ${(() => { const r = puedeHacer(p); if (!r) return ""; const ls = linksEf(p).map(l => ({ l, m: S.materia.find(x => x.id === l.id) })).filter(x => x.m);
      return `<section class="card"><div class="row between" style="gap:8px"><h3>Materia prima en casa</h3>${r.ok ? '<span class="tag ok">Se puede hacer</span>' : r.faltan.length ? '<span class="tag loss">Falta material</span>' : '<span class="tag">Sin registrar</span>'}</div>
      ${ls.map(({ l, m }) => { const ok = tieneCasa(m) && dec(m.enCasa) >= dec(l.usa); return `<div class="row between small" style="gap:8px"><span>${esc(m.nombre)} <span class="muted">(usa ${decTxt(dec(l.usa))})</span></span><span class="${tieneCasa(m) ? (ok ? "" : "loss-txt") : "muted"}">${tieneCasa(m) ? "Tienes " + casaTxt(m) : "Sin registrar"}</span></div>`; }).join("")}
      ${r.sinDato.length ? `<p class="muted small" style="margin:0">Pon cuánto tienes en casa de cada insumo en Materia para saber si alcanza.</p>` : ""}
      <button class="btn block line" type="button" data-action="arme" data-c="${p.codigo}">Armé 1 · suma al stock</button></section>`; })()}
    <div class="totals">
      <div><span>Precio detal</span><b>${$(p.menor)}</b></div>
      <div><span>Precio por mayor</span><b>${$(p.mayor)}</b></div>
      <div><span>Costo de fabricación</span><span>${$(c)}</span></div>
      <div class="t" style="color:${p.mayor - c < 0 ? "var(--loss)" : "var(--pink-press)"}"><span>Ganancia por mayor</span><span>${$(p.mayor - c)}</span></div>
      <div style="color:${p.menor - c < 0 ? "var(--loss)" : "inherit"}"><span>Ganancia al detal</span><span>${$(p.menor - c)}</span></div>
    </div>
    ${insumosDe(p).length ? `<section class="card" style="display:flex;flex-direction:column;gap:8px"><h3>Materia prima</h3>${insumosDe(p).map(m => { const u = safeUrl(m.link), usa = dec((insLinks(p).find(l => l.id === m.id) || {}).usa); return `<div class="row between" style="gap:8px"><div class="grow"><b>${esc(m.nombre)}</b><div class="muted small">Usa ${decTxt(usa)} ${usa === 1 ? infoCat(m).u : infoCat(m).pl} · ${$u(unitario(m) * usa)}</div></div>${u ? `<a class="buy" href="${esc(u)}" target="_blank" rel="noopener">Comprar</a>` : ""}</div>`; }).join("")}</section>` : ""}
    ${costos.length ? `<section class="card" style="display:flex;flex-direction:column;gap:6px"><h3>De qué está hecho el costo</h3>${costos.map(([k, v]) => `<div class="row between"><span>${k}</span><span class="num">${$(v)}</span></div>`).join("")}${empaqueBox(p)}</section>` : ""}
    <section class="card" style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;text-align:center">
      <div><b style="font-size:20px">${vendidas}</b><div class="muted small">vendidas</div></div>
      <div><b class="num">${$(ingreso)}</b><div class="muted small">en ventas</div></div>
      <div><b>${ultima ? fmtDate(ultima) : "—"}</b><div class="muted small">última venta</div></div>
    </section>
    ${enRemate(p) ? `<div class="warn">En remate a <b>${$(p.precioRemate)}</b>. Cuando se venda la última unidad se archiva solo.</div>` : ""}
    <button class="btn block" type="button" data-action="edit-prod" data-c="${p.codigo}">Editar producto</button>
    ${remo(p) !== "archivado" ? `<button class="btn block ghost" type="button" data-action="remate-precio" data-c="${p.codigo}">${enRemate(p) ? "Cambiar precio de remate" : "Poner en remate"}</button>` : ""}
    ${remo(p) !== "archivado" ? `<button class="btn block ghost" type="button" data-action="video-prod" data-c="${p.codigo}">Crear video de este producto</button>` : ""}`);
}

/* Producto */
let editing = null;
function editProd(codigo) {
  const nuevo = codigo == null;
  const p = nuevo ? { codigo: Math.max(100, ...S.productos.map(x => x.codigo)) + 1, nombre: "", tipo: TIPOS[1], hilo: 0, dije: 0, mostacillas: 0, compra: 0, manoObra: MO_CAT[TIPOS[1]], empaque: 2815, mayor: 0, menor: 0, stock: 0, remodelacion: "pendiente" } : { ...S.productos.find(x => x.codigo === codigo) };
  const f = (k, l, cls = "") => `<div class="field ${cls}"><label for="pp_${k}" id="lbl_${k}">${l}</label><input id="pp_${k}" inputmode="numeric" data-pp="${k}" value="${k === "stock" ? (p[k] || "") : miles(p[k])}" placeholder="0"${k === "stock" ? "" : ' class="money-in"'}></div>`;
  openSheet(nuevo ? "Nuevo producto" : "Editar producto", `
    <div class="foto-edit" id="ppFoto"></div>
    <div class="field"><label for="pp_nombre">Nombre</label><input id="pp_nombre" data-pp="nombre" value="${esc(p.nombre)}"></div>
    <div class="grid2"><div class="field"><label for="pp_tipo">Tipo</label><select id="pp_tipo" data-pp="tipo">${TIPOS.map(t => `<option ${t === p.tipo ? "selected" : ""}>${t}</option>`).join("")}</select></div>${f("stock", "Stock")}</div>
    <div class="field"><span class="lbl">Origen</span><div class="seg" id="ppHecho"><button type="button" data-action="pp-hecho" data-v="0" aria-pressed="${!esHecho(p)}">Artesanal</button><button type="button" data-action="pp-hecho" data-v="1" aria-pressed="${esHecho(p)}">Reventa</button></div></div>
    <h3>Costos</h3>
    <div id="ppPiezas"></div>
    <div class="grid3 ${esHecho(p) ? "es-hecho" : ""} ${esCollar(p) ? "es-collar" : ""}" id="ppCostos">${f("hilo", baseLbl(p), "solo-armo no-collar")}${f("dije", "Dije", "solo-armo no-collar")}${f("mostacillas", "Mostacillas", "solo-armo no-collar")}${f("compra", esHecho(p) ? "Lo compraste a" : "Compra", "no-collar")}${f("manoObra", "Mano de obra", "solo-armo")}</div>
    <div id="ppEmp"></div>
    <h3>Precios</h3>
    <div class="grid2">${f("menor", "Detal")}${f("mayor", "Por mayor (−20%)")}</div>
    <div class="totals" id="ppTot"></div>
    <h3>Materia prima que usa</h3>
    <div id="ppIns" style="display:flex;flex-direction:column;gap:10px"></div>
    <button class="btn block" type="button" data-action="save-prod">Guardar producto</button>`, () => { editing = p; insForm = null; drawProdFoto(); drawProdIns(); });
}
function drawProdFoto() {
  const el = $id("ppFoto"); if (!el || !editing) return;
  const u = fotoUrl(editing);
  el.innerHTML = `${u ? `<img class="foto-big" src="${esc(u)}" alt="Foto de ${esc(editing.nombre)}">` : `<div class="foto-big ph"><span>Sin foto</span></div>`}
    <div class="row" style="gap:8px"><label class="btn ${u ? "ghost" : ""} grow filebtn">${u ? "Cambiar foto" : "Agregar foto"}<input type="file" id="ppFotoIn" accept="image/*"></label>
    ${u ? `<button class="btn ghost" type="button" data-action="quitar-foto">Quitar</button>` : ""}</div><span class="muted small solo-compu" style="flex-basis:100%">o pega un pantallazo con ⌘V, o arrastra la imagen aquí</span>`;
}
function drawProdTot() {
  const p = editing, c = costoProd(p), el = $id("ppTot"); if (!el) return;
  const hecho = esHecho(p), lh = $id("lbl_hilo"), lc = $id("lbl_compra"), g = $id("ppCostos");
  if (lh) lh.textContent = baseLbl(p); if (lc) lc.textContent = hecho ? "Lo compraste a" : "Compra"; if (g) { g.classList.toggle("es-hecho", hecho); const col = esCollar(p), kind = (col ? "A" : "R") + (p.tipo || ""); g.classList.toggle("es-collar", col || tieneReventa(p)); if (g.dataset.pz !== kind) { g.dataset.pz = kind; drawPiezas(); } }
  document.querySelectorAll("#ppHecho button").forEach(b => b.setAttribute("aria-pressed", String((b.dataset.v === "1") === hecho)));
  el.innerHTML = `<div><span>Costo de fabricación</span><span>${$(c)}</span></div>
    <div style="color:${p.mayor - c < 0 ? "var(--loss)" : "inherit"}"><span>Ganancia por mayor</span><span>${$(p.mayor - c)}</span></div>
    <div class="t" style="color:${p.menor - c < 0 ? "var(--loss)" : "var(--pink-press)"}"><span>Ganancia al detal</span><span>${$(p.menor - c)}</span></div>`;
}

/* Materia prima */
let editingMat = null;
function editMat(id) {
  const nuevo = id == null;
  const m = nuevo ? { id: Math.max(0, ...S.materia.map(x => x.id)) + 1, nombre: "", categoria: "", lugar: "", cantidad: 0, cantidadIngresada: "", presentacion: "unidades", precio: 0, link: "" } : { ...S.materia.find(x => x.id === id) };
  if (!nuevo && m.cantidadIngresada == null) { m.cantidadIngresada = m.cantidad; m.presentacion = "unidades"; }
  openSheet(nuevo ? "Nueva materia prima" : "Editar materia prima", `<div id="matForm" style="display:flex;flex-direction:column;gap:14px"></div>`, () => { editingMat = m; drawMatForm(); });
}
function drawMatForm(focusId) {
  const m = editingMat, box = $id("matForm"); if (!box || !m) return;
  const url = safeUrl(m.link), usan = S.productos.filter(p => insLinks(p).some(l => l.id === m.id));
  box.innerHTML = `
    <div class="row" style="gap:12px;align-items:center" id="mmFoto">${fotoInsBox(m)}</div>
    <div class="field"><span class="lbl">Categoría</span><div class="chips">${catsTodas().map(c => `<button class="chip" type="button" data-action="mm-cat" data-v="${esc(c)}" aria-pressed="${m.categoria === c}">${esc(c)}</button>`).join("")}</div></div>
    ${m.categoria === "Reventa" ? (() => { const actual = m.prodId != null ? +m.prodId : (prodDeIns(m) || {}).codigo; const porTipo = {}; activos().forEach(p => (porTipo[p.tipo || "Sin tipo"] = porTipo[p.tipo || "Sin tipo"] || []).push(p));
      return `<div class="field"><label for="mm_prod">¿Qué producto del catálogo es?</label><select id="mm_prod" data-mm="prodId"><option value="">Escoge el producto…</option>${TIPOS.filter(t => porTipo[t]).concat(Object.keys(porTipo).filter(k => !TIPOS.includes(k))).map(t => `<optgroup label="${esc(t)}">${porTipo[t].sort((a, b) => a.nombre.localeCompare(b.nombre, "es")).map(p => `<option value="${p.codigo}" ${actual === p.codigo ? "selected" : ""}>${esc(p.nombre)}</option>`).join("")}</optgroup>`).join("")}</select><span class="muted small">Queda en la misma categoría del catálogo y su costo se pasa al producto.</span></div>`; })() : ""}
    ${BASES.includes(m.categoria) ? `<label class="row" style="gap:8px"><input type="checkbox" data-mm="predeterminado" ${m.predeterminado ? "checked" : ""}> <span>Usarlo por defecto en todos los productos de ${m.categoria === "Hilo" ? "hilo (manillas)" : m.categoria === "Nailon" ? "nailon (pulseras y collares)" : m.categoria === "Herrajes" ? "herrajes de manillas (balines)" : "cadena (cadenitas)"}</span></label>` : ""}
    ${m.categoria === "Otro" ? `<div class="field"><label for="mm_nuevacat">Nueva categoría (opcional)</label><input id="mm_nuevacat" data-mm="nuevaCat" value="${esc(m.nuevaCat || "")}" placeholder="Ej: Letras, Perlas, Argollas"><span class="muted small">Si la escribes, se crea y te queda para los demás insumos.</span></div>` : ""}
    <div class="field"><label for="mm_nombre">Nombre</label><input id="mm_nombre" data-mm="nombre" value="${esc(m.nombre)}"></div>
    <div class="field"><label for="mm_link">Link de compra</label><input id="mm_link" type="url" data-mm="link" value="${esc(m.link)}" placeholder="https://"></div>
    ${selectProv(m.proveedorId, "mm")}
    ${m.proveedorId === "otro" || (!m.proveedorId && m.lugar && !S.proveedores.length) ? `<div class="field"><label for="mm_lugar">¿Dónde lo compras?</label><input id="mm_lugar" data-mm="lugar" value="${esc(m.lugar)}"></div>` : ""}
    ${camposCompra(m, "mm")}
    <div class="field"><label for="mm_casa">¿Cuánto tienes en casa?</label><div class="row" style="gap:8px"><input id="mm_casa" inputmode="decimal" data-mm="enCasa" value="${tieneCasa(m) ? esc(decTxt(dec(m.enCasa))) : ""}" placeholder="Ej: 15"><span class="muted small" id="mm_casa_u">${infoCat(m).pl}</span></div><span class="muted small">Se descuenta sola cuando armas un producto agotado o vendes uno que tocó hacer.</span></div>
    ${["Hilo", "Nailon", "Herrajes"].includes(catDe(m)) ? `<div class="field"><span class="lbl">Colores que tienes</span><div class="chips" id="mm_colores">${(m.colores || []).map((c, i) => `<span class="chip color-chip">${esc(c)}<button type="button" data-action="mm-color-del" data-i="${i}" aria-label="Quitar ${esc(c)}">×</button></span>`).join("") || '<span class="muted small">Todavía no has puesto colores</span>'}</div>
      <div class="row" style="gap:8px"><input id="mm_color" placeholder="Ej: Rosado pastel" aria-label="Nuevo color"><button class="btn sm" type="button" data-action="mm-color-add">Agregar</button></div></div>` : ""}
    ${url ? `<a class="buy" style="align-self:flex-start" href="${esc(url)}" target="_blank" rel="noopener">Abrir link de compra</a>` : ""}
    ${usan.length ? `<p class="muted small" style="margin:0">Lo usan ${usan.length} producto${usan.length > 1 ? "s" : ""}: ${usan.slice(0, 6).map(p => esc(p.nombre)).join(", ")}${usan.length > 6 ? "…" : ""}. Si cambias el precio, su costo se actualiza solo.</p>` : ""}
    <button class="btn block" type="button" data-action="save-mat">Guardar</button>`;
  if (focusId) { const el = $id(focusId); if (el) el.focus(); }
}

/* Contenido */
let editingC = null;
function editContent(id, preset) {
  const nuevo = id == null;
  const c = nuevo ? { id: "c" + Date.now(), titulo: "", serie: "rebranding", capitulo: "", fechaGrabacion: "", fechaPublicacion: ui.cDia || "", hora: "", plataforma: "TikTok", tipo: "Video", estado: "idea",
    hook: "", guion: "", caption: "", hashtags: "", audio: "", inspiracion: "", link: "", productoCodigo: null, ...(preset || {}) } : { ...S.contenido.find(x => x.id === id) };
  const opt = (arr, v, lab) => arr.map(x => { const val = typeof x === "string" ? x : x.id, t = typeof x === "string" ? (lab ? lab[x] : x) : x.nombre; return `<option value="${esc(val)}" ${val === v ? "selected" : ""}>${esc(t)}</option>`; }).join("");
  const prod = c.productoCodigo ? S.productos.find(p => p.codigo === c.productoCodigo) : null;
  openSheet(nuevo ? "Nuevo contenido" : "Editar contenido", `
    <div class="field"><label for="cc_titulo">Contenido / tema</label><input id="cc_titulo" data-cc="titulo" value="${esc(c.titulo)}" placeholder="Ej: Acompáñame a pasar de esto a esto"></div>
    ${prod ? `<p class="muted small" style="margin:0">Producto: <b>${esc(prod.nombre)}</b> · ${esc(prod.tipo)}</p>` : ""}
    <div class="grid2"><div class="field"><label for="cc_serie">Serie</label><select id="cc_serie" data-cc="serie">${opt(SERIES, c.serie)}</select></div>
      <div class="field"><label for="cc_cap">Capítulo</label><input id="cc_cap" inputmode="numeric" data-cc="capitulo" value="${esc(c.capitulo)}" placeholder="1"></div></div>
    <div class="field"><label for="cc_estado">Estado</label><select id="cc_estado" data-cc="estado">${opt(C_EST, c.estado, C_EST_LABEL)}</select></div>
    <div class="grid2"><div class="field"><label for="cc_fg">Fecha de grabación</label><input id="cc_fg" type="date" data-cc="fechaGrabacion" value="${esc(c.fechaGrabacion)}"></div>
      <div class="field"><label for="cc_fp">Fecha de publicación</label><input id="cc_fp" type="date" data-cc="fechaPublicacion" value="${esc(c.fechaPublicacion)}"></div></div>
    <div class="grid3"><div class="field"><label for="cc_hora">Hora</label><input id="cc_hora" type="time" data-cc="hora" value="${esc(c.hora)}"></div>
      <div class="field"><label for="cc_plat">Red</label><select id="cc_plat" data-cc="plataforma">${opt(PLATAFORMAS, c.plataforma)}</select></div>
      <div class="field"><label for="cc_tipo">Tipo</label><select id="cc_tipo" data-cc="tipo">${opt(C_TIPOS, c.tipo)}</select></div></div>
    <div class="field"><label for="cc_hook">Hook</label><input id="cc_hook" data-cc="hook" value="${esc(c.hook)}" placeholder="La primera frase o texto en pantalla"></div>
    <div class="field"><label for="cc_guion">Guion</label><textarea id="cc_guion" data-cc="guion" rows="5" placeholder="Toma por toma, voz en off o textos">${esc(c.guion)}</textarea></div>
    <div class="field"><label for="cc_caption">Caption</label><textarea id="cc_caption" data-cc="caption" rows="3">${esc(c.caption)}</textarea></div>
    <div class="field"><label for="cc_hash">Hashtags</label><input id="cc_hash" data-cc="hashtags" value="${esc(c.hashtags)}" placeholder="#hechoamano #manillas"></div>
    <div class="field"><label for="cc_audio">Canción o audio</label><input id="cc_audio" data-cc="audio" value="${esc(c.audio)}"></div>
    <div class="field"><label for="cc_insp">Links de inspiración (uno por línea)</label><textarea id="cc_insp" data-cc="inspiracion" rows="3" placeholder="https://www.tiktok.com/...">${esc(c.inspiracion)}</textarea></div>
    <div class="links" id="ccLinks"></div>
    <div class="field"><label for="cc_link">Link de la publicación</label><input id="cc_link" type="url" data-cc="link" value="${esc(c.link)}" placeholder="https://"></div>
    <button class="btn block" type="button" data-action="save-content">Guardar</button>
    <button class="btn block line" type="button" data-action="rec-content">⏰ Recordarme publicar</button>
    ${nuevo ? "" : `<div id="delCBox"><button class="btn block danger" type="button" data-action="del-c-ask">Eliminar contenido</button></div>`}`, () => { editingC = c; drawCLinks(); });
}
function drawCLinks() {
  const el = $id("ccLinks"); if (!el || !editingC) return;
  const urls = [...String(editingC.inspiracion || "").split(/\s+/), editingC.link].map(safeUrl).filter(Boolean);
  el.innerHTML = urls.length ? urls.map(u => `<a href="${esc(u)}" target="_blank" rel="noopener">${esc(u)}</a>`).join("") : "";
}

/* ---------- Excel y respaldo ---------- */
async function entregarArchivo(blob, filename) {
  const file = new File([blob], filename, { type: blob.type });
  try {
    if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: filename }); return; }
  } catch (e) { if (e && e.name === "AbortError") return; }
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = filename;
  document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
}
let xlsxCargado = null;
function cargarXLSX() {
  if (window.XLSX) return Promise.resolve();
  return xlsxCargado || (xlsxCargado = new Promise((ok, mal) => { const s = document.createElement("script"); s.src = "vendor/xlsx.full.min.js?v=" + (window.BLU_VERSION || ""); s.onload = ok; s.onerror = () => { xlsxCargado = null; mal(); }; document.head.appendChild(s); }));
}
async function descargarExcel() {
  toast("Armando el Excel…");
  try { await cargarXLSX(); } catch (e) { toast("No se pudo armar el Excel. Revisa tu conexión"); return; }
  const fila = (p, l) => ({ "N° pedido": p.n, "Fecha": p.fecha, "Estado": EST_LABEL[p.estado], "Cliente": p.cliente, "Cédula": p.cc, "Celular": p.celular, "Ciudad": p.ciudad, "Dirección": p.direccion,
    "Producto": l.nombre, "Tipo": l.tipo, "Cantidad": l.cantidad, "Precio unitario": l.precio, "Subtotal": l.cantidad * l.precio, "Costo": l.cantidad * (l.costo || 0),
    "Envío": p.envio, "Tipo de envío": { contado: "Contado", contraentrega: "Contraentrega", blu: "Lo pagó Blu" }[modoEnvio(p)], "Pago": PAGO_LABEL[pagoDe(p)], "Abono": p.abono || 0, "Saldo": saldo(p), "Precio": p.precioTipo === "mayor" ? "Por mayor" : "Detal", "Canal": CANALES[canalDe(p)] });
  const rows = arr => arr.slice().sort((a, b) => a.n - b.n).flatMap(p => p.lineas.map(l => fila(p, l)));
  const wb = XLSX.utils.book_new();
  const add = (name, data) => XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data.length ? data : [{}]), name);
  add("Pedidos", rows(S.pedidos.filter(p => p.estado !== "entregado")));
  add("Invertido", S.inversiones.slice().sort((a, b) => a.fecha.localeCompare(b.fecha)).map(i => ({ "Fecha": i.fecha, "Qué compré": i.descripcion, "Categoría": i.categoria, "Dónde": i.lugar, "Valor": i.valor, "Detalle": i.detalle })));
  add("Ventas", rows(S.pedidos.filter(p => p.estado === "entregado")));
  add("Inventario", activos().slice().sort((a, b) => a.tipo.localeCompare(b.tipo) || a.nombre.localeCompare(b.nombre)).map(p => ({ "Código": p.codigo, "Nombre": p.nombre, "Tipo": p.tipo, "Stock": p.stock })));
  add("Costos", S.productos.map(p => { const c = costoProd(p); return { "Código": p.codigo, "Nombre": p.nombre, "Tipo": p.tipo, "Remodelación": REMO[remo(p)], "Hilo / cadena": costosDe(p).hilo, "Reventa": esHecho(p) ? "Sí" : "No", "Dije": costosDe(p).dije, "Mostacillas": costosDe(p).mostacillas, "Compra": costosDe(p).compra, "Mano de obra": manoDe(p), "Empaque": empaqueDe(p).total, "Costo total": c, "Precio por mayor": p.mayor, "Ganancia por mayor": p.mayor - c, "Precio detal": p.menor, "Ganancia detal": p.menor - c }; }));
  add("Materia prima", S.materia.map(m => ({ "Categoría": catDe(m) || "Sin categoría", "Nombre": m.nombre, "Lugar": m.lugar, "Cantidad": dec(m.cantidad), "Unidad": infoCat(m).pl, "Precio": m.precio, "Precio por unidad": Math.round(unitario(m) * 10) / 10, "Link": m.link })));
  add("Parrilla", S.contenido.slice().sort((a, b) => (a.fechaPublicacion || "9").localeCompare(b.fechaPublicacion || "9")).map(c => ({ "Fecha grabación": c.fechaGrabacion, "Fecha publicación": c.fechaPublicacion, "Hora": c.hora, "Serie": serie(c.serie).nombre, "Capítulo": c.capitulo, "Contenido": c.titulo, "Hook": c.hook, "Guion": c.guion, "Caption": c.caption, "Hashtags": c.hashtags, "Audio": c.audio, "Plataforma": c.plataforma, "Tipo": c.tipo, "Estado": C_EST_LABEL[c.estado], "Inspiración": c.inspiracion, "Link": c.link })));
  const data = XLSX.write(wb, { type: "array", bookType: "xlsx" });
  entregarArchivo(new Blob([data], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), "Blu Accesories " + today() + ".xlsx");
}
function descargarRespaldo() {
  entregarArchivo(new Blob([JSON.stringify({ app: "blu-gestion", version: 1, fecha: new Date().toISOString(), ...S })], { type: "application/json" }), "Blu respaldo " + today() + ".json");
}
async function importar(file) {
  let d;
  try { d = JSON.parse(await file.text()); } catch (e) { toast("Ese archivo no es un respaldo válido"); return; }
  const rows = [];
  COLS.forEach(col => (Array.isArray(d[col]) ? d[col] : []).forEach(o => { if (o && ID_OF[col](o) != null) rows.push({ user_id: uid, coleccion: col, id: ID_OF[col](o), data: o, actualizado: new Date().toISOString() }); }));
  if (!rows.length) { toast("El archivo no tiene datos de Blu"); return; }
  toast("Importando " + rows.length + " registros…");
  for (let i = 0; i < rows.length; i += 200) {
    const { error } = await sb.from("registros").upsert(rows.slice(i, i + 200));
    if (error) { console.error(error); toast("La importación se cortó. Revisa tu conexión e inténtalo de nuevo"); return; }
  }
  await cargar(); render(); toast("Listo: " + rows.length + " registros importados");
}

/* ---------- Recordatorios de Apple (vía el atajo "Blu Recordatorio") ---------- */
const ATAJO = "Blu Recordatorio";
const localISO = d => d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) + "T" + pad(d.getHours()) + ":" + pad(d.getMinutes());
function horaPorDefecto() { const d = new Date(); d.setSeconds(0, 0); if (d.getHours() >= 18) d.setDate(d.getDate() + 1); d.setHours(18, 0); return localISO(d); }
let recDraft = null;
function abrirRecordatorio(titulo, cuando, notas) {
  recDraft = { titulo, cuando, notas };
  openSheet("Recordatorio", `
    <div class="field"><label for="rc_t">Recordarme</label><input id="rc_t" data-rc="titulo" value="${esc(titulo)}"></div>
    <div class="field"><label for="rc_f">Cuándo</label><input id="rc_f" type="datetime-local" data-rc="cuando" value="${esc(cuando)}"></div>
    <div class="field"><label for="rc_n">Notas</label><textarea id="rc_n" data-rc="notas" rows="4">${esc(notas)}</textarea></div>
    <button class="btn block" type="button" data-action="rec-crear">Crear en Recordatorios</button>
    <p class="muted small" style="margin:0">Se abre Atajos y el recordatorio queda en tu lista “Blu”. La primera vez necesitas crear el atajo: <button class="btn sm ghost" type="button" data-action="ayuda-rec">ver cómo</button></p>`);
}
function crearRecordatorio() {
  const r = recDraft; if (!r || !r.titulo.trim()) { toast("Escribe qué te recuerdo"); return; }
  const fecha = (r.cuando || horaPorDefecto()).replace("T", " ");
  const payload = JSON.stringify({ titulo: r.titulo.trim(), fecha, notas: r.notas || "" });
  closeSheet();
  location.href = "shortcuts://run-shortcut?name=" + encodeURIComponent(ATAJO) + "&input=text&text=" + encodeURIComponent(payload);
}
function ayudaRecordatorios() {
  openSheet("Recordatorios de Apple", `
    <p style="margin:0">Se hace una sola vez en el iPhone (y otra en el iPad si también lo usas ahí).</p>
    <div class="card" style="display:flex;flex-direction:column;gap:8px">
      <h3>1. Crea la lista</h3>
      <p style="margin:0">En la app <b>Recordatorios</b>, crea una lista llamada <b>Blu</b>.</p>
    </div>
    <div class="card" style="display:flex;flex-direction:column;gap:8px">
      <h3>2. Crea el atajo</h3>
      <p style="margin:0">En la app <b>Atajos</b> toca <b>+</b> y ponle de nombre exactamente <b>Blu Recordatorio</b>. Agrega estas acciones en orden:</p>
      <ol style="margin:0;padding-left:20px;display:flex;flex-direction:column;gap:6px">
        <li><b>Obtener diccionario de</b> → <i>Entrada del atajo</i></li>
        <li><b>Obtener valor de</b> la clave <b>titulo</b> en <i>Diccionario</i></li>
        <li><b>Obtener valor de</b> la clave <b>fecha</b> en <i>Diccionario</i></li>
        <li><b>Obtener valor de</b> la clave <b>notas</b> en <i>Diccionario</i></li>
        <li><b>Añadir recordatorio nuevo</b>: en el texto pon el valor de <b>titulo</b>, en la lista escoge <b>Blu</b>, toca la flecha para ver más opciones, activa la alerta y en la fecha pon el valor de <b>fecha</b>; en notas, el valor de <b>notas</b>.</li>
      </ol>
      <p class="muted small" style="margin:0">Si Atajos pregunta qué recibe el atajo, escoge <b>Texto</b>.</p>
    </div>
    <div class="card" style="display:flex;flex-direction:column;gap:8px">
      <h3>3. Pruébalo</h3>
      <button class="btn" type="button" data-action="rec-prueba">Crear recordatorio de prueba</button>
      <p class="muted small" style="margin:0">Debe aparecer en la lista Blu con la hora que pusiste. Si sale “no se encontró el atajo”, revisa que el nombre sea exactamente <b>Blu Recordatorio</b>.</p>
    </div>`);
}

/* ---------- Toast ---------- */
let tt;
function toast(msg) { const r = $id("toastRoot"); r.innerHTML = `<div class="toast" role="status">${esc(msg)}</div>`; clearTimeout(tt); tt = setTimeout(() => r.innerHTML = "", 2800); }

/* Búsqueda instantánea: oculta filas sin redibujar la pantalla (el teclado no se cierra) */
let _fq = null;
function filtrarFilas(valor) {
  if (_fq) cancelAnimationFrame(_fq);
  _fq = requestAnimationFrame(() => {
    const q = buscaEn(valor); let n = 0;
    document.querySelectorAll("#app [data-s]").forEach(el => { const ok = !q || el.dataset.s.includes(q); if (el.hidden === ok) el.hidden = !ok; if (ok) n++; });
    const c = $id("cuentaQ"); if (c) c.textContent = n;
  });
}

/* ---------- Eventos ---------- */
document.addEventListener("click", e => {
  if (e.target.closest("a[href]")) return;
  const t = e.target.closest("[data-tab],[data-action]"); if (!t) return;
  if (t.dataset.tab) { go(t.dataset.tab); return; }
  const a = t.dataset.action, v = t.dataset.v;
  if (a === "close-bg" && e.target !== t) return;
  const prodC = () => S.productos.find(x => x.codigo === +t.dataset.c);
  switch (a) {
    case "tab": go(v); break;
    case "reintentar": iniciar({ user: { id: uid, email } }); break;
    case "filtro-ped": if (v === "entregado") go("ventas"); else { ui.pedFiltro = v; go("pedidos"); } break;
    case "new-order": newOrder(); break;
    case "close": case "close-bg": closeSheet(); break;
    case "ptipo": draft.precioTipo = v; draft.lineas.forEach(l => { const p = S.productos.find(x => x.codigo === l.codigo); if (p) l.precio = priceFor(p, v); }); drawOrderForm(); break;
    case "envmodo": draft.envioModo = v; if (v === "contraentrega" && !+draft.envio) { draft.envioAuto = true; autoEnvio(); } drawOrderForm(); break;
    case "usar-envio": draft.envio = +v; draft.envioAuto = false; drawOrderForm(); break;
    case "pago": draft.pago = v; if (v === "abono" && !draft.abono) draft.abono = Math.round(pedTotal(draft) / 2); drawOrderForm(); break;
    case "add-line": { const p = prodC(); const ex = draft.lineas.find(l => l.codigo === p.codigo);
      if (ex) ex.cantidad++; else draft.lineas.push({ codigo: p.codigo, nombre: p.nombre, tipo: p.tipo, cantidad: 1, precio: priceFor(p, draft.precioTipo), costo: costoProd(p) });
      draft.q = ""; drawOrderForm(); break; }
    case "del-line": draft.lineas.splice(+t.dataset.i, 1); drawOrderForm(); break;
    case "canal": draft.canal = v; drawOrderForm(); break;
    case "set-canal": { const p = S.pedidos.find(x => x.id === t.dataset.id); p.canal = v; guardar("pedidos", p); render(); verPedido(p.id); break; }
    case "edit-lineas": editPed.abierto = true; drawEditLineas(); break;
    case "cancel-lineas": { const p = S.pedidos.find(x => x.id === editPed.id); editPed = { id: p.id, lineas: p.lineas.map(l => ({ ...l })), abierto: false }; drawEditLineas(); break; }
    case "eq": { const l = editPed.lineas[+t.dataset.i]; l.cantidad = Math.max(1, l.cantidad + (+t.dataset.d)); drawEditLineas(); break; }
    case "save-lineas": { const p = S.pedidos.find(x => x.id === editPed.id);
      if (!p.importado) editPed.lineas.forEach((l, i) => { const antes = p.lineas[i], pr = S.productos.find(x => x.codigo === l.codigo);
        if (pr && antes && l.cantidad !== antes.cantidad) { pr.stock -= (l.cantidad - antes.cantidad); guardar("productos", pr); } });
      p.lineas = editPed.lineas.map(l => ({ ...l })); guardar("pedidos", p); render(); verPedido(p.id); toast("Pedido #" + p.n + " actualizado"); break; }
    case "rec-ped": { const p = S.pedidos.find(x => x.id === t.dataset.id); const empacar = etapa(p) === "pendiente";
      const items = p.lineas.map(l => `${l.cantidad} × ${l.nombre}${l.tarjeta ? " (tarjeta personalizada)" : ""}`).join("\n");
      abrirRecordatorio((empacar ? "Empacar" : "Enviar") + " pedido #" + p.n + " · " + p.cliente, horaPorDefecto(),
        items + (empacar ? "" : `\n\n${p.ciudad}\n${p.direccion}\nCel ${p.celular || "—"} · CC ${p.cc || "—"}\nEnvío ${modoEnvio(p) === "contraentrega" ? "contraentrega" : "contado"}`)); break; }
    case "rec-content": { const c = editingC; const cuando = c.fechaPublicacion ? c.fechaPublicacion + "T" + (c.hora || "18:00") : horaPorDefecto();
      abrirRecordatorio("Publicar: " + (c.titulo || "contenido") + (c.plataforma ? " (" + c.plataforma + ")" : ""), cuando,
        [c.hook && "Hook: " + c.hook, c.caption && "Caption: " + c.caption, c.hashtags, c.audio && "Audio: " + c.audio].filter(Boolean).join("\n\n")); break; }
    case "rec-crear": crearRecordatorio(); break;
    case "ayuda-rec": ayudaRecordatorios(); break;
    case "rec-prueba": { const d = new Date(Date.now() + 2 * 60000); recDraft = { titulo: "Prueba de Blu Gestión", cuando: localISO(d), notas: "Si ves esto, los recordatorios funcionan." }; crearRecordatorio(); break; }
    case "tarjeta": draft.lineas[+t.dataset.i].tarjeta = v === "1"; drawOrderForm(); break;
    case "qty": { const l = draft.lineas[+t.dataset.i]; l.cantidad = Math.max(1, l.cantidad + (+t.dataset.d)); drawOrderForm(); break; }
    case "save-order": saveOrder(); break;
    case "organizar": aplicarOrganizado(); break;
    case "pegar": navigator.clipboard.readText().then(txt => { if (!txt) { toast("No hay nada copiado"); return; } draft.pegado = txt; aplicarOrganizado(); })
      .catch(() => toast("No se pudo pegar. Mantén presionado el cuadro y toca Pegar")); break;
    case "pago-completo": { const p = S.pedidos.find(x => x.id === t.dataset.id); p.pago = "pagado"; p.pagado = true; p.abono = 0; guardar("pedidos", p); render(); toast("Pedido #" + p.n + " pagado · pasó a Pedido pendiente"); break; }
    case "avanzar": { const p = S.pedidos.find(x => x.id === t.dataset.id); p.estado = p.estado === "perdido" ? "enviado" : ESTADOS[ESTADOS.indexOf(p.estado) + 1]; guardar("pedidos", p); render();
      toast(p.estado === "entregado" ? "Pedido #" + p.n + " entregado · pasó a Ventas" : "Pedido #" + p.n + ": " + EST_LABEL[p.estado].toLowerCase()); break; }
    case "ver": verPedido(t.dataset.id); break;
    case "set-pago": { const p = S.pedidos.find(x => x.id === t.dataset.id); p.pago = v; p.pagado = v === "pagado"; if (v === "abono" && !p.abono) p.abono = Math.round(pedTotal(p) / 2); if (v !== "abono") p.abono = 0; guardar("pedidos", p); render(); verPedido(p.id); break; }
    case "perdido": { const p = S.pedidos.find(x => x.id === t.dataset.id); p.estado = "perdido"; guardar("pedidos", p); closeSheet(); render(); toast("Pedido #" + p.n + " marcado como envío perdido"); break; }
    case "v-seg": ui.ventasSeg = v; render(); break;
    case "v-est": ui.ventasEst = v; render(); break;
    case "ir-ventas": ui.ventasSeg = "ventas"; ui.ventasEst = v; ui.ventasMes = ""; go("ventas"); break;
    case "new-inv": editInv(null); break;
    case "edit-inv": editInv(t.dataset.id); break;
    case "save-inv": { const i = editingInv; if (!i.descripcion.trim() || !i.valor) { toast("Escribe qué compraste y el valor"); return; }
      const k = S.inversiones.findIndex(x => x.id === i.id); if (k >= 0) S.inversiones[k] = i; else S.inversiones.push(i);
      guardar("inversiones", i); closeSheet(); ui.ventasSeg = "invertido"; if (tab !== "ventas") go("ventas"); else render(); toast("Compra guardada"); break; }
    case "del-inv-ask": $id("delIBox").innerHTML = `<div class="warn">¿Eliminar esta compra?</div><div class="row" style="margin-top:8px"><button class="btn danger grow" type="button" data-action="del-inv-yes">Sí, eliminar</button><button class="btn ghost grow" type="button" data-action="close">No</button></div>`; break;
    case "del-inv-yes": { const id = editingInv.id; S.inversiones = S.inversiones.filter(x => x.id !== id); borrar("inversiones", id); closeSheet(); render(); toast("Compra eliminada"); break; }
    case "retroceder": { const p = S.pedidos.find(x => x.id === t.dataset.id); p.estado = ESTADOS[ESTADOS.indexOf(p.estado) - 1]; guardar("pedidos", p); render(); verPedido(p.id); break; }
    case "cancel-ask": { const p = S.pedidos.find(x => x.id === t.dataset.id);
      $id("cancelBox").innerHTML = `<div class="warn">${p.estado === "entregado" ? "¿Borrar esta venta? Se quita del historial; el inventario no cambia." : "¿Cancelar este pedido? Las unidades vuelven al inventario."}</div>
      <div class="row" style="margin-top:8px"><button class="btn danger grow" type="button" data-action="cancel-yes" data-id="${p.id}">Sí, ${p.estado === "entregado" ? "borrar" : "cancelar"}</button><button class="btn ghost grow" type="button" data-action="close">No</button></div>`; break; }
    case "cancel-yes": { const i = S.pedidos.findIndex(x => x.id === t.dataset.id), p = S.pedidos[i];
      if (!p.importado && p.estado !== "entregado") p.lineas.forEach(l => { const pr = S.productos.find(x => x.codigo === l.codigo); if (pr) { pr.stock += l.cantidad; guardar("productos", pr); } });
      S.pedidos.splice(i, 1); borrar("pedidos", p.id); closeSheet(); render(); toast(p.estado === "entregado" ? "Venta borrada" : "Pedido cancelado"); break; }
    case "stock": { const p = prodC(); p.stock = Math.max(0, p.stock + (+t.dataset.d)); guardar("productos", p);
      const b = t.parentElement.querySelector("b"); if (b) { b.textContent = p.stock; b.classList.toggle("zero", p.stock <= 0); } else render(); break; }
    case "stock-tipo": ui.stockTipo = v; render(); break;
    case "seg": ui.catSeg = v; ui.catQ = ""; render(); break;
    case "rem-filtro": ui.remFiltro = v; render(); break;
    case "remate-precio": pedirPrecioRemate(prodC()); break;
    case "remate-ok": { const p = S.productos.find(x => x.codigo === remateDraft.codigo); const pr = num(remateDraft.precio); if (!pr) { toast("Escribe el precio de remate"); return; }
      p.remodelacion = "remate"; p.precioRemate = pr; guardar("productos", p); closeSheet(); render(); toast(p.nombre + " en remate a " + $(pr)); break; }
    case "remo": { const p = prodC(); if (v === "remate") { pedirPrecioRemate(p); break; } const antes = remo(p); p.remodelacion = v; guardar("productos", p); render();
      toast(v === "archivado" ? p.nombre + " archivado" : antes === "archivado" ? p.nombre + " recuperado" : p.nombre + ": " + REMO[v].toLowerCase()); break; }
    case "video-prod": { const p = prodC(); const caps = S.contenido.filter(c => c.serie === "rebranding").map(c => +c.capitulo || 0);
      editContent(null, { serie: "rebranding", titulo: "Acompáñame a pasar de esto a esto: " + p.nombre, productoCodigo: p.codigo, capitulo: String(Math.max(0, ...caps) + 1) }); break; }
    case "edit-prod": editProd(+t.dataset.c); break;
    case "ins-nuevo": insForm = { proveedorId: "", categoria: "", link: "", nombre: "", lugar: "", cantidadIngresada: "", presentacion: "unidades", precio: 0, cuentasPorGramo: "" }; drawProdIns(); break;
    case "inf-pres": insForm.presentacion = v; drawProdIns(); break;
    case "mm-pres": editingMat.presentacion = v; drawMatForm(); break;
    case "ins-cancelar": insForm = null; drawProdIns(); break;
    case "ins-quitar": editing.insumos = insLinks(editing).filter(l => l.id !== +t.dataset.id); drawProdIns(); break;
    case "ins-crear": { const f = insForm; if (!f.nombre.trim()) { toast("Ponle nombre al insumo"); return; }
      if (!baseCantidad(f) || !num(f.precio)) { toast("Escribe la cantidad y el precio que pagaste"); return; }
      const m = { id: Math.max(0, ...S.materia.map(x => x.id)) + 1, nombre: f.nombre.trim(), categoria: f.categoria, proveedorId: +f.proveedorId || undefined, lugar: (+f.proveedorId ? (S.proveedores.find(v => v.id === +f.proveedorId) || {}).nombre : (f.lugar || lugarDeLink(f.link) || "")).trim(), cantidad: baseCantidad(f), cantidadIngresada: dec(f.cantidadIngresada), presentacion: f.presentacion, precio: num(f.precio), link: f.link.trim(), cuentasPorGramo: num(f.cuentasPorGramo) || undefined, porTira: f.presentacion === "tiras" ? dec(f.porTira) : undefined, porGramo: f.presentacion === "gramos" ? dec(f.porGramo) || undefined : undefined };
      S.materia.push(m); guardar("materia", m); editing.insumos = [...insLinks(editing), { id: m.id, usa: 1 }]; insForm = null; drawProdIns(); toast(m.nombre + " quedó en Materia prima"); break; }
    case "ver-prod": verProd(+t.dataset.c); break;
    case "arme": { const p = prodC(); p.stock = Math.max(0, p.stock) + 1; gastarMateria(p, 1); guardar("productos", p); render(); verProd(p.codigo); toast("Listo: +1 en stock y se descontó la materia prima"); break; }
    case "stock-det": { const p = prodC(); p.stock = Math.max(0, p.stock + (+t.dataset.d)); guardar("productos", p); render(); verProd(p.codigo); break; }
    case "new-prod": editProd(null); break;
    case "quitar-foto": { const p = editing, vieja = p.foto; p.foto = ""; const real = S.productos.find(x => x.codigo === p.codigo);
      if (real) { real.foto = ""; guardar("productos", real); render(); } if (vieja) sb.storage.from("fotos").remove([vieja]).catch(() => {}); drawProdFoto(); break; }
    case "save-prod": { const p = editing; ["hilo", "dije", "mostacillas", "compra", "manoObra", "empaque", "mayor", "menor"].forEach(k => p[k] = n0(p[k]));
      p.insumos = insLinks(p).map(l => ({ id: l.id, usa: dec(l.usa) || 1 })); if (usaInsumos(p)) Object.assign(p, materialesDe(p)); p.stock = parseInt(p.stock, 10) || 0; if (!p.nombre.trim()) { toast("Ponle nombre al producto"); return; }
      const i = S.productos.findIndex(x => x.codigo === p.codigo); if (i >= 0) S.productos[i] = p; else S.productos.push(p);
      guardar("productos", p); closeSheet(); render(); toast("Producto guardado"); break; }
    case "edit-mat": editMat(+t.dataset.id); break;
    case "new-mat": editMat(null); break;
    case "mat-cat": ui.matCat = v === "*" ? null : v; render(); break;
    case "mat-seg": ui.matSeg = v; ui.matQ = ""; render(); break;
    case "new-prov": editProv(null); break;
    case "ver-prov": verProv(+t.dataset.id); break;
    case "edit-prov": editProv(+t.dataset.id); break;
    case "quitar-logo": { const vieja = editingProv.logo; editingProv.logo = ""; if (vieja) sb.storage.from("fotos").remove([vieja]).catch(() => {}); const real = S.proveedores.find(x => x.id === editingProv.id); if (real) { real.logo = ""; guardar("proveedores", real); } drawProvLogo(); break; }
    case "ver-kit": closeSheet(); ui.matSeg = "empaque"; go("materia"); break;
    case "kit-edit": editKit(t.dataset.id); break;
    case "pp-extra": { const d = +t.dataset.d, antes = n0(editing.balinesExtra), nuevo = Math.max(0, antes + d); if (nuevo === antes) break; editing.balinesExtra = nuevo;
      const bd = baseDefecto("Herrajes"); if (bd) editing.insumos = insLinks(editing).map(l => l.id === bd.id ? { ...l, usa: Math.max(0, dec(l.usa) + (nuevo - antes)) } : l);
      drawProdIns(); break; }
    case "pp-talla": { editing.talla = v; const nl = insLinks(editing).find(l => { const m = S.materia.find(x => x.id === l.id); return m && catDe(m) === "Nailon"; }); if (nl) nl.usa = nailonCollar(editing), editing.insumos = insLinks(editing).map(l => l.id === nl.id ? nl : l); drawProdIns(); break; }
    case "pp-hecho": { if (v === "0" && insLinks(editing).some(l => { const m = S.materia.find(x => x.id === l.id); return m && catDe(m) === "Reventa"; })) { toast("Quítale primero el insumo “Reventa” de abajo"); break; } editing.hecho = v === "1"; drawProdTot(); break; }
    case "kit-save": { const it = editingKit; if (!String(it.nombre).trim()) { toast("Ponle nombre"); return; } it.nombre = it.nombre.trim(); if (+it.proveedorId) it.proveedorId = +it.proveedorId; else delete it.proveedorId;
      const k = kit(), i = k.items.findIndex(x => x.id === it.id); if (i >= 0) k.items[i] = it; else k.items.push(it);
      guardar("ajustes", k); closeSheet(); render(); toast("Empaque actualizado en todos los productos"); break; }
    case "kit-del": { const k = kit(); k.items = k.items.filter(x => x.id !== editingKit.id); guardar("ajustes", k); closeSheet(); render(); toast("Quitado del empaque"); break; }
    case "save-prov": { const v = editingProv; if (!v.nombre.trim()) { toast("Ponle nombre al proveedor"); return; } v.nombre = v.nombre.trim();
      const i = S.proveedores.findIndex(x => x.id === v.id); if (i >= 0) S.proveedores[i] = v; else S.proveedores.push(v);
      S.materia.filter(m => m.proveedorId === v.id && m.lugar !== v.nombre).forEach(m => { m.lugar = v.nombre; guardar("materia", m); });
      guardar("proveedores", v); closeSheet(); ui.matSeg = "proveedores"; if (tab !== "materia") go("materia"); else render(); toast("Proveedor guardado"); break; }
    case "copiar": { const txt = v; (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject()).then(() => toast("Copiado"), () => toast(txt)); break; }
    case "mm-color-add": { const el = $id("mm_color"), c = el && el.value.trim(); if (!c) { toast("Escribe el color"); break; } editingMat.colores = [...(editingMat.colores || []), c.charAt(0).toUpperCase() + c.slice(1)]; drawMatForm("mm_color"); break; }
    case "mm-color-del": editingMat.colores = (editingMat.colores || []).filter((_, i) => i !== +t.dataset.i); drawMatForm(); break;
    case "mm-cat": editingMat.categoria = editingMat.categoria === v ? "" : v; drawMatForm(v === "Otro" && editingMat.categoria === "Otro" ? "mm_nuevacat" : undefined); break;
    case "mm-traer": { const m = editingMat; toast("Buscando la foto…"); fotoDeLink(m.link).then(img => { if (editingMat !== m) return; if (img) { m.foto = img; m.fotoIntento = m.link; const b = $id("mmFoto"); if (b) b.innerHTML = fotoInsBox(m); toast("Foto lista. Dale Guardar"); } else toast(img === null ? "No se pudo conectar. Intenta otra vez" : "Esa página no deja sacar la foto. Súbela tú"); }); break; }
    case "mm-quitar-foto": { const m = editingMat; m.foto = ""; m.fotoIntento = m.link; const b = $id("mmFoto"); if (b) b.innerHTML = fotoInsBox(m); break; }
    case "save-mat": { const m = editingMat; if (!m.nombre.trim()) { toast("Ponle nombre"); return; }
      if (m.nuevaCat && m.nuevaCat.trim()) { const nc = m.nuevaCat.trim(), cap = nc.charAt(0).toUpperCase() + nc.slice(1), ya = catsTodas().find(c => c.toLowerCase() === cap.toLowerCase()); m.categoria = ya || cap; } delete m.nuevaCat;
      m.link = extraerUrl(m.link);
      if (m.predeterminado && BASES.includes(m.categoria)) S.materia.filter(x => x.id !== m.id && x.predeterminado && catDe(x) === m.categoria).forEach(x => { x.predeterminado = false; guardar("materia", x); }); else if (!BASES.includes(m.categoria)) delete m.predeterminado;
      if (+m.proveedorId) { m.proveedorId = +m.proveedorId; m.lugar = (S.proveedores.find(v => v.id === m.proveedorId) || {}).nombre || m.lugar; } else delete m.proveedorId;
      if (m.enCasa === "" || m.enCasa == null) delete m.enCasa; else m.enCasa = dec(m.enCasa);
      m.cantidadIngresada = dec(m.cantidadIngresada); m.cantidad = baseCantidad(m) || m.cantidad; m.precio = num(m.precio); if (m.cuentasPorGramo) m.cuentasPorGramo = num(m.cuentasPorGramo); if (m.porTira) m.porTira = dec(m.porTira); if (m.presentacion === "gramos") m.porGramo = dec(m.porGramo) || undefined; else delete m.porGramo;
      const pid = m.prodId; delete m.prodId;
      const i = S.materia.findIndex(x => x.id === m.id); if (i >= 0) S.materia[i] = m; else S.materia.push(m); guardar("materia", m);
      if (m.categoria === "Reventa" && pid !== undefined) { const nuevo = pid === "" ? null : S.productos.find(p => p.codigo === +pid);
        S.productos.forEach(p => { if (p === nuevo) return; if (insLinks(p).some(l => l.id === m.id)) { p.insumos = insLinks(p).filter(l => l.id !== m.id); guardar("productos", p); } });
        if (nuevo) { nuevo.insumos = insLinks(nuevo).filter(l => { const x = S.materia.find(y => y.id === l.id); return !x || catDe(x) !== "Reventa"; }).concat({ id: m.id, usa: 1 }); nuevo.hecho = true; guardar("productos", nuevo); } }
      closeSheet(); render(); toast("Guardado"); break; }
    case "new-content": editContent(null); break;
    case "edit-content": editContent(t.dataset.id); break;
    case "save-content": { const c = editingC; if (!c.titulo.trim()) { toast("Ponle un tema al contenido"); return; }
      const i = S.contenido.findIndex(x => x.id === c.id); if (i >= 0) S.contenido[i] = c; else S.contenido.push(c);
      if (c.fechaPublicacion) ui.cMes = c.fechaPublicacion.slice(0, 7);
      guardar("contenido", c); closeSheet(); if (tab !== "contenido") go("contenido"); else render(); toast("Contenido guardado"); break; }
    case "del-c-ask": $id("delCBox").innerHTML = `<div class="warn">¿Eliminar este contenido? No se puede deshacer.</div>
      <div class="row" style="margin-top:8px"><button class="btn danger grow" type="button" data-action="del-c-yes">Sí, eliminar</button><button class="btn ghost grow" type="button" data-action="close">No</button></div>`; break;
    case "del-c-yes": { const id = editingC.id; S.contenido = S.contenido.filter(x => x.id !== id); borrar("contenido", id); closeSheet(); render(); toast("Contenido eliminado"); break; }
    case "c-vista": ui.cVista = v; render(); break;
    case "c-serie": ui.cSerie = v; render(); break;
    case "c-dia": ui.cDia = ui.cDia === v ? "" : v; render(); break;
    case "c-mes": { const [y, m] = ui.cMes.split("-").map(Number); const d = new Date(y, m - 1 + (+t.dataset.d), 1); ui.cMes = d.getFullYear() + "-" + pad(d.getMonth() + 1); ui.cDia = ""; render(); break; }
    case "actualizar": buscarActualizacion(true); break;
    case "excel": descargarExcel(); break;
    case "respaldo": descargarRespaldo(); break;
    case "logout": sb.auth.signOut().then(() => { S = { productos: [], materia: [], pedidos: [], contenido: [], inversiones: [], proveedores: [], ajustes: [] }; uid = null; iniciar(null); }); break;
  }
});
document.addEventListener("keydown", e => {
  if ((e.key === "Enter" || e.key === " ") && e.target.matches(".tappable,.ccard")) { e.preventDefault(); e.target.click(); }
  if (e.key === "Escape" && sheetRoot.innerHTML) closeSheet();
});
document.addEventListener("input", e => {
  const t = e.target;
  if (t.dataset.mm === "link" || t.dataset.inf === "link") { const u = extraerUrl(t.value); if (u !== t.value.trim() && /^https?:/i.test(u)) t.value = u; }
  if (t.dataset.palabra != null && editing) { const i = +t.dataset.palabra, id = +t.dataset.ins; editing.palabras = Array.from({ length: usaBase(editing) }, (_, k) => k === i ? t.value : (editing.palabras || [])[k] || "");
    const n = contarLetras(editing.palabras); editing.insumos = linksEf(editing).map(({ defecto, ...x }) => x.id === id ? { ...x, usa: n } : x);
    const m = S.materia.find(x => x.id === id), ps = $id("pzsub_" + id), pn = $id("pal_n"), ui3 = document.querySelector('[data-pzusa="' + id + '"]'); if (ps && m) ps.textContent = $u(unitario(m) * n); if (pn) pn.textContent = n + " letras"; if (ui3) ui3.value = n;
    window._noPz = true; bloquearCostos(); window._noPz = false; return; }
  if (t.dataset.pzusa && editing) { const id = +t.dataset.pzusa, u = dec(t.value); editing.insumos = linksEf(editing).map(({ defecto, ...x }) => x.id === id ? { ...x, usa: u } : x);
    const m = S.materia.find(x => x.id === id), ps = $id("pzsub_" + id), ui2 = $id("usa_" + id), s2 = $id("sub_" + id); if (m && ps) ps.textContent = $u(unitario(m) * u); if (ui2) ui2.value = decTxt(u); if (m && s2) s2.textContent = $u(unitario(m) * u);
    window._noPz = true; bloquearCostos(); window._noPz = false; return; }
  if (t.classList && t.classList.contains("money-in")) { const n = num(t.value), f = miles(n); if (t.value !== f) { t.value = f; try { t.setSelectionRange(f.length, f.length); } catch (er) { } } }
  if (t.dataset.input) { ui[t.dataset.input] = t.value; filtrarFilas(t.value); return; }
  if (t.dataset.f && draft) { const k = t.dataset.f; draft[k] = (k === "envio" || k === "abono") ? num(t.value) : t.value;
    if (k === "envio") draft.envioAuto = false;
    if (k === "ciudad") { clearTimeout(window._ct); window._ct = setTimeout(() => { if (!draft) return; autoEnvio(); drawOrderForm("f_ciudad"); }, 500); }
    if (k === "q" || k === "envio" || k === "abono") drawOrderForm(t.id); return; }
  if (t.dataset.ep && editPed) { editPed.lineas[+t.dataset.ep].precio = num(t.value); const s = $id("epSub"); if (s) s.textContent = $(editPed.lineas.reduce((a, l) => a + l.cantidad * l.precio, 0)); return; }
  if (t.dataset.lp && draft) { draft.lineas[+t.dataset.lp].precio = num(t.value); drawOrderForm(t.id); return; }
  if (t.dataset.pp === "tipo" && editing && editing.tipo !== t.value) {
    const antes = editing.tipo; if (!n0(editing.manoObra) || n0(editing.manoObra) === MO_CAT[antes]) { editing.manoObra = MO_CAT[t.value] || 0; const mo = $id("pp_manoObra"); if (mo) mo.value = miles(editing.manoObra); }
  }
  if (t.dataset.pp && editing) { const k = t.dataset.pp; editing[k] = (k === "nombre" || k === "tipo") ? t.value : (k === "stock" ? (parseInt(t.value, 10) || 0) : num(t.value));
    if (k === "menor") { editing.mayor = Math.round(editing.menor * 0.8 / 100) * 100; const em = $id("pp_mayor"); if (em) em.value = miles(editing.mayor) || ""; }
    drawProdTot(); return; }
  if (t.dataset.mm && editingMat) { const k = t.dataset.mm; editingMat[k] = t.type === "checkbox" ? t.checked : t.value;
    if (k === "link") { const m = editingMat; clearTimeout(window._linkT); window._linkT = setTimeout(() => { const b = $id("mmFoto"); if (b && editingMat === m) b.innerHTML = fotoInsBox(m); if (!m.foto && safeUrl(m.link)) fotoDeLink(m.link).then(img => { if (img && editingMat === m && !m.foto) { m.foto = img; m.fotoIntento = m.link; const b2 = $id("mmFoto"); if (b2) b2.innerHTML = fotoInsBox(m); } }); }, 700); }
    if (k === "link") { const v = provPorLink(t.value), el = $id("mm_prov"); if (v && el && !el.value) { editingMat.proveedorId = v.id; el.value = String(v.id); } else { const l = lugarDeLink(t.value), le = $id("mm_lugar"); if (l && le && !le.value) { editingMat.lugar = l; le.value = l; } } }
    if (k === "proveedorId") { drawMatForm(); return; }
    refrescarPU(editingMat, "mm"); return; }
  if (t.dataset.usa && editing) { const id = +t.dataset.usa, l = insLinks(editing).map(x => x.id === id ? { ...x, usa: dec(t.value) } : x); editing.insumos = l;
    const m = S.materia.find(x => x.id === id), s = $id("sub_" + id), un = $id("uni_" + id); if (m && s) s.textContent = $u(unitario(m) * dec(t.value)); if (m && un) un.textContent = unidadTxt(m, dec(t.value)); bloquearCostos(); return; }
  if (t.dataset.inf && insForm) { const k = t.dataset.inf; insForm[k] = t.value;
    if (k === "link") { const v = provPorLink(t.value), el = $id("inf_prov"); if (v && el && !el.value) { insForm.proveedorId = v.id; el.value = String(v.id); } }
    if (k === "proveedorId") { drawProdIns(); return; }
    if (k === "categoria") { drawProdIns(); return; }
    refrescarPU(insForm, "inf"); return; }
  if (t.dataset.remate && remateDraft) { remateDraft.precio = t.value; return; }
  if (t.dataset.pv && editingProv) { editingProv[t.dataset.pv] = t.value; return; }
  if (t.dataset.kit && editingKit) { const k = t.dataset.kit; editingKit[k] = k === "caja" ? t.checked : k === "precio" ? (t.value.trim() === "" ? "" : num(t.value)) : k === "rinde" ? t.value : t.value; const c = $id("ktCosto"); if (c) c.textContent = $u(kitCosto(editingKit)); return; }
  if (t.dataset.rc && recDraft) { recDraft[t.dataset.rc] = t.value; return; }
  if (t.dataset.iv && editingInv) { editingInv[t.dataset.iv] = t.dataset.iv === "valor" ? num(t.value) : t.value; return; }
  if (t.dataset.abono) { const p = S.pedidos.find(x => x.id === t.dataset.abono); if (p) { p.abono = num(t.value); clearTimeout(p._t); p._t = setTimeout(() => { delete p._t; guardar("pedidos", p); render(); }, 600); } return; }
  if (t.dataset.cc && editingC) { editingC[t.dataset.cc] = t.value; if (t.dataset.cc === "inspiracion" || t.dataset.cc === "link") drawCLinks(); }
});
document.addEventListener("change", e => {
  const t = e.target;
  if (t.dataset.change === "mes") { ui.ventasMes = t.value; render(); }
  if (t.dataset.pieza && editing) { const cat = t.dataset.pieza, old = +t.dataset.old || 0, base = BASES.includes(cat);
    let ls = linksEf(editing).map(({ defecto, ...x }) => x);
    const prev = old && ls.find(l => l.id === old); ls = ls.filter(l => l.id !== old);
    if (t.value) { const usa = prev ? prev.usa : usaDefecto(cat, editing); ls.push({ id: +t.value, usa }); }
    editing.insumos = ls; drawProdIns(); return; }
  if (t.dataset.ins === "sel" && editing && t.value) { editing.insumos = [...insLinks(editing), { id: +t.value, usa: 1 }]; drawProdIns(); return; }
  if (t.dataset.change === "invmes") { ui.invMes = t.value; render(); }
  if (t.dataset.iv && editingInv) editingInv[t.dataset.iv] = t.value;
  if (t.dataset.pp === "tipo" && editing && editing.tipo !== t.value) {
    const antes = editing.tipo; if (!n0(editing.manoObra) || n0(editing.manoObra) === MO_CAT[antes]) { editing.manoObra = MO_CAT[t.value] || 0; const mo = $id("pp_manoObra"); if (mo) mo.value = miles(editing.manoObra); }
  }
  if (t.dataset.pp && editing && (t.dataset.pp === "nombre" || t.dataset.pp === "tipo")) { editing[t.dataset.pp] = t.value; drawProdTot(); }
  if (t.dataset.cc && editingC) editingC[t.dataset.cc] = t.value;
  if (t.id === "fileImport" && t.files && t.files[0]) importar(t.files[0]);
  if (t.id === "mmFotoIn" && t.files && t.files[0] && editingMat) { const m = editingMat; subirFotoIns(m, t.files[0]).then(ok => { if (!ok) return;
    const real = S.materia.find(x => x.id === m.id); if (real) { real.foto = m.foto; guardar("materia", real); } const b = $id("mmFoto"); if (b && editingMat === m) b.innerHTML = fotoInsBox(m); toast("Foto guardada"); }); }
  if (t.id === "pvLogoIn" && t.files && t.files[0] && editingProv) { const v = editingProv; subirLogo(v, t.files[0]).then(ok => { if (!ok) return;
    const real = S.proveedores.find(x => x.id === v.id); if (real) { real.logo = v.logo; guardar("proveedores", real); render(); } if (editingProv === v) drawProvLogo(); toast("Logo guardado"); }); }
  if (t.id === "ppFotoIn" && t.files && t.files[0] && editing) { const p = editing; subirFoto(p, t.files[0]).then(ok => {
    if (!ok) return; const real = S.productos.find(x => x.codigo === p.codigo);
    if (real) { real.foto = p.foto; guardar("productos", real); render(); }
    if (editing === p) drawProdFoto(); toast("Foto guardada"); }); }
});

/* ---------- Actualizaciones: el iPhone guarda la app; si hay versión nueva, se recarga sola ---------- */
async function buscarActualizacion(avisar) {
  try {
    const r = await fetch("version.json?t=" + Date.now(), { cache: "no-store" });
    const { v } = await r.json();
    if (v && v !== window.BLU_VERSION) { location.replace("./?v=" + v); return true; }
    if (avisar) toast("Ya tienes la última versión");
  } catch (e) { if (avisar) toast("No se pudo revisar. Revisa tu conexión"); }
  return false;
}
buscarActualizacion(false);
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") buscarActualizacion(false); });

/* ---------- Arranque ---------- */
sb.auth.getSession().then(({ data }) => iniciar(data.session));
sb.auth.onAuthStateChange((ev, session) => { if (ev === "SIGNED_OUT") iniciar(null); });

/* En el computador: pegar un pantallazo (⌘V) o arrastrar una imagen sube la foto del producto, insumo o proveedor abierto */
function fotoDesdeArchivo(f) {
  const inp = sheetRoot.querySelector("#ppFotoIn, #mmFotoIn, #pvLogoIn"); if (!inp || !f) return false;
  try { const file = new File([f], f.name && f.name !== "image.png" ? f.name : "pantallazo.png", { type: f.type || "image/png" }); const dt = new DataTransfer(); dt.items.add(file); inp.files = dt.files; inp.dispatchEvent(new Event("change", { bubbles: true })); return true; }
  catch (e) { console.error(e); toast("Tu navegador no deja pegar la imagen. Usa Agregar foto"); return false; }
}
document.addEventListener("paste", e => {
  const it = [...((e.clipboardData && e.clipboardData.items) || [])].find(i => i.kind === "file" && /^image\//.test(i.type)); if (!it) return;
  if (!sheetRoot.querySelector("#ppFotoIn, #mmFotoIn, #pvLogoIn")) { toast("Abre primero el producto, insumo o proveedor para pegarle la foto"); return; }
  e.preventDefault(); fotoDesdeArchivo(it.getAsFile());
});
document.addEventListener("dragover", e => { if (sheetRoot.querySelector("#ppFotoIn, #mmFotoIn, #pvLogoIn") && [...(e.dataTransfer.types || [])].includes("Files")) e.preventDefault(); });
document.addEventListener("drop", e => { const f = [...((e.dataTransfer && e.dataTransfer.files) || [])].find(x => /^image\//.test(x.type)); if (f && sheetRoot.querySelector("#ppFotoIn, #mmFotoIn, #pvLogoIn")) { e.preventDefault(); fotoDesdeArchivo(f); } });
