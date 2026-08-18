# Retomar el proyecto

Estado al **17/08/2026**. Este documento sirve para seguir desde otra computadora sin volver
a discutir lo ya decidido. Pegalo entero al inicio de una sesión nueva.

---

## 1. Dónde está todo

| | |
|---|---|
| Repositorio | https://github.com/nlucast/gastos (público, solo código) |
| App publicada | https://nlucast.github.io/gastos/ |
| Datos personales | **No están acá.** Viven en tu respaldo `.json` y en el navegador. |

Para retomar desde otra máquina hacen falta dos cosas: **clonar el repo** y **traer tu
respaldo** (el `.json` exportado desde Ajustes). El repo no sirve de nada sin el respaldo, y el
respaldo no se puede reconstruir desde el repo.

```bash
git clone https://github.com/nlucast/gastos.git
cd gastos
python -m http.server 5173 --directory app
```

Después: Ajustes → Importar, y elegís el respaldo.

---

## 2. Qué es esto

Una app web para registrar gastos del día a día desde el celular y ver, **antes de fin de mes**,
si el ritmo de gasto cierra o no. Reemplaza una planilla de Excel de 11 hojas que funcionaba
pero no acompañaba el uso real: los gastos ocurren en la calle, no frente a la computadora.

**El requisito que define el producto:** saber el día 15, y no el día 30, si vas a un ritmo que
no cierra. Todo lo demás es secundario.

Origen: una deuda grande en tarjetas generada por gasto corriente discrecional financiado con
crédito, sin visibilidad hasta que llegaba el resumen. La app existe para que eso no se repita.
No tiene que juzgar: tiene que hacer visible el número a tiempo. Las alertas son directas a
pedido explícito, no por descuido de tono.

---

## 3. Cómo está hecha

Sin build, sin dependencias, sin backend. HTML + CSS + JavaScript con módulos ES nativos.
Se sirve como archivos estáticos y listo.

```
app/
  index.html          esqueleto y navegación
  css/styles.css      mobile-first, oscuro
  js/model.js         enums, plata en centavos, fechas, repartoLabel
  js/store.js         localStorage, altas/bajas, reglas de escritura
  js/calc.js          las fórmulas puras
  js/app.js           pantallas y eventos
  js/seed.js          con qué arranca la primera vez (VACÍO a propósito)
  sw.js               service worker, cache-busting por versión
  manifest.webmanifest, icons/
.github/workflows/pages.yml   deploy automático a Pages
```

`calc.js` no toca el DOM y `app.js` no calcula: si algo da un número raro, el bug está en
`calc.js` y se puede probar desde la consola sin la interfaz.

---

## 4. Modelo de datos

Todo vive en una sola clave de `localStorage` (`gastos.v1`) con esta forma:

```
config       { sueldoNeto, cotizacionUsd, metaAhorroDefault, metaAhorro{mes},
               diaCorteCierre, coTitular }
movimientos  [{ id, fecha, canal, concepto, descripcion, categoria,
                tipo, cantCuotas, importeTotal }]
planes       [{ id, origen, movimientoId, tarjeta, concepto, descripcion,
                categoria, fechaCompra, cuota, totalCuotas,
                primerCierre, ultimoCierre }]
fijosPesos   [{ id, concepto, canal, monto, activoDesde, activoHasta }]
fijosUsd     [{ id, concepto, canal, montoUsd, activoDesde, activoHasta }]
servicios    [{ id, mes, servicio, vencimiento, total, reparto,
                pagado, fechaPago }]
```

### Convenciones que no se negocian

- **La plata es siempre un entero en centavos.** Nunca decimales flotantes. `parseMoney()`
  entiende formato argentino: `129.000` son ciento veintinueve mil, no 129.
- **Un mes es siempre la string `'YYYY-MM'`.**
- **`ultimoCierre` se deriva**, nunca se guarda a mano: `primerCierre + (totalCuotas - 1)`.
- **`reparto` se guarda como token neutro** (`50/50`, `otro100`, `mio100`) y el nombre que se
  muestra sale de `config.coTitular`. Así el código no lleva adentro el nombre de nadie.

### Dos convenciones de mes conviven a propósito

- `planes` y el calendario usan mes de **cierre**.
- `movimientos` y `servicios` usan mes **calendario**.

**No unificar.** Responden a preguntas distintas: una es "qué me va a facturar el banco", la
otra es "cuánto gasté este mes".

---

## 5. Las reglas implementadas

1. **En cuotas se carga el importe TOTAL**, nunca la cuota. La interfaz muestra la cuota
   calculada en vivo mientras se escribe: es la defensa contra el error de carga más probable.
2. **Una compra en cuotas genera su plan sola**, heredando la categoría. Si se borra el gasto,
   se borra el plan. Si se borra el plan, el gasto pasa a ser de 1 pago.
3. **`categoria` en `planes` es imprescindible.** Sin eso la cuota desaparece del desglose
   después del mes de la compra, en vez de seguir apareciendo hasta que el plan termina.
4. **Primer cierre:** hasta el día 26 la compra entra en el resumen de ese mes; después, en el
   siguiente. Es una aproximación y **debe quedar editable por plan**: los cierres reales se
   mueven mes a mes.
5. **Las cuotas no cuentan contra el techo del mes.** Se descuentan vía el calendario, para que
   el número coincida con el resumen del banco. *Decisión tomada, no reabrir.*
6. **Pero los compromisos nuevos tienen que gritar.** El bloque rojo muestra tres números, y el
   que más importa es la **cuota mensual agregada**: un dashboard que dice "OK" mientras te
   acabás de sumar cuota fija todos los meses está mintiendo.
7. **Anti doble conteo:** lo que ya está descontado del disponible (fijos, servicios, cuotas) no
   se carga en `movimientos`. La app avisa activamente si el concepto coincide con un fijo o un
   servicio existente.
8. **Servicios:** con menos de 4 boletas cargadas el mes se considera incompleto y usa el
   promedio de los últimos 3 meses completos, avisando que el disponible está inflado. Sin ese
   umbral, un mes con una sola boleta se toma como completo y el disponible se dispara.
9. **`pagado` lo define el usuario, no el banco.** El home banking a veces muestra como impaga
   una boleta ya pagada.

---

## 6. Publicar y actualizar

El deploy es automático: push a `main` → GitHub Actions publica `app/` en Pages, ~1 minuto.
También se puede editar un archivo desde la web de GitHub y se despliega igual.

**Al tocar cualquier archivo de `app/`, subir el número de `CACHE` en `app/sw.js`.** Si no, los
dispositivos que ya tienen la app instalada siguen con la versión vieja y el cambio "no aparece".

---

## 7. Privacidad: la regla que sostiene todo esto

El repo es público. **Ningún dato personal puede entrar**, y no alcanza con borrarlo después:
git guarda el historial para siempre. Si algo se filtra, la solución es rehacer el repo, no un
commit de borrado.

Lo que garantiza que no pase:

- `js/seed.js` va **vacío**. La app arranca sin nada.
- El nombre del co-titular es configuración (`config.coTitular`), no código.
- `.gitignore` excluye `docs/`, `files.zip`, todos los `.json` y `app/descargar.html`.

Antes de cualquier push que toque datos, correr:

```bash
git ls-files -c | xargs grep -lniE "nombres|montos|lo que sea personal"
```

---

## 8. Pasar el respaldo al celular

Android muestra el `.json` en pantalla en vez de descargarlo. Por eso existen dos vías:

1. `app/descargar.html` (local, no se publica): un botón con `download` que fuerza la descarga.
   Se abre desde el celular en `http://IP-DE-LA-COMPU:5173/descargar.html`.
2. **Ajustes → Importar pegando el texto**: acepta el JSON copiado. Valida mientras se pega y
   muestra cuántos gastos, planes y boletas trae antes de dejar confirmar — importar reemplaza
   todo y no se puede deshacer.

Los datos del celular y los de la computadora son **independientes**: son dos `localStorage`
distintos. No hay sincronización. El dispositivo donde se carga es el original; de ahí hay que
exportar.

---

## 9. Qué falta

Ordenado por lo que más valor agrega:

- [ ] **Usarla un mes completo antes de agregar nada.** Es el paso siguiente real. El modelo no
      se congela hasta pasar un ciclo entero con datos cargados a mano.
- [ ] Liquidación mensual con el co-titular. Regla ya definida: el redondeo es **siempre hacia
      arriba**, a múltiplo de 5.000, a favor de la otra parte. Nunca hacia abajo.
- [ ] Seguimiento de gastos de terceros que se reintegran. No son gasto: son préstamo temporal.
      No entran en el presupuesto, pero sí hay que medir el adelantado sin cobrar.
- [ ] **Conciliación del resumen de la tarjeta.** La más pesada y la más delicada: los cargos
      esperados son la unión de movimientos + primeras cuotas + cuotas de planes + fijos que
      caen en esa tarjeta + servicios que se pagan con ella. Si no se contemplan los fijos, la
      conciliación marca todo como "no registrado" y a las dos veces se deja de mirar.
- [ ] Tabla de cierres reales por tarjeta, para reemplazar la aproximación del día 26.
- [ ] Notificación al cruzar el 80% del techo.
- [ ] Cierre de mes guiado y histórico por categoría.

### Decisiones abiertas del producto

- Si en algún momento hace falta sincronización real entre dispositivos, hay que meter backend
  y eso cambia el modelo de privacidad entero. Hoy no hace falta.
- La app asume un solo usuario. No generalizar antes de necesitarlo.

---

## 10. Cómo verificar que no rompiste nada

No hay tests automatizados. El control es contra los datos reales: importá el respaldo y
comprobá que los totales del mes de referencia coincidan con los de la planilla original
(`docs/`, local). Si `calc.js` cambia y esos números se mueven, el cambio está mal.

Los puntos que más se rompen:

- `parseMoney` con formato argentino (`129.000` vs `129,00`).
- El corte del día 26 al generar el primer cierre.
- El umbral de 4 servicios y el promedio de meses completos.
- El desglose por categoría sumando dos veces el mes de la compra de un plan.
