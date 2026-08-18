// app.js — pantallas y eventos.

import {
  CANALES, TARJETAS, REPARTOS, repartoLabel, SECCIONES_MES,
  money, moneyShort, moneyCalc, moneyCalcShort, usd, montoInput, parseMoney,
  setOcultarValores, valoresOcultos,
  hoyISO, mesDe, mesHoy, addMeses, difMeses,
  mesLabel, mesLabelLargo, fechaLabel,
} from './model.js';
import * as db from './store.js';
import {
  resumenMes, porCategoria, calendario, ritmo, cuotaNumero, planActivoEn,
  parteMia, parteOtro, serviciosDelMes, serviciosVencidos, promedioServicios, MIN_SERVICIOS,
} from './calc.js';

/* ================= utilidades de vista ================= */

const $ = (sel, raiz = document) => raiz.querySelector(sel);
const $$ = (sel, raiz = document) => [...raiz.querySelectorAll(sel)];

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (m) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));

const vista = $('#vista');
const hoja = $('#hoja');
const hojaCont = $('#hoja-contenido');

let tab = 'mes';
let mesSel = mesHoy();
let toastT = null;

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastT);
  toastT = setTimeout(() => { t.hidden = true; }, 2400);
}

function abrirHoja(html, onMount) {
  hojaCont.innerHTML = html;
  hoja.hidden = false;
  document.body.style.overflow = 'hidden';
  if (onMount) onMount(hojaCont);
}

function cerrarHoja() {
  hoja.hidden = true;
  hojaCont.innerHTML = '';
  document.body.style.overflow = '';
}

$$('[data-cerrar]').forEach((n) => n.addEventListener('click', cerrarHoja));

const chips = (opciones, valor, name) => opciones.map((o) => {
  const v = typeof o === 'string' ? o : o.v;
  const t = typeof o === 'string' ? o : o.t;
  return `<button type="button" class="chip" data-chip="${esc(name)}" data-valor="${esc(v)}"
           aria-pressed="${v === valor}">${esc(t)}</button>`;
}).join('');

// Los chips son radio buttons: uno solo activo por grupo.
function conectarChips(raiz, onCambio) {
  raiz.addEventListener('click', (e) => {
    const b = e.target.closest('[data-chip]');
    if (!b) return;
    const grupo = b.dataset.chip;
    $$(`[data-chip="${grupo}"]`, raiz).forEach((x) => x.setAttribute('aria-pressed', x === b));
    if (onCambio) onCambio(grupo, b.dataset.valor);
  });
}

const chipValor = (raiz, grupo) => {
  const b = $$(`[data-chip="${grupo}"]`, raiz).find((x) => x.getAttribute('aria-pressed') === 'true');
  return b ? b.dataset.valor : null;
};

/* ================= pantalla: MES ================= */

function vistaMes(st) {
  const r = resumenMes(st, mesSel);
  const rt = ritmo(r, hoyISO());
  const cats = porCategoria(st, mesSel);
  const maxCat = Math.max(1, ...cats.map((c) => c.total));
  const vencidos = serviciosVencidos(st, hoyISO()).filter((s) => difMeses(s.mes, mesSel) >= 0);

  const avisos = [];
  if (!st.config.sueldoNeto) {
    avisos.push(`<div class="aviso"><span>◔</span><div>La app está vacía. Si tenés un respaldo, andá a
      <b>Ajustes → Importar</b>. Si arrancás de cero, cargá primero el <b>sueldo</b> en Ajustes:
      sin eso el techo del mes no significa nada.</div></div>`);
  }
  if (!rt.esMesActual) {
    avisos.push(`<div class="aviso"><span>◷</span><div>Estás mirando <b>${mesLabelLargo(mesSel).toLowerCase()}</b>, no el mes actual.</div></div>`);
  }
  // Sólo tiene sentido avisar de la estimación si ya cargaste servicios alguna vez.
  if (r.serv.estimado && st.servicios.length) {
    avisos.push(`<div class="aviso naranja"><span>⚠</span><div>Servicios <b>estimados</b>: hay ${r.serv.cargados} cargados de ${MIN_SERVICIOS} mínimos.
      Se usa el promedio de los últimos 3 meses completos (${moneyShort(r.serv.monto)}). El disponible real va a ser distinto.</div></div>`);
  }
  if (r.fijos.sinCotizacion) {
    avisos.push(`<div class="aviso naranja"><span>⚠</span><div>Falta la <b>cotización del dólar</b>: los fijos en USD están contando $ 0.</div></div>`);
  }
  if (vencidos.length) {
    avisos.push(`<div class="aviso rojo"><span>⚠</span><div><b>${vencidos.length} servicio${vencidos.length > 1 ? 's' : ''} vencido${vencidos.length > 1 ? 's' : ''} sin pagar:</b>
      ${esc(vencidos.map((s) => s.servicio).join(', '))}.</div></div>`);
  }
  if (rt.esMesActual && rt.excede && r.estado === 'OK') {
    avisos.push(`<div class="aviso rojo"><span>▲</span><div>Al ritmo de <b>${moneyShort(rt.porDia)} por día</b> vas a cerrar el mes en
      <b>${moneyShort(rt.proyectado)}</b> y el techo es ${moneyShort(r.techo)}. Vas a pasarte.</div></div>`);
  }

  const pct = Math.max(0, Math.min(100, Math.round(r.pctUsado * 100)));
  const leyenda = r.estado === 'PASADO'
    ? `Te pasaste ${money(-r.restante)}`
    : `te quedan de ${money(r.techo)}`;

  // Cada bloque se arma por separado y el orden sale de config.ordenMes, que se
  // edita en Ajustes. Los avisos quedan afuera a propósito: van siempre primero,
  // porque son lo único de esta pantalla que pide una acción.
  const seccion = {
    semaforo: () => `
    <div class="card semaforo ${r.estado}">
      <div class="estado">${r.estado === 'ATENCION' ? 'ATENCIÓN' : r.estado}</div>
      <div class="grande ${r.estado === 'PASADO' ? 'pasado' : ''}">${money(Math.abs(r.restante))}</div>
      <div class="leyenda">${leyenda}</div>
      <div class="barra"><i style="width:${pct}%"></i></div>
      <div class="barra-pie"><span>Gastado ${money(r.gastado)}</span><span>${pct}%</span></div>
      ${rt.esMesActual ? `<div class="sub" style="margin-top:10px">
        Día ${rt.dia} de ${rt.diasMes} · ${moneyShort(rt.porDia)}/día hasta ahora ·
        ${rt.disponiblePorDia > 0 ? `${moneyShort(rt.disponiblePorDia)}/día para llegar` : 'sin margen diario'}
      </div>` : ''}
    </div>`,

    nuevos: () => !r.nuevos.cantidad ? '' : `
    <div class="card nuevos">
      <div class="card-t">Compromisos nuevos de este mes</div>
      <div class="destacado">${money(r.nuevos.cuotaAgregada)}</div>
      <div class="destacado-lbl">de cuota mensual que te agregaste</div>
      <div class="fila"><span class="k">Total asumido</span><span class="v">${money(r.nuevos.total)}</span></div>
      <div class="fila"><span class="k">Planes nuevos</span><span class="v">${r.nuevos.cantidad}</span></div>
      <div class="sub" style="margin-top:10px">No cuentan contra el techo de este mes: se descuentan del disponible de los meses que vienen.</div>
    </div>`,

    techo: () => `
    <div class="card">
      <div class="card-t">De dónde sale el techo</div>
      <div class="fila"><span class="k">Sueldo neto</span><span class="v">${money(st.config.sueldoNeto)}</span></div>
      <div class="fila"><span class="k">Cuotas del cierre <span class="sub">(${r.planesActivos.length})</span></span><span class="v">− ${money(r.cuotas)}</span></div>
      <div class="fila"><span class="k">Fijos + servicios${r.serv.estimado ? ' <span class="sub">(est.)</span>' : ''}</span><span class="v">− ${money(r.totalFijos)}</span></div>
      <div class="fila fuerte"><span class="k">Disponible</span><span class="v">${money(r.disponible)}</span></div>
      <div class="fila"><span class="k">Meta de ahorro</span><span class="v">− ${money(r.meta)}</span></div>
      <div class="fila fuerte"><span class="k">Techo del mes</span><span class="v">${money(r.techo)}</span></div>
    </div>`,

    categorias: () => `
    <div class="card">
      <div class="card-t">Por categoría</div>
      ${cats.length ? cats.map((c) => {
        const vig = db.esVigilada(c.categoria);
        const w = (n) => (n / maxCat) * 100;
        return `<div class="cat ${vig ? 'vigilada' : ''}">
          <div class="cab"><span class="n">${esc(c.categoria)}</span><span class="m">${money(c.total)}</span></div>
          <div class="mini"><i class="p1" style="width:${w(c.unPago)}%"></i><i class="p2" style="width:${w(c.cuotas)}%"></i></div>
          <div class="pie">
            ${c.unPago ? `<span>1 pago ${moneyShort(c.unPago)}</span>` : ''}
            ${c.cuotas ? `<span>cuotas ${moneyShort(c.cuotas)}</span>` : ''}
          </div>
        </div>`;
      }).join('') : '<div class="vacio">Sin gastos cargados en este mes.</div>'}
      ${cats.length ? '<div class="sub" style="margin-top:12px">● las categorías del cotidiano, las que están bajo vigilancia. La barra clara es la cuota del mes de los planes activos.</div>' : ''}
    </div>`,

    calendario: () => `
    <div class="card">
      <div class="card-t">Próximos meses</div>
      <div class="tabla-wrap">
        <table class="calend">
          <thead><tr><th>Cierre</th><th>Cuotas</th><th>Fijos</th><th>Disponible</th></tr></thead>
          <tbody>
            ${calendario(st, mesSel, 12).map((f) => `
              <tr class="${f.mes === mesSel ? 'actual' : ''}">
                <td>${mesLabel(f.mes)}${f.estimado ? ' <span class="sub">est</span>' : ''}</td>
                <td>${moneyShort(f.cuotas)}</td>
                <td>${moneyShort(f.fijos)}</td>
                <td class="${f.disponible < 0 ? 'pasado' : ''}">${moneyShort(f.disponible)}</td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>`,
  };

  vista.innerHTML = avisos.join('') +
    st.config.ordenMes.map((id) => (seccion[id] ? seccion[id]() : '')).join('');
}

/* ================= pantalla: MOVIMIENTOS ================= */

function vistaMovimientos(st) {
  const movs = st.movimientos
    .filter((m) => mesDe(m.fecha) === mesSel)
    .sort((a, b) => (a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : 0));

  const total = movs.filter((m) => m.tipo !== 'Cuotas').reduce((a, m) => a + m.importeTotal, 0);
  let dia = null;
  const filas = movs.map((m) => {
    let sep = '';
    if (m.fecha !== dia) { dia = m.fecha; sep = `<div class="dia-sep">${fechaLabel(m.fecha)}</div>`; }
    const cuota = db.cuotaDe(m);
    return sep + `<button class="item" data-mov="${m.id}">
      <div class="cuerpo">
        <div class="t">${esc(m.concepto)} ${m.tipo === 'Cuotas' ? `<span class="tag cuotas">${m.cantCuotas} cuotas</span>` : ''}</div>
        <div class="d">${esc([m.descripcion, m.categoria, m.canal].filter(Boolean).join(' · '))}</div>
      </div>
      <div class="monto">${money(m.tipo === 'Cuotas' ? cuota : m.importeTotal)}
        ${m.tipo === 'Cuotas' ? `<small>total ${moneyShort(m.importeTotal)}</small>` : ''}</div>
    </button>`;
  }).join('');

  vista.innerHTML = `
    <div class="card">
      <div class="fila fuerte" style="padding-top:0">
        <span class="k">Gastado en ${mesLabel(mesSel)} <span class="sub">(1 pago)</span></span>
        <span class="v">${money(total)}</span>
      </div>
      <div class="sub">${movs.length} movimiento${movs.length === 1 ? '' : 's'}. Tocá uno para editarlo.</div>
    </div>
    <div class="card"><div class="lista">${filas || '<div class="vacio">Nada cargado todavía en este mes.<br>Tocá el + para arrancar.</div>'}</div></div>
  `;

  $$('[data-mov]', vista).forEach((b) =>
    b.addEventListener('click', () => hojaGasto(st.movimientos.find((m) => m.id === b.dataset.mov))));
}

/* ================= pantalla: PLANES ================= */

function vistaPlanes(st) {
  const orden = [...st.planes].sort((a, b) => b.cuota - a.cuota);
  const enMes = st.planes.filter((p) => planActivoEn(p, mesSel));
  const cuotaMes = enMes.reduce((a, p) => a + p.cuota, 0);

  // Cuotas que quedan por pagar contando desde el mes que estás mirando.
  const cuotasRestantes = (p) => {
    if (difMeses(mesSel, p.primerCierre) > 0) return p.totalCuotas; // todavía no arrancó
    if (difMeses(p.ultimoCierre, mesSel) > 0) return 0;             // ya terminó
    return difMeses(mesSel, p.ultimoCierre) + 1;
  };
  const pendiente = st.planes.reduce((a, p) => a + p.cuota * cuotasRestantes(p), 0);

  const porTarjeta = TARJETAS.map((t) => ({ t, m: enMes.filter((p) => p.tarjeta === t).reduce((a, p) => a + p.cuota, 0) }))
    .filter((x) => x.m > 0);

  vista.innerHTML = `
    <div class="card">
      <div class="fila fuerte" style="padding-top:0"><span class="k">Cuotas del cierre ${mesLabel(mesSel)}</span><span class="v">${money(cuotaMes)}</span></div>
      ${porTarjeta.map((x) => `<div class="fila"><span class="k">${x.t}</span><span class="v">${money(x.m)}</span></div>`).join('')}
      <div class="fila"><span class="k">Total pendiente desde ${mesLabel(mesSel)}</span><span class="v">${money(pendiente)}</span></div>
    </div>

    <div class="card">
      <div class="card-t">Todos los planes</div>
      <div class="lista">
        ${orden.map((p) => {
          const act = planActivoEn(p, mesSel);
          const n = cuotaNumero(p, mesSel);
          const estado = act ? `cuota ${n}/${p.totalCuotas}` :
            difMeses(mesSel, p.primerCierre) > 0 ? `arranca ${mesLabel(p.primerCierre)}` : `terminó ${mesLabel(p.ultimoCierre)}`;
          return `<button class="item" data-plan="${p.id}" style="${act ? '' : 'opacity:.5'}">
            <div class="cuerpo">
              <div class="t">${esc(p.concepto)} ${p.origen === 'auto' ? '<span class="tag">auto</span>' : ''}</div>
              <div class="d">${esc([p.descripcion, p.tarjeta, p.categoria].filter(Boolean).join(' · '))} · ${estado}</div>
            </div>
            <div class="monto">${money(p.cuota)}<small>hasta ${mesLabel(p.ultimoCierre)}</small></div>
          </button>`;
        }).join('') || '<div class="vacio">Sin planes cargados.</div>'}
      </div>
    </div>

    <button class="btn sec" id="nuevo-plan">Cargar un plan a mano</button>
    <div class="sub">Los planes con etiqueta <b>auto</b> se generaron solos desde una compra en cuotas. Los de a mano son para las cuotas que ya venían de antes.</div>
  `;

  $$('[data-plan]', vista).forEach((b) =>
    b.addEventListener('click', () => hojaPlan(st.planes.find((p) => p.id === b.dataset.plan))));
  $('#nuevo-plan').addEventListener('click', () => hojaPlan(null));
}

/* ================= pantalla: SERVICIOS ================= */

function vistaServicios(st) {
  const { filas, cargados, completo, mia } = serviciosDelMes(st, mesSel);
  const co = st.config.coTitular || 'Co-titular';
  const orden = [...filas].sort((a, b) => (a.vencimiento || '9999') < (b.vencimiento || '9999') ? -1 : 1);
  const totalCasa = filas.reduce((a, s) => a + s.total, 0);
  const delOtro = filas.reduce((a, s) => a + parteOtro(s), 0);
  const impagos = filas.filter((s) => s.total > 0 && !s.pagado).reduce((a, s) => a + s.total, 0);
  const hoy = hoyISO();
  const mesPrevio = addMeses(mesSel, -1);

  vista.innerHTML = `
    <div class="card">
      <div class="fila fuerte" style="padding-top:0"><span class="k">Total casa ${mesLabel(mesSel)}</span><span class="v">${money(totalCasa)}</span></div>
      <div class="fila"><span class="k">Tu parte</span><span class="v">${money(mia)}</span></div>
      <div class="fila"><span class="k">Parte de ${esc(co)}</span><span class="v">${money(delOtro)}</span></div>
      <div class="fila"><span class="k">Falta pagar</span><span class="v ${impagos ? 'atencion' : ''}">${money(impagos)}</span></div>
      ${!completo ? `<div class="aviso naranja" style="margin-top:12px"><span>⚠</span><div>
        ${cargados.length} de ${MIN_SERVICIOS} mínimos cargados. Hasta llegar a ${MIN_SERVICIOS} el mes usa el promedio
        (${moneyShort(promedioServicios(st, mesSel))}) y el disponible se ve más alto de lo que va a ser.</div></div>` : ''}
    </div>

    <div class="card">
      <div class="card-t">Boletas del mes</div>
      <div class="lista">
        ${orden.map((s) => {
          const vencido = s.total > 0 && !s.pagado && s.vencimiento && s.vencimiento < hoy;
          return `<button class="item" data-serv="${s.id}">
            <div class="cuerpo">
              <div class="t">${esc(s.servicio)}
                ${s.pagado ? '<span class="tag pagado">pagado</span>' : vencido ? '<span class="tag vencido">vencido</span>' : ''}</div>
              <div class="d">${s.vencimiento ? 'vence ' + fechaLabel(s.vencimiento) : 'sin vencimiento'} · ${esc(repartoLabel(s.reparto, co))}</div>
            </div>
            <div class="monto">${s.total ? money(s.total) : '<span class="sub">sin importe</span>'}
              ${s.total ? `<small>vos ${moneyShort(parteMia(s))}</small>` : ''}</div>
          </button>`;
        }).join('') || '<div class="vacio">Sin boletas en este mes.</div>'}
      </div>
    </div>

    <div class="btn-fila">
      <button class="btn sec" id="nuevo-serv">Agregar boleta</button>
      ${!filas.length ? `<button class="btn sec" id="clonar-serv">Copiar de ${mesLabel(mesPrevio)}</button>` : ''}
    </div>
    <div class="sub">El reparto se elige por boleta. <b>Pagado lo definís vos</b>, no el home banking.</div>
  `;

  $$('[data-serv]', vista).forEach((b) =>
    b.addEventListener('click', () => hojaServicio(st.servicios.find((s) => s.id === b.dataset.serv))));
  $('#nuevo-serv').addEventListener('click', () => hojaServicio(null));
  const cl = $('#clonar-serv');
  if (cl) cl.addEventListener('click', () => {
    const n = db.clonarServiciosDe(mesPrevio, mesSel);
    toast(n ? `${n} boletas copiadas, sin importes` : `No hay nada cargado en ${mesLabel(mesPrevio)}`);
  });
}

/* ================= pantalla: AJUSTES ================= */

function vistaAjustes(st) {
  const meta = mesSel in st.config.metaAhorro ? st.config.metaAhorro[mesSel] : st.config.metaAhorroDefault;
  const cot = st.config.cotizacionUsd;
  const oculto = valoresOcultos();
  const cats = st.config.categorias;
  const catServ = st.config.catalogoServicios;

  // Flechitas en vez de arrastrar: en el celular, con una mano, arrastrar falla.
  const flechas = (attr, valor, i, largo) => `
    <div class="orden-flechas">
      <button class="mini-btn" data-${attr}-sube="${esc(valor)}" ${i === 0 ? 'disabled' : ''} aria-label="Subir">↑</button>
      <button class="mini-btn" data-${attr}-baja="${esc(valor)}" ${i === largo - 1 ? 'disabled' : ''} aria-label="Bajar">↓</button>
    </div>`;

  vista.innerHTML = `
    <div class="card">
      <div class="card-t">Plata que entra</div>
      ${oculto ? `<div class="aviso"><span>◌</span><div>Los valores están <b>ocultos</b>. Tocá el ◌ de arriba
        para mostrarlos: el sueldo y la meta no se pueden editar a ciegas.</div></div>` : ''}
      <div class="campo"><label>Sueldo neto</label>
        <input type="text" inputmode="decimal" id="cfg-sueldo" value="${montoInput(st.config.sueldoNeto)}"
               ${oculto ? 'disabled placeholder="•••••"' : ''}></div>
      <div class="campo"><label>Meta de ahorro de ${mesLabel(mesSel)}</label>
        <input type="text" inputmode="decimal" id="cfg-meta" value="${montoInput(meta)}"
               ${oculto ? 'disabled placeholder="•••••"' : ''}>
        <div class="hint">Es por mes. Está en cero hasta nov/26 a propósito: una meta incumplible deja el semáforo siempre en rojo.</div></div>
      <div class="campo"><label>Cotización del dólar</label>
        <input type="text" inputmode="decimal" id="cfg-cot" value="${cot ? (cot / 100).toFixed(2) : ''}" placeholder="pendiente">
        ${!cot ? '<div class="hint">Sin esto los fijos en dólares cuentan $ 0.</div>' : ''}</div>
      <div class="campo"><label>Con quién compartís los servicios</label>
        <input type="text" id="cfg-cotitular" value="${esc(st.config.coTitular || '')}" placeholder="Co-titular">
        <div class="hint">Solo el nombre que se muestra en la pantalla de Servicios.</div></div>
      <button class="btn" id="cfg-guardar">Guardar</button>
    </div>

    <div class="card">
      <div class="card-t">Categorías</div>
      <div class="orden">
        ${cats.map((c, i) => `
          <div class="orden-fila">
            ${flechas('cat', c.nombre, i, cats.length)}
            <button class="orden-nombre" data-cat="${esc(c.nombre)}">
              <span class="t">${esc(c.nombre)}${c.vigilada ? '<span class="tag cotidiano">cotidiano</span>' : ''}</span>
              <span class="d">${db.usoCategoria(c.nombre)} usos · tocá para editar</span>
            </button>
          </div>`).join('')}
      </div>
      <div class="btn-fila"><button class="btn sec" id="nueva-cat">Agregar categoría</button></div>
      <div class="sub" style="margin-top:10px">Este orden es el que ves al cargar un gasto: poné arriba las que más usás.
        Las de <b>cotidiano</b> son las que la pantalla de Mes marca con ●.</div>
    </div>

    <div class="card">
      <div class="card-t">Servicios</div>
      <div class="orden">
        ${catServ.map((n, i) => `
          <div class="orden-fila">
            ${flechas('sc', n, i, catServ.length)}
            <button class="orden-nombre" data-sc="${esc(n)}">
              <span class="t">${esc(n)}</span>
              <span class="d">${db.usoServicio(n)} boletas · tocá para editar</span>
            </button>
          </div>`).join('') || '<div class="vacio">Todavía no hay servicios. Agregá los que pagás todos los meses.</div>'}
      </div>
      <div class="btn-fila"><button class="btn sec" id="nuevo-sc">Agregar servicio</button></div>
      <div class="sub" style="margin-top:10px">Es la lista que aparece en el desplegable al cargar una boleta. Acá no van importes:
        el importe cambia todos los meses y se carga en cada boleta.</div>
    </div>

    <div class="card">
      <div class="card-t">Fijos en pesos · ${money(st.fijosPesos.reduce((a, f) => a + f.monto, 0))}</div>
      <div class="lista">
        ${st.fijosPesos.map((f) => `<button class="item" data-fijo="${f.id}">
          <div class="cuerpo"><div class="t">${esc(f.concepto)}</div><div class="d">${esc(f.canal)}</div></div>
          <div class="monto">${money(f.monto)}</div></button>`).join('')}
      </div>
      <div class="btn-fila"><button class="btn sec" id="nuevo-fijo">Agregar fijo</button></div>
    </div>

    <div class="card">
      <div class="card-t">Fijos en dólares</div>
      <div class="lista">
        ${st.fijosUsd.map((f) => `<button class="item" data-fijousd="${f.id}">
          <div class="cuerpo"><div class="t">${esc(f.concepto)}</div><div class="d">${esc(f.canal)} · ${usd(f.montoUsd)}</div></div>
          <div class="monto">${cot ? money(Math.round(f.montoUsd * cot / 100)) : '<span class="sub">sin cotiz.</span>'}</div></button>`).join('')}
      </div>
      <div class="btn-fila"><button class="btn sec" id="nuevo-fijousd">Agregar fijo en USD</button></div>
      <div class="sub" style="margin-top:10px">Si un servicio en dólares lo cobra una tarjeta en pesos, con recargo, y además se comparte, no va acá: va en Servicios.</div>
    </div>

    <div class="card">
      <div class="card-t">Orden de la pantalla Mes</div>
      <div class="orden">
        ${st.config.ordenMes.map((id, i) => {
          const sec = SECCIONES_MES.find((x) => x.id === id);
          return `<div class="orden-fila">
            ${flechas('sec', id, i, st.config.ordenMes.length)}
            <span class="orden-nombre"><span class="t">${esc(sec ? sec.label : id)}</span></span>
          </div>`;
        }).join('')}
      </div>
      <div class="btn-fila"><button class="btn sec" id="orden-reset">Volver al orden original</button></div>
      <div class="sub" style="margin-top:10px">Los avisos van siempre arriba de todo, no se mueven.
        <b>Compromisos nuevos</b> aparece sólo en los meses en que asumiste cuotas nuevas.</div>
    </div>

    <div class="card">
      <div class="card-t">Copia de seguridad</div>
      <div class="sub" style="margin-bottom:12px">Todo se guarda en este navegador. Si borrás los datos del sitio, se pierde. Exportá seguido.</div>
      <div class="btn-fila">
        <button class="btn sec" id="exportar">Exportar</button>
        <button class="btn sec" id="importar">Importar</button>
      </div>
      <div class="btn-fila"><button class="btn sec" id="importar-texto">Importar pegando el texto</button></div>
      <div class="sub" style="margin-top:8px">Si el celular no te deja bajar el archivo, abrilo en el navegador, copiá todo y pegalo acá.</div>
      <div class="btn-fila"><button class="btn peligro" id="reset">Empezar de cero</button></div>
    </div>

    <div class="sub">Los montos van en centavos por dentro, así no hay errores de redondeo. Un mes es siempre el día 1.</div>
  `;

  $('#cfg-guardar').addEventListener('click', () => {
    const patch = {
      cotizacionUsd: parseMoney($('#cfg-cot').value),
      coTitular: $('#cfg-cotitular').value.trim() || 'Co-titular',
    };
    // Con los valores ocultos el input está vacío: guardarlo pondría el sueldo en cero.
    if (!oculto) patch.sueldoNeto = parseMoney($('#cfg-sueldo').value);
    db.setConfig(patch);
    if (!oculto) db.setMetaAhorro(mesSel, parseMoney($('#cfg-meta').value));
    toast(oculto ? 'Guardado (sueldo y meta quedaron como estaban)' : 'Guardado');
  });

  $$('[data-cat-sube]', vista).forEach((b) => b.addEventListener('click', () => db.moverCategoria(b.dataset.catSube, -1)));
  $$('[data-cat-baja]', vista).forEach((b) => b.addEventListener('click', () => db.moverCategoria(b.dataset.catBaja, 1)));
  $$('[data-cat]', vista).forEach((b) => b.addEventListener('click', () => hojaCategoria(b.dataset.cat)));
  $('#nueva-cat').addEventListener('click', () => hojaCategoria(null));

  $$('[data-sc-sube]', vista).forEach((b) => b.addEventListener('click', () => db.moverServicioCatalogo(b.dataset.scSube, -1)));
  $$('[data-sc-baja]', vista).forEach((b) => b.addEventListener('click', () => db.moverServicioCatalogo(b.dataset.scBaja, 1)));
  $$('[data-sc]', vista).forEach((b) => b.addEventListener('click', () => hojaServicioCatalogo(b.dataset.sc)));
  $('#nuevo-sc').addEventListener('click', () => hojaServicioCatalogo(null));

  $$('[data-sec-sube]', vista).forEach((b) => b.addEventListener('click', () => db.moverSeccionMes(b.dataset.secSube, -1)));
  $$('[data-sec-baja]', vista).forEach((b) => b.addEventListener('click', () => db.moverSeccionMes(b.dataset.secBaja, 1)));
  $('#orden-reset').addEventListener('click', () => { db.resetOrdenMes(); toast('Orden original'); });

  $$('[data-fijo]', vista).forEach((b) => b.addEventListener('click', () => hojaFijo(st.fijosPesos.find((f) => f.id === b.dataset.fijo), false)));
  $$('[data-fijousd]', vista).forEach((b) => b.addEventListener('click', () => hojaFijo(st.fijosUsd.find((f) => f.id === b.dataset.fijousd), true)));
  $('#nuevo-fijo').addEventListener('click', () => hojaFijo(null, false));
  $('#nuevo-fijousd').addEventListener('click', () => hojaFijo(null, true));

  $('#exportar').addEventListener('click', () => {
    const blob = new Blob([db.exportar()], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `gastos-${hoyISO()}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });

  $('#importar').addEventListener('click', () => {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = 'application/json,.json';
    inp.addEventListener('change', async () => {
      const f = inp.files[0];
      if (!f) return;
      try { db.importar(await f.text()); toast('Datos importados'); }
      catch (e) { toast('No se pudo importar: ' + e.message); }
    });
    inp.click();
  });

  $('#importar-texto').addEventListener('click', () => hojaImportarTexto());

  $('#reset').addEventListener('click', () => {
    if (!confirm('Borra todo lo cargado en este navegador y no se puede deshacer.\n\n¿Exportaste antes?')) return;
    db.reset();
    toast('Listo, todo vacío');
  });
}

/* ================= hoja: CATEGORÍA ================= */

function hojaCategoria(nombre) {
  const editando = !!nombre;
  const cat = editando ? db.categorias().find((c) => c.nombre === nombre) : { nombre: '', vigilada: false };
  if (!cat) return;
  const uso = editando ? db.usoCategoria(nombre) : 0;

  abrirHoja(`
    <h2>${editando ? 'Editar categoría' : 'Nueva categoría'}</h2>
    <div class="campo"><label>Nombre</label>
      <input type="text" id="c-nombre" value="${esc(cat.nombre)}" placeholder="cómo la vas a llamar">
      ${uso ? `<div class="hint">La usan ${uso} registro${uso === 1 ? '' : 's'}. Si la renombrás, se renombran también.</div>` : ''}</div>

    <div class="campo"><label>¿Es del cotidiano?</label>
      <div class="chips">${chips([{ v: 'si', t: 'Sí, vigilada' }, { v: 'no', t: 'No' }], cat.vigilada ? 'si' : 'no', 'vig')}</div>
      <div class="hint">Las del cotidiano se marcan con ● en la pantalla de Mes: son las que se descontrolan de a poco, sin una compra grande que te avise.</div></div>

    <button class="btn" id="c-guardar">Guardar</button>
    ${editando ? `<div class="btn-fila"><button class="btn peligro" id="c-borrar" ${uso ? 'disabled' : ''}>Borrar</button></div>
      ${uso ? '<div class="sub">Una categoría en uso no se borra: los gastos quedarían fuera del desglose. Renombrala.</div>' : ''}` : ''}
  `, (raiz) => {
    conectarChips(raiz);
    const inp = $('#c-nombre', raiz);

    $('#c-guardar', raiz).addEventListener('click', () => {
      const n = inp.value.trim();
      const vig = chipValor(raiz, 'vig') === 'si';
      if (!n) return toast('Falta el nombre');
      if (editando) {
        if (n !== nombre && !db.renombrarCategoria(nombre, n)) return toast('Ya existe una categoría con ese nombre');
        db.setVigilada(n, vig);
      } else if (!db.addCategoria(n, vig)) {
        return toast('Ya existe una categoría con ese nombre');
      }
      cerrarHoja(); toast('Guardado');
    });

    const btnBorrar = $('#c-borrar', raiz);
    if (btnBorrar) btnBorrar.addEventListener('click', () => {
      if (!confirm(`¿Borrar la categoría "${nombre}"?`)) return;
      if (!db.delCategoria(nombre)) return toast('Está en uso, no se puede borrar');
      cerrarHoja(); toast('Borrada');
    });
    if (!editando) inp.focus();
  });
}

/* ================= hoja: SERVICIO DEL CATÁLOGO ================= */

function hojaServicioCatalogo(nombre) {
  const editando = !!nombre;
  const uso = editando ? db.usoServicio(nombre) : 0;

  abrirHoja(`
    <h2>${editando ? 'Editar servicio' : 'Nuevo servicio'}</h2>
    <div class="campo"><label>Nombre</label>
      <input type="text" id="sc-nombre" value="${esc(nombre || '')}" placeholder="Luz, Gas, Internet…">
      ${uso ? `<div class="hint">Hay ${uso} boleta${uso === 1 ? '' : 's'} con este nombre. Si lo cambiás, se cambia en todas.</div>` : ''}</div>

    <div class="sub">Esta lista es la que ofrece el desplegable al cargar una boleta. Los importes van en cada boleta, no acá.</div>
    <button class="btn" id="sc-guardar" style="margin-top:14px">Guardar</button>
    ${editando ? `<div class="btn-fila"><button class="btn peligro" id="sc-borrar" ${uso ? 'disabled' : ''}>Borrar</button></div>
      ${uso ? '<div class="sub">Tiene boletas cargadas. Si lo borrás, esas boletas quedan sin su nombre en la lista.</div>' : ''}` : ''}
  `, (raiz) => {
    const inp = $('#sc-nombre', raiz);

    $('#sc-guardar', raiz).addEventListener('click', () => {
      const n = inp.value.trim();
      if (!n) return toast('Falta el nombre');
      if (editando) {
        if (n !== nombre && !db.renombrarServicioCatalogo(nombre, n)) return toast('Ya existe un servicio con ese nombre');
      } else if (!db.addServicioCatalogo(n)) {
        return toast('Ya existe un servicio con ese nombre');
      }
      cerrarHoja(); toast('Guardado');
    });

    const btnBorrar = $('#sc-borrar', raiz);
    if (btnBorrar) btnBorrar.addEventListener('click', () => {
      if (!confirm(`¿Sacar "${nombre}" de la lista?`)) return;
      if (!db.delServicioCatalogo(nombre)) return toast('Tiene boletas cargadas');
      cerrarHoja(); toast('Borrado');
    });
    inp.focus();
  });
}

/* ================= hoja: IMPORTAR PEGANDO ================= */

function hojaImportarTexto() {
  abrirHoja(`
    <h2>Importar pegando el texto</h2>
    <div class="aviso rojo" style="margin-bottom:14px"><span>⚠</span><div>
      Esto <b>reemplaza todo</b> lo que tengas cargado en este dispositivo. No se puede deshacer.</div></div>
    <div class="campo">
      <textarea id="imp-texto" rows="8" placeholder='Pegá acá el contenido del archivo, empieza con {"version"...'></textarea>
      <div class="hint" id="imp-info"></div>
    </div>
    <button class="btn" id="imp-guardar" disabled>Importar</button>
  `, (raiz) => {
    const ta = $('#imp-texto', raiz);
    const btn = $('#imp-guardar', raiz);
    const info = $('#imp-info', raiz);

    // Se valida mientras pega, así no se entera del error después de reemplazar todo.
    ta.addEventListener('input', () => {
      const t = ta.value.trim();
      if (!t) { info.textContent = ''; btn.disabled = true; return; }
      try {
        const d = JSON.parse(t);
        if (!Array.isArray(d.movimientos)) throw new Error('no parece un respaldo de Gastos');
        info.innerHTML = `<span class="calc">${d.movimientos.length} gastos · ${(d.planes || []).length} planes · ${(d.servicios || []).length} boletas</span>`;
        btn.disabled = false;
      } catch (e) {
        info.textContent = 'Todavía no es válido: ' + e.message;
        btn.disabled = true;
      }
    });

    btn.addEventListener('click', () => {
      try { db.importar(ta.value.trim()); cerrarHoja(); toast('Datos importados'); }
      catch (e) { toast('No se pudo importar: ' + e.message); }
    });
    ta.focus();
  });
}

/* ================= hoja: CARGAR / EDITAR GASTO ================= */

function hojaGasto(mov) {
  const st = db.get();
  const editando = !!mov;
  const m = mov || {
    fecha: hoyISO(),
    canal: db.frecuencias('canal')[0] || 'VISA',
    categoria: db.frecuencias('categoria')[0] || db.nombresCategorias()[0] || '',
    tipo: '1 pago', cantCuotas: null, importeTotal: 0, concepto: '', descripcion: '',
  };
  const conceptos = [...new Set(st.movimientos.map((x) => x.concepto).filter(Boolean))];

  abrirHoja(`
    <h2>${editando ? 'Editar gasto' : 'Nuevo gasto'}</h2>

    <div class="campo">
      <label>Importe ${m.tipo === 'Cuotas' ? '<b>total del plan</b>' : ''}</label>
      <input type="text" inputmode="decimal" id="g-importe" class="grande"
             value="${m.importeTotal ? (m.importeTotal / 100).toFixed(2) : ''}" placeholder="0,00">
      <div class="hint calc" id="g-calc"></div>
      <div class="hint" id="g-alerta"></div>
    </div>

    <div class="campo"><label>Con qué pagaste</label>
      <div class="chips">${chips(CANALES, m.canal, 'canal')}</div></div>

    <div class="campo"><label>Dónde</label>
      <input type="text" id="g-concepto" list="lista-conceptos" value="${esc(m.concepto)}" placeholder="dónde compraste">
      <datalist id="lista-conceptos">${conceptos.map((c) => `<option value="${esc(c)}">`).join('')}</datalist></div>

    <div class="campo"><label>Qué fue <span class="sub">(opcional)</span></label>
      <input type="text" id="g-desc" value="${esc(m.descripcion || '')}" placeholder="qué compraste"></div>

    <div class="campo"><label>Categoría</label>
      <div class="chips">${chips(db.nombresCategorias(), m.categoria, 'categoria')}</div></div>

    <div class="campo"><label>Tipo</label>
      <div class="chips">${chips(['1 pago', 'Cuotas'], m.tipo, 'tipo')}</div></div>

    <div class="campo" id="g-cuotas-campo" ${m.tipo === 'Cuotas' ? '' : 'hidden'}>
      <label>Cantidad de cuotas</label>
      <div class="chips">${chips(['3', '6', '9', '12', '18', '24'], String(m.cantCuotas || ''), 'cuotas')}</div>
      <input type="number" id="g-cuotas-otro" min="2" max="60" placeholder="otra cantidad"
             value="${m.cantCuotas && ![3, 6, 9, 12, 18, 24].includes(m.cantCuotas) ? m.cantCuotas : ''}" style="margin-top:8px">
    </div>

    <div class="campo"><label>Fecha</label>
      <input type="date" id="g-fecha" value="${m.fecha}"></div>

    <button class="btn" id="g-guardar">${editando ? 'Guardar' : 'Cargar gasto'}</button>
    ${editando ? '<div class="btn-fila"><button class="btn peligro" id="g-borrar">Borrar</button></div>' : ''}
  `, (raiz) => {
    const impInp = $('#g-importe', raiz);
    const otroInp = $('#g-cuotas-otro', raiz);
    const conceptoInp = $('#g-concepto', raiz);

    const cantCuotas = () => {
      if (chipValor(raiz, 'tipo') !== 'Cuotas') return null;
      const otro = parseInt(otroInp.value, 10);
      if (otro > 1) return otro;
      const c = parseInt(chipValor(raiz, 'cuotas'), 10);
      return c > 1 ? c : null;
    };

    // La cuota calculada en vivo: es la defensa contra el error de carga más
    // probable, que es cargar la cuota en vez del total.
    const refrescar = () => {
      const total = parseMoney(impInp.value);
      const n = cantCuotas();
      const esCuotas = chipValor(raiz, 'tipo') === 'Cuotas';
      $('#g-cuotas-campo', raiz).hidden = !esCuotas;
      $$('label', raiz)[0].innerHTML = `Importe ${esCuotas ? '<b>total del plan</b>' : ''}`;

      let txt = '';
      if (esCuotas && n && total) {
        const cierre = db.cierreDeCompra($('#g-fecha', raiz).value || hoyISO());
        txt = `${n} cuotas de ${moneyCalc(Math.round(total / n))} · primer cierre ${mesLabel(cierre)}`;
      } else if (esCuotas && total && !n) {
        txt = 'Elegí en cuántas cuotas.';
      }
      $('#g-calc', raiz).textContent = txt;

      const dup = db.chequearDobleConteo(conceptoInp.value);
      $('#g-alerta', raiz).innerHTML = dup
        ? `⚠ <b>${esc(dup.concepto)}</b> ya es un ${dup.tipo} y está descontado del disponible. Si lo cargás acá se cuenta dos veces.`
        : '';
    };

    conectarChips(raiz, refrescar);
    ['input', 'change'].forEach((ev) => {
      impInp.addEventListener(ev, refrescar);
      otroInp.addEventListener(ev, refrescar);
      conceptoInp.addEventListener(ev, refrescar);
      $('#g-fecha', raiz).addEventListener(ev, refrescar);
    });
    refrescar();
    if (!editando) impInp.focus();

    $('#g-guardar', raiz).addEventListener('click', () => {
      const total = parseMoney(impInp.value);
      const tipo = chipValor(raiz, 'tipo');
      const n = cantCuotas();
      if (!total) return toast('Falta el importe');
      if (!conceptoInp.value.trim()) return toast('Falta dónde gastaste');
      if (tipo === 'Cuotas' && !n) return toast('Falta la cantidad de cuotas');

      const datos = {
        fecha: $('#g-fecha', raiz).value || hoyISO(),
        canal: chipValor(raiz, 'canal'),
        concepto: conceptoInp.value.trim(),
        descripcion: $('#g-desc', raiz).value.trim(),
        categoria: chipValor(raiz, 'categoria'),
        tipo, cantCuotas: n, importeTotal: total,
      };

      if (editando) { db.updateMovimiento(mov.id, datos); toast('Guardado'); }
      else {
        db.addMovimiento(datos);
        toast(tipo === 'Cuotas' ? `Cargado + plan de ${n} cuotas` : 'Cargado');
        mesSel = mesDe(datos.fecha);
      }
      cerrarHoja();
    });

    const btnBorrar = $('#g-borrar', raiz);
    if (btnBorrar) btnBorrar.addEventListener('click', () => {
      if (!confirm('¿Borrar este gasto?')) return;
      db.delMovimiento(mov.id); cerrarHoja(); toast('Borrado');
    });
  });
}

/* ================= hoja: PLAN ================= */

function hojaPlan(plan) {
  const editando = !!plan;
  const p = plan || {
    tarjeta: 'VISA', concepto: '', descripcion: '', categoria: db.nombresCategorias()[0] || '',
    cuota: 0, totalCuotas: 3, primerCierre: mesHoy(), origen: 'manual',
  };
  const auto = p.origen === 'auto';

  abrirHoja(`
    <h2>${editando ? 'Plan en cuotas' : 'Nuevo plan a mano'}</h2>
    ${auto ? `<div class="aviso" style="margin-bottom:14px"><span>↺</span><div>Este plan se generó solo desde un gasto en cuotas.
      Si cambiás el gasto, se recalcula. Podés ajustar el <b>primer cierre</b> si el banco lo tomó otro mes.</div></div>` : ''}

    <div class="campo"><label>Cuota mensual</label>
      <input type="text" inputmode="decimal" id="p-cuota" class="grande" value="${p.cuota ? (p.cuota / 100).toFixed(2) : ''}" ${auto ? 'disabled' : ''}></div>

    <div class="fila-campos">
      <div class="campo"><label>Cuotas que faltan</label>
        <input type="number" id="p-n" min="1" max="60" value="${p.totalCuotas}" ${auto ? 'disabled' : ''}></div>
      <div class="campo"><label>Primer cierre</label>
        <input type="month" id="p-cierre" value="${p.primerCierre}"></div>
    </div>
    <div class="hint calc" id="p-calc"></div>

    <div class="campo"><label>Tarjeta</label><div class="chips">${chips(TARJETAS, p.tarjeta, 'tarjeta')}</div></div>
    <div class="campo"><label>Dónde</label><input type="text" id="p-concepto" value="${esc(p.concepto)}" ${auto ? 'disabled' : ''}></div>
    <div class="campo"><label>Qué fue</label><input type="text" id="p-desc" value="${esc(p.descripcion || '')}" ${auto ? 'disabled' : ''}></div>
    <div class="campo"><label>Categoría</label><div class="chips">${chips(db.nombresCategorias(), p.categoria, 'categoria')}</div>
      <div class="hint">Sin categoría la cuota desaparece del desglose después del mes de la compra.</div></div>

    <button class="btn" id="p-guardar">Guardar</button>
    ${editando ? '<div class="btn-fila"><button class="btn peligro" id="p-borrar">Borrar plan</button></div>' : ''}
  `, (raiz) => {
    const refrescar = () => {
      const n = parseInt($('#p-n', raiz).value, 10) || 0;
      const cuota = parseMoney($('#p-cuota', raiz).value);
      const desde = $('#p-cierre', raiz).value || mesHoy();
      $('#p-calc', raiz).textContent = n && cuota
        ? `${moneyCalcShort(cuota * n)} pendientes · de ${mesLabel(desde)} a ${mesLabel(addMeses(desde, n - 1))}`
        : '';
    };
    conectarChips(raiz);
    $$('input', raiz).forEach((i) => i.addEventListener('input', refrescar));
    refrescar();

    $('#p-guardar', raiz).addEventListener('click', () => {
      const datos = {
        tarjeta: chipValor(raiz, 'tarjeta'),
        categoria: chipValor(raiz, 'categoria'),
        primerCierre: $('#p-cierre', raiz).value || mesHoy(),
      };
      if (!auto) Object.assign(datos, {
        concepto: $('#p-concepto', raiz).value.trim(),
        descripcion: $('#p-desc', raiz).value.trim(),
        cuota: parseMoney($('#p-cuota', raiz).value),
        totalCuotas: parseInt($('#p-n', raiz).value, 10) || 1,
      });
      if (!auto && (!datos.concepto || !datos.cuota)) return toast('Falta el concepto o la cuota');
      if (editando) db.updatePlan(plan.id, datos); else db.addPlan(datos);
      cerrarHoja(); toast('Guardado');
    });

    const btnBorrar = $('#p-borrar', raiz);
    if (btnBorrar) btnBorrar.addEventListener('click', () => {
      if (!confirm(auto ? 'El gasto que lo generó pasa a ser de 1 pago. ¿Borrar?' : '¿Borrar el plan?')) return;
      db.delPlan(plan.id); cerrarHoja(); toast('Borrado');
    });
  });
}

/* ================= hoja: SERVICIO ================= */

function hojaServicio(serv) {
  const editando = !!serv;
  const s = serv || { mes: mesSel, servicio: '', vencimiento: '', total: 0, reparto: '50/50', pagado: false, fechaPago: null };
  const co = db.get().config.coTitular || 'Co-titular';
  // El catálogo se edita en Ajustes. Si la boleta trae un nombre que no está
  // (o el catálogo está vacío), arranca en "Otro" con el texto escrito.
  const catalogo = db.catalogoServicios();
  const arrancaOtro = !catalogo.length || (!!s.servicio && !catalogo.includes(s.servicio));

  abrirHoja(`
    <h2>${editando ? esc(s.servicio) : 'Nueva boleta'}</h2>
    <div class="campo"><label>Importe total de la boleta</label>
      <input type="text" inputmode="decimal" id="s-total" class="grande" value="${s.total ? (s.total / 100).toFixed(2) : ''}" placeholder="0,00">
      <div class="hint calc" id="s-calc"></div></div>

    <div class="campo"><label>Servicio</label>
      <select id="s-nombre">
        <option value="" disabled ${!s.servicio && !arrancaOtro ? 'selected' : ''}>Elegí cuál…</option>
        ${catalogo.map((n) => `<option value="${esc(n)}" ${n === s.servicio ? 'selected' : ''}>${esc(n)}</option>`).join('')}
        <option value="__otro" ${arrancaOtro ? 'selected' : ''}>Otro (escribir)</option>
      </select>
      <input type="text" id="s-nombre-otro" placeholder="nombre del servicio" style="margin-top:8px"
             value="${arrancaOtro ? esc(s.servicio) : ''}" ${arrancaOtro ? '' : 'hidden'}>
      <div class="hint">La lista se ordena y se edita en Ajustes → Servicios. Lo que escribas en “Otro” se agrega solo.</div></div>

    <div class="fila-campos">
      <div class="campo"><label>Mes</label><input type="month" id="s-mes" value="${s.mes}"></div>
      <div class="campo"><label>Vence</label><input type="date" id="s-venc" value="${s.vencimiento || ''}"></div>
    </div>

    <div class="campo"><label>Reparto</label>
      <div class="chips">${chips(REPARTOS.map((r) => ({ v: r, t: repartoLabel(r, co) })), s.reparto, 'reparto')}</div></div>
    <div class="campo"><label>Estado</label><div class="chips">${chips([{ v: 'no', t: 'Sin pagar' }, { v: 'si', t: 'Pagado' }], s.pagado ? 'si' : 'no', 'pagado')}</div></div>

    <button class="btn" id="s-guardar">Guardar</button>
    ${editando ? '<div class="btn-fila"><button class="btn peligro" id="s-borrar">Borrar</button></div>' : ''}
  `, (raiz) => {
    const refrescar = () => {
      const total = parseMoney($('#s-total', raiz).value);
      const rep = chipValor(raiz, 'reparto');
      const mio = rep === 'otro100' ? 0 : rep === 'mio100' ? total : Math.round(total / 2);
      $('#s-calc', raiz).textContent = total ? `Te toca ${moneyCalc(mio)} · a ${co} ${moneyCalc(total - mio)}` : '';
    };
    conectarChips(raiz, refrescar);
    $('#s-total', raiz).addEventListener('input', refrescar);
    refrescar();

    const sel = $('#s-nombre', raiz);
    const otro = $('#s-nombre-otro', raiz);
    const nombreServicio = () => (sel.value === '__otro' ? otro.value.trim() : sel.value);
    sel.addEventListener('change', () => {
      otro.hidden = sel.value !== '__otro';
      if (sel.value === '__otro') otro.focus();
    });

    $('#s-guardar', raiz).addEventListener('click', () => {
      const nombre = nombreServicio();
      if (!nombre) return toast('Falta el nombre del servicio');
      const pagado = chipValor(raiz, 'pagado') === 'si';
      const datos = {
        mes: $('#s-mes', raiz).value || mesSel,
        servicio: nombre,
        vencimiento: $('#s-venc', raiz).value || null,
        total: parseMoney($('#s-total', raiz).value),
        reparto: chipValor(raiz, 'reparto'),
        pagado,
        fechaPago: pagado ? (s.fechaPago || hoyISO()) : null,
      };
      if (editando) db.updateServicio(serv.id, datos); else db.addServicio(datos);
      cerrarHoja(); toast('Guardado');
    });

    const btnBorrar = $('#s-borrar', raiz);
    if (btnBorrar) btnBorrar.addEventListener('click', () => {
      if (!confirm('¿Borrar la boleta?')) return;
      db.delServicio(serv.id); cerrarHoja(); toast('Borrada');
    });
  });
}

/* ================= hoja: FIJO ================= */

function hojaFijo(fijo, esUsd) {
  const editando = !!fijo;
  const f = fijo || { concepto: '', canal: esUsd ? 'Débito' : 'AMEX', monto: 0, montoUsd: 0, activoDesde: mesHoy() };
  const valor = esUsd ? f.montoUsd : f.monto;

  abrirHoja(`
    <h2>${editando ? 'Editar fijo' : esUsd ? 'Nuevo fijo en USD' : 'Nuevo fijo'}</h2>
    <div class="campo"><label>Monto mensual ${esUsd ? 'en dólares' : ''}</label>
      <input type="text" inputmode="decimal" id="f-monto" class="grande" value="${valor ? (valor / 100).toFixed(2) : ''}"></div>
    <div class="campo"><label>Concepto</label><input type="text" id="f-concepto" value="${esc(f.concepto)}"></div>
    <div class="campo"><label>De dónde sale</label><div class="chips">${chips(CANALES, f.canal, 'canal')}</div>
      <div class="hint">Si cae en una tarjeta, es un cargo que va a aparecer en el resumen aunque no esté en los gastos.</div></div>
    <div class="fila-campos">
      <div class="campo"><label>Activo desde</label><input type="month" id="f-desde" value="${f.activoDesde || mesHoy()}"></div>
      <div class="campo"><label>Hasta <span class="sub">(opcional)</span></label><input type="month" id="f-hasta" value="${f.activoHasta || ''}"></div>
    </div>
    <button class="btn" id="f-guardar">Guardar</button>
    ${editando ? '<div class="btn-fila"><button class="btn peligro" id="f-borrar">Borrar</button></div>' : ''}
  `, (raiz) => {
    conectarChips(raiz);
    $('#f-guardar', raiz).addEventListener('click', () => {
      const concepto = $('#f-concepto', raiz).value.trim();
      const monto = parseMoney($('#f-monto', raiz).value);
      if (!concepto || !monto) return toast('Falta el concepto o el monto');
      const datos = {
        concepto, canal: chipValor(raiz, 'canal'),
        activoDesde: $('#f-desde', raiz).value || mesHoy(),
        activoHasta: $('#f-hasta', raiz).value || null,
      };
      if (esUsd) datos.montoUsd = monto; else datos.monto = monto;
      if (editando) (esUsd ? db.updateFijoUsd : db.updateFijo)(fijo.id, datos);
      else (esUsd ? db.addFijoUsd : db.addFijo)(datos);
      cerrarHoja(); toast('Guardado');
    });
    const btnBorrar = $('#f-borrar', raiz);
    if (btnBorrar) btnBorrar.addEventListener('click', () => {
      if (!confirm('¿Borrar el fijo?')) return;
      (esUsd ? db.delFijoUsd : db.delFijo)(fijo.id);
      cerrarHoja(); toast('Borrado');
    });
  });
}

/* ================= router ================= */

const TITULOS = { mes: () => mesLabelLargo(mesSel), movimientos: () => 'Gastos de ' + mesLabel(mesSel),
                  planes: () => 'Cuotas', servicios: () => 'Servicios ' + mesLabel(mesSel), ajustes: () => 'Ajustes' };

function render() {
  const st = db.get();
  // Ocultar es de presentación: se aplica antes de dibujar, y no toca ningún cálculo.
  setOcultarValores(st.config.ocultarValores);
  const ojo = $('#ojo');
  ojo.textContent = st.config.ocultarValores ? '◌' : '◉';
  ojo.setAttribute('aria-pressed', String(!!st.config.ocultarValores));
  ojo.setAttribute('aria-label', st.config.ocultarValores ? 'Mostrar valores' : 'Ocultar valores');
  $('#titulo').textContent = TITULOS[tab]();
  $('#mes-hoy').hidden = mesSel === mesHoy();
  ({ mes: vistaMes, movimientos: vistaMovimientos, planes: vistaPlanes,
     servicios: vistaServicios, ajustes: vistaAjustes }[tab])(st);
  vista.scrollTop = 0;
}

$$('#tabs .tab').forEach((b) => b.addEventListener('click', () => {
  tab = b.dataset.tab;
  $$('#tabs .tab').forEach((x) => x.classList.toggle('activo', x === b));
  render();
}));

$('#mes-prev').addEventListener('click', () => { mesSel = addMeses(mesSel, -1); render(); });
$('#mes-next').addEventListener('click', () => { mesSel = addMeses(mesSel, 1); render(); });
$('#mes-hoy').addEventListener('click', () => { mesSel = mesHoy(); render(); });
$('#ojo').addEventListener('click', () => db.setOcultarValores(!db.get().config.ocultarValores));
$('#fab').addEventListener('click', () => hojaGasto(null));

document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !hoja.hidden) cerrarHoja(); });

db.load();
db.onChange(render);
render();

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
