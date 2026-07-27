// ======================= HOOK: HOGARES (mapeo territorial) =======================
// Carga los hogares visibles para currentUser (alcance ya resuelto del lado del
// servidor por mapeo_listar_hogares) y expone helpers de mutación que refrescan la
// lista. Nunca descarga el padrón completo: solo lo que el RPC devuelve para el rol.
import { useCallback, useEffect, useState } from "react";
import {
  listarHogares,
  crearHogar,
  actualizarHogar,
  verificarHogar,
  asociarVotanteAHogar,
  desasociarVotanteDeHogar,
} from "../services/mapeoService";

export const useHogares = (currentUser) => {
  const [hogares, setHogares] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const recargar = useCallback(async () => {
    if (!currentUser) return;
    setLoading(true);
    setError(null);
    try {
      const data = await listarHogares(currentUser);
      setHogares(data);
    } catch (err) {
      setError(err.message || "Error al cargar los hogares.");
    } finally {
      setLoading(false);
    }
  }, [currentUser]);

  useEffect(() => {
    recargar();
  }, [recargar]);

  const crear = useCallback(
    async (payload) => {
      const hogar = await crearHogar(currentUser, payload);
      await recargar();
      return hogar;
    },
    [currentUser, recargar]
  );

  const actualizar = useCallback(
    async (hogarId, payload) => {
      const hogar = await actualizarHogar(currentUser, hogarId, payload);
      await recargar();
      return hogar;
    },
    [currentUser, recargar]
  );

  const verificar = useCallback(
    async (hogarId, aprobar, ubicacionActualizadaAt, observacion) => {
      const hogar = await verificarHogar(currentUser, hogarId, aprobar, ubicacionActualizadaAt, observacion);
      await recargar();
      return hogar;
    },
    [currentUser, recargar]
  );

  const asociarVotante = useCallback(
    async (hogarId, votanteCi) => {
      const fila = await asociarVotanteAHogar(currentUser, hogarId, votanteCi);
      await recargar();
      return fila;
    },
    [currentUser, recargar]
  );

  const desasociarVotante = useCallback(
    async (hogarId, votanteCi) => {
      await desasociarVotanteDeHogar(currentUser, hogarId, votanteCi);
      await recargar();
    },
    [currentUser, recargar]
  );

  return {
    hogares,
    loading,
    error,
    recargar,
    crear,
    actualizar,
    verificar,
    asociarVotante,
    desasociarVotante,
  };
};
