// ======================= HOOK: CONFIGURACIÓN DE MAPEO (radio permitido, precisión GPS) =======================
// Nunca hardcodear el radio permitido ni la precisión GPS máxima en componentes:
// siempre se leen de configuracion_mapeo vía este hook.
import { useCallback, useEffect, useState } from "react";
import { fetchConfiguracionMapeo } from "../services/mapeoService";

export const useMapeoConfiguracion = () => {
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const recargar = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchConfiguracionMapeo();
      setConfig(data);
    } catch (err) {
      // No reemplazar la configuración por valores hardcodeados (100/50) ni
      // borrarla: si ya había una configuración real cargada, se mantiene tal
      // cual en vez de pisarla con un default que puede no coincidir con la del
      // servidor (radio/precisión configurados por superadmin). Los consumidores
      // deben tratar config === null como "todavía no disponible" y bloquear la
      // confirmación de visitas hasta que recargar() tenga éxito, en vez de
      // asumir silenciosamente un límite que el servidor podría no compartir.
      setError(err.message || "Error al cargar la configuración de mapeo.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    recargar();
  }, [recargar]);

  return { config, loading, error, recargar };
};
