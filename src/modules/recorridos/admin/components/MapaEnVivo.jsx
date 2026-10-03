// ======================= MAPA EN VIVO (Google Maps) =======================
// Carga perezosa de la API de Google Maps (vía @googlemaps/js-api-loader) +
// clustering (@googlemaps/markerclusterer) para hasta ~600 marcadores.
// Si VITE_GOOGLE_MAPS_API_KEY no está definida, el componente NUNCA rompe el
// build ni la pantalla: muestra un aviso y el resto del panel (stat cards,
// filtros, tabla) sigue funcionando igual.
//
// Los marcadores se actualizan EN LUGAR (posición + ícono) en cada ciclo de
// polling — nunca se recrea el mapa ni se hace fitBounds de nuevo salvo la
// primera vez que hay datos, para no "saltar" la vista cada 5 segundos.
import React, { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { colorEstado } from "../recorridoAdminUtils";
import { hayClaveGoogleMaps, cargarGoogleMaps } from "./googleMapsLoader";

const iconoParaEstado = (estado) => ({
  path: window.google.maps.SymbolPath.CIRCLE,
  scale: 7,
  fillColor: colorEstado(estado),
  fillOpacity: 1,
  strokeColor: "#ffffff",
  strokeWeight: 1.5,
});

const MapaEnVivo = ({ choferes, onSeleccionar }) => {
  const contenedorRef = useRef(null);
  const mapRef = useRef(null);
  const clustererRef = useRef(null);
  const markersRef = useRef(new Map()); // sesion_id -> google.maps.Marker
  const boundsAjustadosRef = useRef(false);
  const onSeleccionarRef = useRef(onSeleccionar);
  onSeleccionarRef.current = onSeleccionar;

  const [estadoCarga, setEstadoCarga] = useState(hayClaveGoogleMaps() ? "cargando" : "sin_clave");

  useEffect(() => {
    if (!hayClaveGoogleMaps()) return;
    let cancelado = false;
    (async () => {
      try {
        await cargarGoogleMaps();
        const { MarkerClusterer } = await import("@googlemaps/markerclusterer");
        if (cancelado || !contenedorRef.current) return;
        mapRef.current = new window.google.maps.Map(contenedorRef.current, {
          center: { lat: -34.9011, lng: -56.1645 },
          zoom: 12,
          clickableIcons: false,
          streetViewControl: false,
        });
        clustererRef.current = new MarkerClusterer({ map: mapRef.current, markers: [] });
        setEstadoCarga("listo");
      } catch {
        if (!cancelado) setEstadoCarga("error");
      }
    })();
    return () => {
      cancelado = true;
    };
  }, []);

  useEffect(() => {
    if (estadoCarga !== "listo" || !mapRef.current || !clustererRef.current) return;
    const clusterer = clustererRef.current;
    const vigentes = new Set();
    const nuevos = [];
    const quitados = [];

    choferes.forEach((c) => {
      if (c.lat == null || c.lng == null || !c.sesion_id) return;
      vigentes.add(c.sesion_id);
      const posicion = { lat: c.lat, lng: c.lng };
      let marker = markersRef.current.get(c.sesion_id);
      if (marker) {
        marker.setPosition(posicion);
        marker.setIcon(iconoParaEstado(c.estado));
        marker.chofer = c;
      } else {
        marker = new window.google.maps.Marker({ position: posicion, icon: iconoParaEstado(c.estado) });
        marker.chofer = c;
        marker.addListener("click", () => onSeleccionarRef.current?.(marker.chofer));
        markersRef.current.set(c.sesion_id, marker);
        nuevos.push(marker);
      }
    });

    for (const [sesionId, marker] of markersRef.current.entries()) {
      if (!vigentes.has(sesionId)) {
        quitados.push(marker);
        markersRef.current.delete(sesionId);
      }
    }

    if (quitados.length > 0) clusterer.removeMarkers(quitados, true);
    if (nuevos.length > 0) clusterer.addMarkers(nuevos);

    if (!boundsAjustadosRef.current && markersRef.current.size > 0) {
      const bounds = new window.google.maps.LatLngBounds();
      markersRef.current.forEach((m) => bounds.extend(m.getPosition()));
      mapRef.current.fitBounds(bounds);
      boundsAjustadosRef.current = true;
    }
  }, [choferes, estadoCarga]);

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
        No se pudo cargar Google Maps. Verificá que la clave VITE_GOOGLE_MAPS_API_KEY sea válida.
      </div>
    );
  }

  return (
    <div className="relative h-[480px] rounded-xl overflow-hidden border border-slate-200">
      <div ref={contenedorRef} className="absolute inset-0" />
      {estadoCarga === "cargando" && (
        <div className="absolute inset-0 flex items-center justify-center bg-white/70">
          <Loader2 className="w-6 h-6 text-brand-600 animate-spin" />
        </div>
      )}
    </div>
  );
};

export default MapaEnVivo;
