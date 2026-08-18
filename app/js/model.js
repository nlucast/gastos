// model.js — enums, helpers de plata y de fechas.
// Convención: TODA la plata se guarda como entero en centavos.

export const CANALES = ['VISA', 'AMEX', 'PATAGONIA', 'Débito', 'Efectivo'];
export const TARJETAS = ['VISA', 'AMEX', 'PATAGONIA'];
// Los repartos se guardan como token neutro; el nombre que se muestra sale de
// config.coTitular, así el código no lleva adentro el nombre de nadie.
export const REPARTOS = ['50/50', 'otro100', 'mio100'];

export const repartoLabel = (reparto, coTitular = 'Co-titular') =>
  reparto === 'otro100' ? `${coTitular} 100%`
  : reparto === 'mio100' ? 'Mío 100%'
  : '50/50';
export const TIPOS = ['1 pago', 'Cuotas'];

export const CATEGORIAS = [
  'Delivery y comida rápida',
  'Compras online',
  'Súper y kiosco',
  'Salidas y entretenimiento',
  'Transporte y nafta',
  'Cosas de la casa',
  'Ropa',
  'Salud',
  'Regalos',
  'Otros',
];

// Las cuatro primeras son el "cotidiano" bajo vigilancia.
export const CATEGORIAS_COTIDIANO = CATEGORIAS.slice(0, 4);

/* ---------- plata (centavos) ---------- */

// "43.000,50" / "43000.5" / "43,000.50" -> 4300050
export function parseMoney(input) {
  if (input === null || input === undefined) return 0;
  if (typeof input === 'number') return Math.round(input * 100);
  let s = String(input).trim().replace(/[$\s]/g, '');
  if (!s) return 0;
  const coma = s.lastIndexOf(','), punto = s.lastIndexOf('.');
  if (coma > -1 && punto > -1) {
    // el separador decimal es el que está más a la derecha
    if (coma > punto) s = s.replace(/\./g, '').replace(',', '.');
    else s = s.replace(/,/g, '');
  } else if (coma > -1) {
    // una sola coma: decimal si deja 1 o 2 dígitos atrás, si no es de miles
    s = s.split(',').length > 2 || s.length - coma - 1 === 3
      ? s.replace(/,/g, '')
      : s.replace(/,/g, '.');
  } else if (punto > -1) {
    // acá "129.000" son ciento veintinueve mil, no 129 con decimales:
    // un punto que deja exactamente 3 dígitos atrás es separador de miles.
    if (s.split('.').length > 2 || s.length - punto - 1 === 3) s = s.replace(/\./g, '');
  }
  const n = parseFloat(s);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

const fmtAr = new Intl.NumberFormat('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtAr0 = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 });

export const money = (cent) => '$ ' + fmtAr.format((cent || 0) / 100);
export const moneyShort = (cent) => '$ ' + fmtAr0.format(Math.round((cent || 0) / 100));

/* ---------- fechas ---------- */
// Un "mes" es siempre la string 'YYYY-MM'.

export const hoyISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export const mesDe = (iso) => (iso || '').slice(0, 7);
export const mesHoy = () => mesDe(hoyISO());
export const diaDe = (iso) => parseInt((iso || '').slice(8, 10), 10) || 1;

export function addMeses(mes, n) {
  const [y, m] = mes.split('-').map(Number);
  const t = (y * 12 + (m - 1)) + n;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`;
}

export const difMeses = (a, b) => {
  const [ay, am] = a.split('-').map(Number), [by, bm] = b.split('-').map(Number);
  return (by * 12 + bm) - (ay * 12 + am);
};

const MESES_CORTO = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
export const mesLabel = (mes) => {
  const [y, m] = mes.split('-').map(Number);
  return `${MESES_CORTO[m - 1]}/${String(y).slice(2)}`;
};
export const mesLabelLargo = (mes) => {
  const [y, m] = mes.split('-').map(Number);
  const largo = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  return `${largo[m - 1]} ${y}`;
};
export const fechaLabel = (iso) => {
  if (!iso) return '—';
  const [, m, d] = iso.split('-');
  return `${d}/${m}`;
};

export const uid = () => (crypto.randomUUID ? crypto.randomUUID() : 'id-' + Math.random().toString(36).slice(2) + Date.now());

// Normaliza para comparar conceptos: sin tildes, sin mayúsculas, sin ruido de comercio.
export const norm = (s) => (s || '')
  .toLowerCase()
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();
