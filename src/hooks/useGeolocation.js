// ======================= HOOK: GEOLOCALIZACIÓN DEL DISPOSITIVO =======================
// Envuelve navigator.geolocation con estados claros de carga/error/reintento. Nunca
// decide por sí mismo si una visita es válida — solo captura el punto y la precisión
// que reporta el dispositivo; la validación definitiva es del servidor
// (mapeo_confirmar_visita). Tampoco permite cargar coordenadas manualmente: esa es
// la única vía para obtener la posición "real" del visitante.
import { useCallback, useRef, useState } from "react";

const MENSAJES_ERROR = {
  1: "Permiso de ubicación denegado. Habilítelo en la configuración del navegador para continuar.",
  2: "No se pudo determinar la ubicación (señal GPS no disponible). Intente nuevamente al aire libre.",
  3: "La solicitud de ubicación demoró demasiado. Intente nuevamente.",
};

export const useGeolocation = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [posicion, setPosicion] = useState(null); // { latitud, longitud, precisionGps, timestamp }
  // Identifica la solicitud "vigente" — reset() y cada nueva solicitarUbicacion() la
  // incrementan, así un callback de getCurrentPosition que llega tarde (p. ej. porque
  // el usuario cerró el modal mientras el GPS respondía) puede detectar que ya no es
  // la solicitud vigente y evitar repoblar posicion/error con un dato obsoleto. El
  // componente que llama sigue mostrado (oculto, no desmontado) mientras el modal está
  // cerrado, así que sin esto un fix viejo podría aparecer como "listo para confirmar"
  // al reabrir el modal para otro hogar.
  const solicitudVigenteRef = useRef(0);

  const solicitarUbicacion = useCallback(({ altaPrecision = true, timeoutMs = 15000 } = {}) => {
    const solicitudId = ++solicitudVigenteRef.current;
    const esVigente = () => solicitudId === solicitudVigenteRef.current;

    return new Promise((resolve) => {
      if (!navigator.geolocation) {
        const err = "Este dispositivo/navegador no soporta geolocalización.";
        if (esVigente()) setError(err);
        resolve(null);
        return;
      }

      setLoading(true);
      setError(null);

      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const resultado = {
            latitud: pos.coords.latitude,
            longitud: pos.coords.longitude,
            precisionGps: pos.coords.accuracy,
            timestamp: pos.timestamp,
          };
          if (esVigente()) {
            setPosicion(resultado);
            setLoading(false);
          }
          resolve(resultado);
        },
        (err) => {
          if (esVigente()) {
            setError(MENSAJES_ERROR[err.code] || `Error de geolocalización: ${err.message}`);
            setLoading(false);
          }
          resolve(null);
        },
        {
          enableHighAccuracy: altaPrecision,
          timeout: timeoutMs,
          maximumAge: 0,
        }
      );
    });
  }, []);

  const reset = useCallback(() => {
    solicitudVigenteRef.current += 1; // invalida cualquier callback de GPS pendiente
    setPosicion(null);
    setError(null);
    setLoading(false);
  }, []);

  return { loading, error, posicion, solicitarUbicacion, reset };
};
