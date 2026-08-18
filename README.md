# Gastos

App web para registrar gastos del día a día y ver, **antes de que sea tarde**, si el ritmo de
gasto del mes cierra o no. Pensada para usarse con el celular en la mano, no sentado frente a
una planilla.

Sin backend, sin cuenta, sin dependencias: HTML, CSS y JavaScript a secas.

## Cómo abrirla

En Windows, doble clic en `abrir-app.cmd`. Levanta un servidor local, abre
http://localhost:5173 y muestra la dirección para entrar desde el celular.

En cualquier otro lado:

```bash
python -m http.server 5173 --directory app
```

No sirve abrir `app/index.html` con doble clic: usa módulos de JavaScript y el navegador los
bloquea sin un servidor.

## Dónde viven los datos

En el `localStorage` del navegador donde la abriste. **No salen de ahí.** Cada navegador tiene
su propio almacenamiento: lo que cargues en el celular no aparece en la compu.

- Ajustes → **Exportar** baja un `.json` con todo.
- Ajustes → **Importar** lo restaura en otro dispositivo.
- Si borrás los datos del sitio, se pierde. **Exportá seguido.**

La app arranca vacía. Lo primero es cargar el sueldo en Ajustes, o importar un respaldo.

## Las pantallas

| | |
|---|---|
| **Mes** | Semáforo del techo, ritmo de gasto por día, compromisos nuevos, desglose por categoría y calendario de 12 meses. El mes se cambia con las flechas de los extremos. El orden de las secciones se configura en Ajustes. |
| **Gastos** | Los movimientos del mes. Tocá uno para editarlo. |
| **Cuotas** | Planes activos, cuánto pesa cada tarjeta en el cierre, total pendiente. |
| **Servicios** | Boletas con reparto, marca de pagado y alerta de vencidas. |
| **Ajustes** | Sueldo, meta de ahorro del mes, cotización del dólar, categorías, servicios, fijos, orden de la pantalla Mes, respaldos. |

El botón **+** carga un gasto desde cualquier pantalla. El **◉** al lado del título oculta todos
los importes, para mirar la app con alguien al lado.

## Las reglas que tiene adentro

- En cuotas se carga **el importe total**, nunca la cuota. La app muestra la cuota calculada en
  vivo mientras escribís: es la defensa contra el error de carga más probable.
- Una compra en cuotas **genera su plan sola**, heredando la categoría. Si borrás el gasto, se
  borra el plan.
- **Primer cierre**: hasta el día 26 la compra entra en el resumen de ese mes; después, en el
  siguiente. Editable por plan, porque los cierres reales se mueven mes a mes.
- **Las cuotas no cuentan contra el techo del mes.** Se descuentan vía el calendario, para que
  el número coincida con el resumen del banco. Pero el bloque rojo de compromisos nuevos
  muestra la **cuota mensual agregada**, que es el dato que de verdad importa.
- **Anti doble conteo**: si el concepto que cargás coincide con un fijo o un servicio, avisa.
  Eso ya está descontado del disponible.
- **Servicios**: con menos de 4 boletas cargadas el mes se considera incompleto y usa el
  promedio de los últimos 3 meses completos, avisando que el disponible está inflado.
- **Las categorías se editan** (agregar, renombrar, ordenar, marcar como cotidiano). Renombrar
  arrastra los gastos y los planes que la usaban; una categoría en uso no se puede borrar,
  porque sus gastos quedarían fuera del desglose.
- **Ocultar valores** tapa los importes en toda la app, pero no los cálculos en vivo de los
  formularios: el importe que los alimenta ya está a la vista y taparlos sacaría la defensa
  contra cargar la cuota en vez del total.
- Toda la plata se guarda **en centavos enteros**. Nada de decimales flotantes.
- Un mes es siempre el día 1. Conviven a propósito el mes de **cierre** (planes, calendario) y
  el mes **calendario** (gastos, servicios): responden a preguntas distintas.

## Estructura

```
app/
  index.html
  css/styles.css
  js/model.js    enums, plata en centavos, fechas
  js/store.js    persistencia local, altas y bajas
  js/calc.js     las fórmulas
  js/app.js      pantallas y eventos
  js/seed.js     con qué arranca la primera vez (vacío)
  sw.js, manifest.webmanifest, icons/
```

## Publicarla

La carpeta `app/` es estática: se sube tal cual a cualquier hosting (Netlify, GitHub Pages,
Vercel). Con HTTPS se instala como PWA — ícono propio, pantalla completa y funciona sin señal.

Antes de publicar, revisar que `js/seed.js` siga vacío. Los respaldos `.json` y la carpeta
`docs/` están en `.gitignore` por la misma razón.

Si tocás archivos de `app/`, subí el número de `CACHE` en `sw.js` o los dispositivos que ya la
tengan van a seguir con la versión vieja.

## Todavía no está

Liquidación mensual con el co-titular, seguimiento de gastos de terceros que se reintegran,
conciliación del resumen de la tarjeta, notificación al cruzar el 80% del techo, cierre de mes
guiado e histórico por categoría.
