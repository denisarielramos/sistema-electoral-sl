// ======================= MAPA DE REPLAY (Google Maps) =======================
// Dibuja la polilínea completa de UNA sesión, marcadores de inicio/fin,
// paradas y alertas, y un marcador que se mueve con la reproducción. A
// diferencia del mapa en vivo, los datos son estáticos (ya se cargaron
// todos los puntos de esta sesión) — lo único que cambia entre renders es
// `indiceActual`, así que solo se mueve un marcador, nunca se redibuja el
// resto.
import React, { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { hayClaveGoogleMaps, cargarGoogleMaps } from "./googleMapsLoader";

const MapaReplay = ({ puntos, paradas, alertasConPosicion, indiceActual }) => {
  const contenedorRef = useRef(null);
  const mapRef = useRef(null);
  const marcadorActualRef = useRef(null);
  const [estadoCarga, setEstadoCarga] = useState(hayClaveGoogleMaps() ? "cargando" : "sin_clave");

  useEffect(() => {
    if (!hayClaveGoogleMaps() || puntos.length === 0) return;
    let cancelado = false;
    (async () => {
      try {
        await cargarGoogleMaps();
        if (cancelado || !contenedorRef.current) return;
        const g = window.google.maps;
        const map = new g.Map(contenedorRef.current, {
          zoom: 13,
          clickableIcons: false,
          streetViewControl: false,
        });
        mapRef.current = map;

        const ruta = puntos.map((p) => ({ lat: p.lat, lng: p.lng }));
        new g.Polyline({ path: ruta, strokeColor: "#94a3b8", strokeOpacity: 0.9, strokeWeight: 3, map });

        new g.Marker({
          position: ruta[0],
          map,
          label: { text: "I", color: "#fff", fontSize: "11px" },
          icon: { path: g.SymbolPath.CIRCLE, scale: 8, fillColor: "#22c55e", fillOpacity: 1, strokeColor: "#fff", strokeWeight: 1.5 },
          title: "Inicio",
        });
        new g.Marker({
          position: ruta[ruta.length - 1],
          map,
          label: { text: "F", color: "#fff", fontSize: "11px" },
          icon: { path: g.SymbolPath.CIRCLE, scale: 8, fillColor: "#3b82f6", fillOpacity: 1, strokeColor: "#fff", strokeWeight: 1.5 },
          title: "Fin",
        });

        paradas.forEach((p) => {
          new g.Marker({
            position: { lat: p.lat, lng: p.lng },
            map,
            icon: {
              path: g.SymbolPath.CIRCLE,
              scale: 6,
              fillColor: p.es_alerta ? "#ef4444" : "#f59e0b",
              fillOpacity: 0.9,
              strokeColor: "#fff",
              strokeWeight: 1,
            },
            title: p.es_alerta ? "Parada prolongada (alerta)" : "Parada",
          });
        });

        alertasConPosicion.forEach((a) => {
          new g.Marker({
            position: { lat: a.lat, lng: a.lng },
            map,
            icon: { path: g.SymbolPath.BACKWARD_CLOSED_ARROW, scale: 4, fillColor: "#ef4444", fillOpacity: 1, strokeColor: "#fff", strokeWeight: 1 },
            title: `Alerta: ${a.tipo}`,
          });
        });

        marcadorActualRef.current = new g.Marker({
          position: ruta[0],
          map,
          icon: { path: g.SymbolPath.CIRCLE, scale: 8, fillColor: "#7c3aed", fillOpacity: 1, strokeColor: "#fff", strokeWeight: 2 },
          zIndex: 999,
        });

        const bounds = new g.LatLngBounds();
        ruta.forEach((p) => bounds.extend(p));
        map.fitBounds(bounds);

        setEstadoCarga("listo");
      } catch {
        if (!cancelado) setEstadoCarga("error");
      }
    })();
    return () => {
      cancelado = true;
    };
    // Los datos de la sesión son estáticos para este componente (se cargan
    // una sola vez por sesión abierta) — intencionalmente solo depende de
    // `puntos.length` para no reconstruir el mapa en cada tick de reproducción.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [puntos.length]);

  useEffect(() => {
    if (estadoCarga !== "listo" || !marcadorActualRef.current) return;
    const punto = puntos[indiceActual];
    if (punto) marcadorActualRef.current.setPosition({ lat: punto.lat, lng: punto.lng });
  }, [indiceActual, puntos, estadoCarga]);

  if (!hayClaveGoogleMaps()) {
    return (
      <div className="flex items-center justify-center h-80 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-500 text-center px-6">
        Google Maps no está configurado. Definí VITE_GOOGLE_MAPS_API_KEY.
      </div>
    );
  }

  if (estadoCarga === "error") {
    return (
      <div className="flex items-center justify-center h-80 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600 text-center px-6">
        No se pudo cargar Google Maps.
      </div>
    );
  }

  return (
    <div className="relative h-[420px] rounded-xl overflow-hidden border border-slate-200">
      <div ref={contenedorRef} className="absolute inset-0" />
      {estadoCarga === "cargando" && (
        <div className="absolute inset-0 flex items-center justify-center bg-white/70">
          <Loader2 className="w-6 h-6 text-brand-600 animate-spin" />
        </div>
      )}
    </div>
  );
};

export default MapaReplay;
