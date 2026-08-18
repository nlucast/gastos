// seed.js — con qué arranca la app la primera vez, si no hay nada guardado.
//
// Va VACÍO a propósito: este archivo se publica junto con el código, así que no
// puede tener datos reales. Los tuyos entran por Ajustes > Importar, desde el
// .json que exportaste. Ese archivo nunca forma parte del repositorio.

export const SEED = {
  config: {
    sueldoNeto: 0,
    cotizacionUsd: 0,
    metaAhorroDefault: 0,
    metaAhorro: {},
    diaCorteCierre: 26,      // hasta el 26 la compra entra en el resumen de este mes
    coTitular: 'Co-titular', // con quién se dividen los servicios; se cambia en Ajustes
  },
  movimientos: [],
  planes: [],
  fijosPesos: [],
  fijosUsd: [],
  servicios: [],
};
