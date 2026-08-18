// store.js — persistencia local (localStorage) + altas/bajas/modificaciones.
// Local-first: un solo usuario, sin backend. Backup por export/import JSON.

import { SEED } from './seed.js';
import { uid, mesDe, diaDe, addMeses, norm, REPARTOS,
         CATEGORIAS_DEFAULT, ORDEN_MES_DEFAULT } from './model.js';

const KEY = 'gastos.v1';
const VERSION = 1;

const vacio = () => ({
  version: VERSION,
  config: { sueldoNeto: 0, cotizacionUsd: 0, metaAhorroDefault: 0, metaAhorro: {},
            diaCorteCierre: 26, coTitular: 'Co-titular',
            // Editables desde Ajustes. Vacíos acá: los completa hidratar().
            categorias: [], catalogoServicios: [], ordenMes: ORDEN_MES_DEFAULT.slice(),
            ocultarValores: false },
  movimientos: [], planes: [], fijosPesos: [], fijosUsd: [], servicios: [],
});

let state = null;
const listeners = new Set();

/* ---------- carga y guardado ---------- */

function normalizarPlan(p) {
  // ultimoCierre se deriva siempre; no se guarda a mano.
  p.ultimoCierre = addMeses(p.primerCierre, Math.max(0, (p.totalCuotas || 1) - 1));
  return p;
}

// Las categorías y los nombres de servicio dejaron de estar fijos en el código.
// Un respaldo anterior no los trae, así que se arman una sola vez: el catálogo de
// fábrica más todo lo que ya esté usado en los datos. Lo cargado que quedara
// fuera del catálogo desaparecería del desglose sin avisar.
function hidratarCatalogos(s) {
  const cats = (s.config.categorias || []).length
    ? s.config.categorias.map((c) => (typeof c === 'string'
        ? { nombre: c, vigilada: false }
        : { nombre: c.nombre, vigilada: !!c.vigilada }))
    : CATEGORIAS_DEFAULT.map((c) => Object.assign({}, c));
  const vistas = new Set(cats.map((c) => c.nombre));
  [...s.movimientos, ...s.planes].forEach((x) => {
    if (x.categoria && !vistas.has(x.categoria)) {
      vistas.add(x.categoria);
      cats.push({ nombre: x.categoria, vigilada: false });
    }
  });
  s.config.categorias = cats;

  const serv = Array.isArray(s.config.catalogoServicios) ? [...s.config.catalogoServicios] : [];
  s.servicios.forEach((b) => { if (b.servicio && !serv.includes(b.servicio)) serv.push(b.servicio); });
  s.config.catalogoServicios = serv;

  // Un orden guardado queda corto si más adelante aparece otra sección.
  const orden = (Array.isArray(s.config.ordenMes) ? s.config.ordenMes : [])
    .filter((id, i, a) => ORDEN_MES_DEFAULT.includes(id) && a.indexOf(id) === i);
  ORDEN_MES_DEFAULT.forEach((id) => { if (!orden.includes(id)) orden.push(id); });
  s.config.ordenMes = orden;
  return s;
}

function hidratar(raw) {
  const s = Object.assign(vacio(), raw);
  s.config = Object.assign(vacio().config, raw.config || {});
  s.planes = (s.planes || []).map(normalizarPlan);
  // Un reparto desconocido cae a 50/50 antes que romper el cálculo.
  s.servicios = (s.servicios || []).map((sv) =>
    REPARTOS.includes(sv.reparto) ? sv : Object.assign({}, sv, { reparto: '50/50' }));
  return hidratarCatalogos(s);
}

// La clave de guardado cambió de nombre. Si aparece una anterior, se adopta
// una sola vez para no perder lo que ya estaba cargado en el navegador.
function claveAnterior() {
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k !== KEY && k.startsWith('gastos.')) return k;
  }
  return null;
}

export function load() {
  try {
    let raw = localStorage.getItem(KEY);
    if (!raw) {
      const vieja = claveAnterior();
      if (vieja) { raw = localStorage.getItem(vieja); localStorage.removeItem(vieja); }
    }
    if (raw) { state = hidratar(JSON.parse(raw)); save(); return state; }
  } catch (e) {
    console.error('No se pudo leer el guardado local', e);
  }
  state = hidratar(structuredClone(SEED));
  save();
  return state;
}

function save() {
  state.version = VERSION;
  localStorage.setItem(KEY, JSON.stringify(state));
  listeners.forEach((fn) => fn(state));
}

export const get = () => state || load();
export const onChange = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };

/* ---------- config ---------- */

export function setConfig(patch) { Object.assign(state.config, patch); save(); }

export function setMetaAhorro(mes, cent) {
  if (cent === null) delete state.config.metaAhorro[mes];
  else state.config.metaAhorro[mes] = cent;
  save();
}

export function setOcultarValores(v) { state.config.ocultarValores = !!v; save(); }

// Intercambia con el vecino. Devuelve false en los extremos, sin tocar nada.
function mover(arr, i, delta) {
  const j = i + delta;
  if (i < 0 || j < 0 || j >= arr.length) return false;
  [arr[i], arr[j]] = [arr[j], arr[i]];
  return true;
}

/* ---------- orden de la pantalla Mes ---------- */

export function moverSeccionMes(id, delta) {
  const ok = mover(state.config.ordenMes, state.config.ordenMes.indexOf(id), delta);
  if (ok) save();
  return ok;
}

export function resetOrdenMes() { state.config.ordenMes = ORDEN_MES_DEFAULT.slice(); save(); }

/* ---------- categorías ---------- */

export const categorias = () => state.config.categorias;
export const nombresCategorias = () => state.config.categorias.map((c) => c.nombre);
export const esVigilada = (nombre) =>
  !!(state.config.categorias.find((c) => c.nombre === nombre) || {}).vigilada;

// Cuántos datos quedarían apuntando al vacío si se borra. Se muestra antes de borrar.
export const usoCategoria = (nombre) =>
  state.movimientos.filter((m) => m.categoria === nombre).length +
  state.planes.filter((p) => p.categoria === nombre).length;

export function addCategoria(nombre, vigilada = false) {
  const n = (nombre || '').trim();
  if (!n || state.config.categorias.some((c) => c.nombre === n)) return false;
  state.config.categorias.push({ nombre: n, vigilada: !!vigilada });
  save();
  return true;
}

// Renombrar arrastra los datos. Si no, los gastos viejos quedan apuntando a una
// categoría que ya no existe y se caen del desglose.
export function renombrarCategoria(viejo, nuevo) {
  const n = (nuevo || '').trim();
  const cat = state.config.categorias.find((c) => c.nombre === viejo);
  if (!cat || !n) return false;
  if (n !== viejo && state.config.categorias.some((c) => c.nombre === n)) return false;
  cat.nombre = n;
  state.movimientos.forEach((m) => { if (m.categoria === viejo) m.categoria = n; });
  state.planes.forEach((p) => { if (p.categoria === viejo) p.categoria = n; });
  save();
  return true;
}

export function setVigilada(nombre, v) {
  const cat = state.config.categorias.find((c) => c.nombre === nombre);
  if (!cat) return false;
  cat.vigilada = !!v;
  save();
  return true;
}

export function moverCategoria(nombre, delta) {
  const i = state.config.categorias.findIndex((c) => c.nombre === nombre);
  const ok = mover(state.config.categorias, i, delta);
  if (ok) save();
  return ok;
}

// Una categoría en uso no se borra: se renombra. Borrarla dejaría gastos sin desglose.
export function delCategoria(nombre) {
  if (usoCategoria(nombre)) return false;
  state.config.categorias = state.config.categorias.filter((c) => c.nombre !== nombre);
  save();
  return true;
}

/* ---------- catálogo de servicios ---------- */
// Los nombres que ofrece el desplegable al cargar una boleta. Es sólo la lista:
// cada boleta sigue guardando su nombre como texto.

export const catalogoServicios = () => state.config.catalogoServicios;
export const usoServicio = (nombre) => state.servicios.filter((s) => s.servicio === nombre).length;

function asegurarEnCatalogo(nombre) {
  const n = (nombre || '').trim();
  if (n && !state.config.catalogoServicios.includes(n)) state.config.catalogoServicios.push(n);
}

export function addServicioCatalogo(nombre) {
  const n = (nombre || '').trim();
  if (!n || state.config.catalogoServicios.includes(n)) return false;
  state.config.catalogoServicios.push(n);
  save();
  return true;
}

export function renombrarServicioCatalogo(viejo, nuevo) {
  const n = (nuevo || '').trim();
  const i = state.config.catalogoServicios.indexOf(viejo);
  if (i < 0 || !n) return false;
  if (n !== viejo && state.config.catalogoServicios.includes(n)) return false;
  state.config.catalogoServicios[i] = n;
  state.servicios.forEach((s) => { if (s.servicio === viejo) s.servicio = n; });
  save();
  return true;
}

export function moverServicioCatalogo(nombre, delta) {
  const i = state.config.catalogoServicios.indexOf(nombre);
  const ok = mover(state.config.catalogoServicios, i, delta);
  if (ok) save();
  return ok;
}

export function delServicioCatalogo(nombre) {
  if (usoServicio(nombre)) return false;
  state.config.catalogoServicios = state.config.catalogoServicios.filter((s) => s !== nombre);
  save();
  return true;
}

/* ---------- movimientos ---------- */

// Cierre estimado: si compraste hasta el día 26, entra en el resumen de este mes.
export function cierreDeCompra(fechaISO) {
  const mes = mesDe(fechaISO);
  return diaDe(fechaISO) <= (state.config.diaCorteCierre || 26) ? mes : addMeses(mes, 1);
}

export const cuotaDe = (mov) =>
  mov.tipo === 'Cuotas' && mov.cantCuotas > 0
    ? Math.round(mov.importeTotal / mov.cantCuotas)
    : mov.importeTotal;

function planDesdeMovimiento(mov) {
  return normalizarPlan({
    id: uid(), origen: 'auto', movimientoId: mov.id,
    tarjeta: mov.canal, concepto: mov.concepto, descripcion: mov.descripcion,
    categoria: mov.categoria, fechaCompra: mov.fecha,
    cuota: cuotaDe(mov), totalCuotas: mov.cantCuotas,
    primerCierre: cierreDeCompra(mov.fecha), ultimoCierre: null,
  });
}

export function addMovimiento(mov) {
  const m = Object.assign({ id: uid() }, mov);
  state.movimientos.push(m);
  // Regla: una compra en cuotas genera su plan automáticamente, heredando categoría.
  if (m.tipo === 'Cuotas' && m.cantCuotas > 1) state.planes.push(planDesdeMovimiento(m));
  save();
  return m;
}

export function updateMovimiento(id, patch) {
  const m = state.movimientos.find((x) => x.id === id);
  if (!m) return;
  Object.assign(m, patch);
  const plan = state.planes.find((p) => p.movimientoId === id);
  if (m.tipo === 'Cuotas' && m.cantCuotas > 1) {
    const nuevo = planDesdeMovimiento(m);
    if (plan) {
      // Respeta el primer cierre si lo tocaste a mano; el resto se re-deriva.
      Object.assign(plan, nuevo, { id: plan.id, primerCierre: plan.primerCierre });
      normalizarPlan(plan);
    } else state.planes.push(nuevo);
  } else if (plan) {
    state.planes = state.planes.filter((p) => p.id !== plan.id);
  }
  save();
}

export function delMovimiento(id) {
  state.movimientos = state.movimientos.filter((m) => m.id !== id);
  state.planes = state.planes.filter((p) => p.movimientoId !== id);
  save();
}

/* ---------- planes ---------- */

export function addPlan(plan) {
  state.planes.push(normalizarPlan(Object.assign({ id: uid(), origen: 'manual', movimientoId: null }, plan)));
  save();
}

export function updatePlan(id, patch) {
  const p = state.planes.find((x) => x.id === id);
  if (!p) return;
  Object.assign(p, patch);
  normalizarPlan(p);
  save();
}

export function delPlan(id) {
  const p = state.planes.find((x) => x.id === id);
  state.planes = state.planes.filter((x) => x.id !== id);
  // Si era automático, el movimiento deja de ser en cuotas para no re-generarlo.
  if (p && p.movimientoId) {
    const m = state.movimientos.find((x) => x.id === p.movimientoId);
    if (m) { m.tipo = '1 pago'; m.cantCuotas = null; }
  }
  save();
}

/* ---------- fijos ---------- */

export const addFijo = (f) => { state.fijosPesos.push(Object.assign({ id: uid(), activoHasta: null }, f)); save(); };
export const updateFijo = (id, patch) => { const f = state.fijosPesos.find((x) => x.id === id); if (f) { Object.assign(f, patch); save(); } };
export const delFijo = (id) => { state.fijosPesos = state.fijosPesos.filter((f) => f.id !== id); save(); };

export const addFijoUsd = (f) => { state.fijosUsd.push(Object.assign({ id: uid(), activoHasta: null }, f)); save(); };
export const updateFijoUsd = (id, patch) => { const f = state.fijosUsd.find((x) => x.id === id); if (f) { Object.assign(f, patch); save(); } };
export const delFijoUsd = (id) => { state.fijosUsd = state.fijosUsd.filter((f) => f.id !== id); save(); };

/* ---------- servicios ---------- */

// Un nombre nuevo se suma solo al catálogo: si no, habría que cargarlo dos veces.
export const addServicio = (s) => {
  state.servicios.push(Object.assign({ id: uid(), pagado: false, fechaPago: null }, s));
  asegurarEnCatalogo(s.servicio);
  save();
};
export const updateServicio = (id, patch) => {
  const s = state.servicios.find((x) => x.id === id);
  if (s) { Object.assign(s, patch); asegurarEnCatalogo(s.servicio); save(); }
};
export const delServicio = (id) => { state.servicios = state.servicios.filter((s) => s.id !== id); save(); };

// Copia la lista de servicios del último mes cargado, sin importes.
export function clonarServiciosDe(mesOrigen, mesDestino) {
  const base = state.servicios.filter((s) => s.mes === mesOrigen);
  base.forEach((s) => {
    if (state.servicios.some((x) => x.mes === mesDestino && x.servicio === s.servicio)) return;
    state.servicios.push({ id: uid(), mes: mesDestino, servicio: s.servicio, vencimiento: null,
                           total: 0, reparto: s.reparto, pagado: false, fechaPago: null });
  });
  save();
  return base.length;
}

/* ---------- anti doble conteo ---------- */

// Si el concepto que estás cargando coincide con un fijo o un servicio, avisar:
// eso ya está descontado del disponible y cargarlo lo cuenta dos veces.
export function chequearDobleConteo(concepto) {
  const n = norm(concepto);
  if (n.length < 3) return null;
  const coincide = (t) => { const x = norm(t); return x.includes(n) || n.includes(x); };
  const fijo = state.fijosPesos.find((f) => coincide(f.concepto)) || state.fijosUsd.find((f) => coincide(f.concepto));
  if (fijo) return { tipo: 'fijo', concepto: fijo.concepto };
  const serv = state.servicios.find((s) => coincide(s.servicio));
  if (serv) return { tipo: 'servicio', concepto: serv.servicio };
  return null;
}

/* ---------- sugerencias por frecuencia ---------- */

export function frecuencias(campo) {
  const cuenta = new Map();
  state.movimientos.forEach((m) => {
    const v = m[campo];
    if (v) cuenta.set(v, (cuenta.get(v) || 0) + 1);
  });
  return [...cuenta.entries()].sort((a, b) => b[1] - a[1]).map(([v]) => v);
}

/* ---------- backup ---------- */

export const exportar = () => JSON.stringify(state, null, 2);

export function importar(json) {
  const data = JSON.parse(json);
  if (!data || typeof data !== 'object' || !Array.isArray(data.movimientos)) {
    throw new Error('El archivo no tiene el formato esperado.');
  }
  state = hidratar(data);
  save();
}

export function reset() {
  state = hidratar(structuredClone(SEED));
  save();
}
