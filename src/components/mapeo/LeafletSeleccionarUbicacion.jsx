// ======================= MAPA: SELECCIONAR/CORREGIR UBICACIÓN MANUALMENTE =======================
// Un solo marcador arrastrable + click-en-el-mapa para mover el punto. Usado dentro
// del modal de crear/editar hogar como corrección manual de la posición capturada
// por GPS (o para ubicar el hogar cuando no hay GPS disponible).
import React, { useEffect, useMemo, useRef } from "react";
import { MapContainer, TileLayer, Marker, useMap, useMapEvents } from "react-leaflet";
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

// react-leaflet solo usa center/zoom de MapContainer como valores INICIALES — cambios
// posteriores en esas props no mueven el mapa ya montado. Esto recentra una única vez
// cuando llegan las primeras coordenadas válidas (p. ej. el hogar en edición tarda un
// tick en cargar su ubicación guardada, o un fix GPS llega después de montar el mapa
// con el punto todavía sin marcar). Un ref (no state) evita reintentos: solo la
// PRIMERA aparición de coordenadas válidas recentra; después el usuario puede mover
// el marcador libremente sin que el mapa le pelee la vista.
const RecentrarAlPrimerPunto = ({ latitud, longitud }) => {
  const map = useMap();
  const yaCentrado = useRef(false);
  useEffect(() => {
    if (latitud === null || latitud === undefined || longitud === null || longitud === undefined) return;
    if (yaCentrado.current) return;
    yaCentrado.current = true;
    // requestAnimationFrame: si el Marker se está montando en este mismo ciclo (la
    // posición pasó de null a válida en el mismo render), Leaflet todavía no terminó
    // de inicializar el DOM/posición interna del ícono (_leaflet_pos) — llamar
    // setView() en el mismo tick puede intentar reposicionarlo antes de que exista y
    // lanzar un error. Diferir un frame le da tiempo a Leaflet de terminar de montarlo.
    // animate: false — sin esto, el cambio de zoom (12 -> 16) dispara la animación
    // de zoom de Leaflet, que agenda su propio callback de finalización
    // (_onZoomTransitionEnd) para cuando termine la transición CSS. Este mapa vive
    // dentro de un modal que puede cerrarse (desmontando el MapContainer) antes de
    // que esa transición termine — el callback diferido entonces se ejecuta contra
    // un mapPane ya destruido y lanza sobre _leaflet_pos. Desactivar la animación
    // hace que el cambio de vista sea síncrono, sin callback diferido que pueda
    // sobrevivir al desmontaje.
    const frame = requestAnimationFrame(() => map.setView([latitud, longitud], 16, { animate: false }));
    return () => cancelAnimationFrame(frame);
  }, [latitud, longitud, map]);
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
        <RecentrarAlPrimerPunto latitud={latitud} longitud={longitud} />
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
