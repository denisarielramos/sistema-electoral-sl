// ======================= HOOK: CONFIGURACIÓN DE MAPEO (radio permitido, precisión GPS) =======================
// Nunca hardcodear el radio permitido ni la precisión GPS máxima en componentes:
// siempre se leen de configuracion_mapeo vía este hook.
import { useCallback, useEffect, useState } from "react";
import { fetchConfiguracionMapeo } from "../services/mapeoService";

const DEFAULT_CONFIG = { radio_permitido_metros: 100, precision_gps_maxima_metros: 50 };

export const useMapeoConfiguracion = () => {
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const recargar = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchConfiguracionMapeo();
      setConfig(data || DEFAULT_CONFIG);
    } catch (err) {
      setError(err.message || "Error al cargar la configuración de mapeo.");
      setConfig(DEFAULT_CONFIG);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    recargar();
  }, [recargar]);

  return { config: config || DEFAULT_CONFIG, loading, error, recargar };
};
