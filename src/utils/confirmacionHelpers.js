// ======================= ESTADO DE CONFIRMACIÓN POR TARJETA =======================
// Misma interpretación que services/estadisticasService.js (getEstadisticas), para que
// la tarjeta nunca contradiga los totales/porcentajes que se muestran en las stats:
//   - votante: usa voto_confirmado (acción real de confirmar/anular, sin cambios).
//   - dirigente / coordinador: siempre cuentan como confirmados automáticos —
//     getEstadisticas los suma a totalConfirmados sin condicionar por ningún campo
//     propio → se muestran como "Confirmado por rol".
//   - subcoordinador: NO es automático — getEstadisticas usa subsConfirmados =
//     subcoordinadores.filter(s => s.confirmado === true), así que la tarjeta debe
//     leer ese mismo campo explícito (true → "Confirmado", false/ausente → "Pendiente").
export const getEstadoConfirmacionTarjeta = (persona, tipo) => {
  if (tipo === "votante") {
    return persona?.voto_confirmado === true ? "votante_confirmado" : "votante_pendiente";
  }
  if (tipo === "dirigente" || tipo === "coordinador") {
    return "confirmado_por_rol";
  }
  if (tipo === "subcoordinador") {
    return persona?.confirmado === true ? "sub_confirmado" : "sub_pendiente";
  }
  return null;
};
