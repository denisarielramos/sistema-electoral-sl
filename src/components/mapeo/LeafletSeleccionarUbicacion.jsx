// ======================= MAPA: SELECCIONAR/CORREGIR UBICACIÓN MANUALMENTE =======================
// Un solo marcador arrastrable + click-en-el-mapa para mover el punto. Usado dentro
// del modal de crear/editar hogar como corrección manual de la posición capturada
// por GPS (o para ubicar el hogar cuando no hay GPS disponible).
import React, { useMemo, useRef } from "react";
import { MapContainer, TileLayer, Marker, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

const CENTRO_DEFECTO = [-25.2637, -57.5759];

const icono = L.divIcon({
  className: "",
  html: `<span style="
    display:block; width:22px; height:22px; border-radius:9999px 9999px 9999px 0;
    background:#b91c1c; border:2px solid white; box-shadow:0 1px 4px rgba(0,0,0,0.4);
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

const LeafletSeleccionarUbicacion = ({ latitud, longitud, onChange }) => {
  const markerRef = useRef(null);
  const centro = useMemo(
    () => (latitud !== null && latitud !== undefined && longitud !== null && longitud !== undefined
      ? [latitud, longitud]
      : CENTRO_DEFECTO),
    // Solo se usa como centro inicial — no se re-centra en cada cambio para no pelear
    // con el usuario mientras arrastra el marcador.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const posicionMarcador =
    latitud !== null && latitud !== undefined && longitud !== null && longitud !== undefined
      ? [latitud, longitud]
      : null;

  return (
    <div className="rounded-xl overflow-hidden border border-slate-200 h-64 relative">
      <MapContainer center={centro} zoom={posicionMarcador ? 16 : 12} scrollWheelZoom style={{ height: "100%", width: "100%" }}>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <ClicksDelMapa onPick={onChange} />
        {posicionMarcador && (
          <Marker
            position={posicionMarcador}
            icon={icono}
            draggable
            ref={markerRef}
            eventHandlers={{
              dragend: () => {
                const marker = markerRef.current;
                if (!marker) return;
                const { lat, lng } = marker.getLatLng();
                onChange(lat, lng);
              },
            }}
          />
        )}
      </MapContainer>
      {!posicionMarcador && (
        <div className="absolute inset-x-0 bottom-2 flex justify-center pointer-events-none">
          <span className="bg-white/95 border border-slate-200 rounded-lg px-3 py-1 text-xs text-slate-500 shadow-sm">
            Toque el mapa para marcar la ubicación
          </span>
        </div>
      )}
    </div>
  );
};

export default LeafletSeleccionarUbicacion;
