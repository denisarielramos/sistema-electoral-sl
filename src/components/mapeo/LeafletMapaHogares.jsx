// ======================= MAPA: HOGARES (Leaflet + OpenStreetMap) =======================
// Sin claves pagas: OpenStreetMap vía react-leaflet. Un marcador por HOGAR (nunca uno
// por votante) coloreado según su estado visual (ver utils/geoHelpers.getEstadoMapaHogar).
import React, { useMemo } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { getEstadoMapaHogar, ESTADO_MAPA_COLOR, ESTADO_MAPA_LABEL } from "../../utils/geoHelpers";

// Centro por defecto: Asunción, Paraguay (el mapa se re-centra igual si hay hogares).
const CENTRO_DEFECTO = [-25.2637, -57.5759];

const crearIcono = (color, seleccionado) =>
  L.divIcon({
    className: "",
    html: `<span style="
      display:block;
      width:${seleccionado ? 22 : 16}px;
      height:${seleccionado ? 22 : 16}px;
      border-radius:9999px;
      background:${color};
      border:2px solid white;
      box-shadow:0 1px 4px rgba(0,0,0,0.4);
    "></span>`,
    iconSize: [seleccionado ? 22 : 16, seleccionado ? 22 : 16],
    iconAnchor: [seleccionado ? 11 : 8, seleccionado ? 11 : 8],
  });

// Ajusta los límites del mapa a los hogares visibles (se re-ejecuta si cambia la lista).
const AjustarLimites = ({ hogares }) => {
  const map = useMap();
  React.useEffect(() => {
    const puntos = hogares
      .filter((h) => h.latitud !== null && h.latitud !== undefined && h.longitud !== null && h.longitud !== undefined)
      .map((h) => [h.latitud, h.longitud]);
    if (puntos.length === 0) return;
    if (puntos.length === 1) {
      map.setView(puntos[0], 15);
    } else {
      map.fitBounds(puntos, { padding: [40, 40], maxZoom: 16 });
    }
  }, [hogares, map]);
  return null;
};

const LeafletMapaHogares = ({ hogares, hogarSeleccionadoId, onSelectHogar }) => {
  const hogaresConUbicacion = useMemo(
    () => (hogares || []).filter((h) => h.latitud !== null && h.latitud !== undefined && h.longitud !== null && h.longitud !== undefined),
    [hogares]
  );

  return (
    <div className="rounded-xl overflow-hidden border border-slate-200 h-[420px] sm:h-[520px] relative">
      <MapContainer center={CENTRO_DEFECTO} zoom={12} scrollWheelZoom style={{ height: "100%", width: "100%" }}>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <AjustarLimites hogares={hogaresConUbicacion} />
        {hogaresConUbicacion.map((hogar) => {
          const estado = getEstadoMapaHogar(hogar);
          const color = ESTADO_MAPA_COLOR[estado];
          const seleccionado = hogar.id === hogarSeleccionadoId;
          return (
            <Marker
              key={hogar.id}
              position={[hogar.latitud, hogar.longitud]}
              icon={crearIcono(color, seleccionado)}
              eventHandlers={{ click: () => onSelectHogar?.(hogar) }}
            >
              <Popup>
                <div className="text-xs space-y-0.5">
                  <p className="font-semibold">{hogar.nombre_familia || "Hogar sin nombre"}</p>
                  <p className="text-slate-500">{hogar.direccion || "Sin dirección"}</p>
                  <p style={{ color }}>{ESTADO_MAPA_LABEL[estado]}</p>
                </div>
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>
    </div>
  );
};

export default LeafletMapaHogares;
