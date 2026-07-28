// ======================= BADGE: ESTADO VISUAL DEL HOGAR =======================
import React from "react";
import { ESTADOS_MAPA, ESTADO_MAPA_LABEL, ESTADO_MAPA_COLOR } from "../../utils/geoHelpers";

const EstadoMapaBadge = ({ estado }) => {
  const color = ESTADO_MAPA_COLOR[estado] || ESTADO_MAPA_COLOR[ESTADOS_MAPA.SIN_UBICACION];
  const label = ESTADO_MAPA_LABEL[estado] || "Desconocido";
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs font-medium border"
      style={{ color, borderColor: color, backgroundColor: `${color}1a` }}
    >
      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
      {label}
    </span>
  );
};

export default EstadoMapaBadge;
