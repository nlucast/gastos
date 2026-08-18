// calc.js — las fórmulas. Portadas tal cual de la sección 4 del handoff.
//
// Dos convenciones de mes conviven a propósito:
//   - planes y calendario -> mes de CIERRE
//   - movimientos y servicios -> mes CALENDARIO
// No unificar: responden a preguntas distintas.

import { CATEGORIAS, difMeses, mesDe, addMeses } from './model.js';
import { cuotaDe } from './store.js';

const suma = (arr, fn) => arr.reduce((a, x) => a + (fn(x) || 0), 0);
const activo = (f, mes) =>
  (!f.activoDesde || difMeses(f.activoDesde, mes) >= 0) &&
  (!f.activoHasta || difMeses(mes, f.activoHasta) >= 0);

// Un plan pesa en el mes si el cierre cae dentro de su rango.
export const planActivoEn = (p, mes) =>
  difMeses(p.primerCierre, mes) >= 0 && difMeses(mes, p.ultimoCierre) >= 0;

export const cuotaNumero = (p, mes) => difMeses(p.primerCierre, mes) + 1;

/* ---------- servicios ---------- */

export function parteMia(s) {
  if (s.reparto === 'otro100') return 0;
  if (s.reparto === 'mio100') return s.total;
  return Math.round(s.total / 2);
}
export const parteOtro = (s) => s.total - parteMia(s);

// Un mes está completo si tiene 4 o más servicios con importe cargado.
// Sin este umbral, un mes con sólo Streaming se toma como completo
// y el disponible se dispara falsamente.
export const MIN_SERVICIOS = 4;

export function serviciosDelMes(st, mes) {
  const filas = st.servicios.filter((s) => s.mes === mes);
  const cargados = filas.filter((s) => s.total > 0);
  return { filas, cargados, completo: cargados.length >= MIN_SERVICIOS, mia: suma(cargados, parteMia) };
}

// Promedio de tu parte en los últimos 3 meses COMPLETOS anteriores.
export function promedioServicios(st, mes) {
  const meses = [...new Set(st.servicios.map((s) => s.mes))]
    .filter((m) => difMeses(m, mes) > 0)
    .sort()
    .reverse();
  const completos = [];
  for (const m of meses) {
    const r = serviciosDelMes(st, m);
    if (r.completo) completos.push(r.mia);
    if (completos.length === 3) break;
  }
  if (!completos.length) return 0;
  return Math.round(completos.reduce((a, b) => a + b, 0) / completos.length);
}

// Real si el mes está completo; promedio si todavía no.
export function servicioMes(st, mes) {
  const r = serviciosDelMes(st, mes);
  return r.completo
    ? { monto: r.mia, estimado: false, cargados: r.cargados.length }
    : { monto: promedioServicios(st, mes), estimado: true, cargados: r.cargados.length };
}

export function serviciosVencidos(st, hoyISO) {
  return st.servicios.filter((s) => s.total > 0 && !s.pagado && s.vencimiento && s.vencimiento < hoyISO);
}

/* ---------- fijos ---------- */

export function fijosDelMes(st, mes) {
  const pesos = st.fijosPesos.filter((f) => activo(f, mes));
  const usd = st.fijosUsd.filter((f) => activo(f, mes));
  const cot = st.config.cotizacionUsd || 0;
  const totalUsd = suma(usd, (f) => Math.round((f.montoUsd * cot) / 100));
  return { pesos, usd, totalPesos: suma(pesos, (f) => f.monto), totalUsd, sinCotizacion: usd.length > 0 && !cot };
}

/* ---------- el mes ---------- */

export function resumenMes(st, mes) {
  const fijos = fijosDelMes(st, mes);
  const serv = servicioMes(st, mes);
  const planesActivos = st.planes.filter((p) => planActivoEn(p, mes));

  const cuotas = suma(planesActivos, (p) => p.cuota);
  const totalFijos = fijos.totalPesos + fijos.totalUsd + serv.monto;
  const compromisos = cuotas + totalFijos;
  const disponible = st.config.sueldoNeto - compromisos;

  const meta = mes in st.config.metaAhorro ? st.config.metaAhorro[mes] : st.config.metaAhorroDefault;
  const techo = disponible - meta;

  const movsMes = st.movimientos.filter((m) => mesDe(m.fecha) === mes);
  const unPago = movsMes.filter((m) => m.tipo !== 'Cuotas');
  const enCuotas = movsMes.filter((m) => m.tipo === 'Cuotas');

  const gastado = suma(unPago, (m) => m.importeTotal);
  const restante = techo - gastado;
  const pctUsado = techo > 0 ? gastado / techo : (gastado > 0 ? 1 : 0);

  const estado = gastado > techo ? 'PASADO' : pctUsado > 0.8 ? 'ATENCION' : 'OK';

  return {
    mes, fijos, serv, planesActivos, cuotas, totalFijos, compromisos, disponible,
    meta, techo, gastado, restante, pctUsado, estado, movsMes, unPago,
    nuevos: {
      cantidad: enCuotas.length,
      total: suma(enCuotas, (m) => m.importeTotal),
      cuotaAgregada: suma(enCuotas, cuotaDe),
      planes: enCuotas,
    },
  };
}

/* ---------- desglose por categoría ---------- */
// 1 pago del mes + cuota del mes de los planes activos. Nunca el total de la compra.
// Las cuotas salen de `planes` (no de `movimientos`) para que un plan siga
// apareciendo en su categoría todos los meses hasta que termine.

export function porCategoria(st, mes) {
  const filas = new Map(CATEGORIAS.map((c) => [c, { categoria: c, unPago: 0, cuotas: 0, total: 0 }]));
  const fila = (c) => {
    if (!filas.has(c)) filas.set(c, { categoria: c || 'Otros', unPago: 0, cuotas: 0, total: 0 });
    return filas.get(c);
  };

  st.movimientos
    .filter((m) => mesDe(m.fecha) === mes && m.tipo !== 'Cuotas')
    .forEach((m) => { fila(m.categoria).unPago += m.importeTotal; });

  st.planes
    .filter((p) => planActivoEn(p, mes))
    .forEach((p) => { fila(p.categoria).cuotas += p.cuota; });

  const out = [...filas.values()];
  out.forEach((f) => { f.total = f.unPago + f.cuotas; });
  return out.filter((f) => f.total !== 0).sort((a, b) => b.total - a.total);
}

/* ---------- calendario ---------- */

export function calendario(st, desde, cantidad = 15) {
  const filas = [];
  for (let i = 0; i < cantidad; i++) {
    const mes = addMeses(desde, i);
    const r = resumenMes(st, mes);
    const porTarjeta = {};
    r.planesActivos.forEach((p) => { porTarjeta[p.tarjeta] = (porTarjeta[p.tarjeta] || 0) + p.cuota; });
    filas.push({ mes, porTarjeta, cuotas: r.cuotas, fijos: r.totalFijos,
                 compromisos: r.compromisos, disponible: r.disponible, estimado: r.serv.estimado });
  }
  return filas;
}

/* ---------- ritmo de gasto ---------- */
// El requisito que define el producto: saber el día 15, no el día 30.

export function ritmo(resumen, hoyISO) {
  const [y, m] = resumen.mes.split('-').map(Number);
  const diasMes = new Date(y, m, 0).getDate();
  const esMesActual = mesDe(hoyISO) === resumen.mes;
  const dia = esMesActual ? Math.min(parseInt(hoyISO.slice(8, 10), 10), diasMes) : diasMes;
  const proyectado = dia > 0 ? Math.round((resumen.gastado / dia) * diasMes) : 0;
  return {
    dia, diasMes, esMesActual, proyectado,
    porDia: dia > 0 ? Math.round(resumen.gastado / dia) : 0,
    disponiblePorDia: esMesActual && dia < diasMes ? Math.round(resumen.restante / (diasMes - dia)) : 0,
    excede: proyectado > resumen.techo,
  };
}
