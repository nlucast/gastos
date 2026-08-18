// store.js — persistencia local (localStorage) + altas/bajas/modificaciones.
// Local-first: un solo usuario, sin backend. Backup por export/import JSON.

import { SEED } from './seed.js';
import { uid, mesDe, diaDe, addMeses, norm, REPARTOS } from './model.js';

const KEY = 'gastos.v1';
const VERSION = 1;

const vacio = () => ({
  version: VERSION,
  config: { sueldoNeto: 0, cotizacionUsd: 0, metaAhorroDefault: 0, metaAhorro: {},
            diaCorteCierre: 26, coTitular: 'Co-titular' },
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

function hidratar(raw) {
  const s = Object.assign(vacio(), raw);
  s.config = Object.assign(vacio().config, raw.config || {});
  s.planes = (s.planes || []).map(normalizarPlan);
  // Un reparto desconocido cae a 50/50 antes que romper el cálculo.
  s.servicios = (s.servicios || []).map((sv) =>
    REPARTOS.includes(sv.reparto) ? sv : Object.assign({}, sv, { reparto: '50/50' }));
  return s;
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

export const addServicio = (s) => { state.servicios.push(Object.assign({ id: uid(), pagado: false, fechaPago: null }, s)); save(); };
export const updateServicio = (id, patch) => { const s = state.servicios.find((x) => x.id === id); if (s) { Object.assign(s, patch); save(); } };
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
