// ======================= HOOK: BITÁCORA DE VISITAS =======================
import { useCallback, useEffect, useState } from "react";
import { listarVisitas, confirmarVisita } from "../services/mapeoService";

export const useVisitas = (currentUser, hogarId = null) => {
  const [visitas, setVisitas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const recargar = useCallback(async () => {
    if (!currentUser) return;
    setLoading(true);
    setError(null);
    try {
      const data = await listarVisitas(currentUser, hogarId);
      setVisitas(data);
    } catch (err) {
      setError(err.message || "Error al cargar la bitácora de visitas.");
    } finally {
      setLoading(false);
    }
  }, [currentUser, hogarId]);

  useEffect(() => {
    recargar();
  }, [recargar]);

  const registrarVisita = useCallback(
    async (hogarIdDestino, payload) => {
      const visita = await confirmarVisita(currentUser, hogarIdDestino, payload);
      await recargar();
      return visita;
    },
    [currentUser, recargar]
  );

  return { visitas, loading, error, recargar, registrarVisita };
};
