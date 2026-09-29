// ======================= MAPA: UBICACIÓN + RADIO DE UN PUNTO DE ASISTENCIA =======================
// Mismo patrón que src/components/mapeo/LeafletSeleccionarUbicacion.jsx (click en el
// mapa + marcador arrastrable, mismo TileLayer de OpenStreetMap sin API key, mismo
// truco de L.divIcon para no depender de los assets de ícono default de Leaflet),
// agregando un <Circle> para visualizar el radio permitido en metros.
//
// `editable` controla si el click/arrastre están habilitados: hasta que exista
// asistencia_admin_actualizar_punto no hay forma de persistir un cambio, así que
// AsistenciaAdmin lo usa en modo solo lectura por ahora.
import React, { useEffect, useMemo, useRef } from "react";
import { MapContainer, TileLayer, Marker, Circle, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

const CENTRO_DEFECTO = [-25.2637, -57.5759];

const icono = L.divIcon({
  className: "",
  html: `<span style="
    display:block; width:22px; height:22px; border-radius:9999px 9999px 9999px 0;
    background:#2563eb; border:2px solid white; box-shadow:0 1px 4px rgba(0,0,0,0.4);
    transform: rotate(45deg);
  "></span>`,
  iconSize: [22, 22],
  iconAnchor: [11, 22],
});

const ClicksDelMapa = ({ onPick }) => {
  useMapEvents({
    click(e) {
      onPick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
};

// Ver la nota equivalente en LeafletSeleccionarUbicacion.jsx: recentra una sola vez
// cuando llegan las primeras coordenadas válidas, con requestAnimationFrame + sin
// animación para evitar errores de Leaflet si el mapa se desmonta durante la transición.
const RecentrarAlPrimerPunto = ({ latitud, longitud }) => {
  const map = useMap();
  const yaCentrado = useRef(false);
  useEffect(() => {
    if (latitud === null || latitud === undefined || longitud === null || longitud === undefined) return;
    if (yaCentrado.current) return;
    yaCentrado.current = true;
    const frame = requestAnimationFrame(() => map.setView([latitud, longitud], 16, { animate: false }));
    return () => cancelAnimationFrame(frame);
  }, [latitud, longitud, map]);
  return null;
};

const MapaPuntoAsistencia = ({ latitud, longitud, radioMetros, onChange, editable = false }) => {
  const markerRef = useRef(null);
  const centro = useMemo(
    () => (latitud !== null && latitud !== undefined && longitud !== null && longitud !== undefined
      ? [latitud, longitud]
      : CENTRO_DEFECTO),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const posicion =
    latitud !== null && latitud !== undefined && longitud !== null && longitud !== undefined
      ? [latitud, longitud]
      : null;

  return (
    <div className="rounded-xl overflow-hidden border border-slate-200 h-64 relative isolate z-0">
      <MapContainer center={centro} zoom={posicion ? 16 : 12} scrollWheelZoom style={{ height: "100%", width: "100%" }}>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {editable && <ClicksDelMapa onPick={onChange} />}
        <RecentrarAlPrimerPunto latitud={latitud} longitud={longitud} />
        {posicion && (
          <Marker
            position={posicion}
            icon={icono}
            draggable={editable}
            ref={markerRef}
            eventHandlers={
              editable
                ? {
                    dragend: () => {
                      const marker = markerRef.current;
                      if (!marker) return;
                      const { lat, lng } = marker.getLatLng();
                      onChange(lat, lng);
                    },
                  }
                : undefined
            }
          />
        )}
        {posicion && radioMetros > 0 && (
          <Circle center={posicion} radius={radioMetros} pathOptions={{ color: "#2563eb", fillColor: "#2563eb", fillOpacity: 0.1 }} />
        )}
      </MapContainer>
      {editable && !posicion && (
        <div className="absolute inset-x-0 bottom-2 flex justify-center pointer-events-none">
          <span className="bg-white/95 border border-slate-200 rounded-lg px-3 py-1 text-xs text-slate-500 shadow-sm">
            Toque el mapa para marcar la ubicación
          </span>
        </div>
      )}
    </div>
  );
};

export default MapaPuntoAsistencia;
