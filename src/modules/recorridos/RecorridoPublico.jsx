// ======================= CONTENEDOR PÚBLICO DEL CHOFER (/recorrido) =======================
// Montado directamente desde src/main.jsx — nunca junto a App/Dashboard. Decide
// entre mostrar el login o la pantalla de recorrido activo según haya o no una
// sesión de chofer guardada en sessionStorage (persistente dentro de la misma
// pestaña, igual que el patrón ya usado en AsistenciaPublica.jsx).
//
// El código de recorrido ingresado NUNCA se guarda acá ni en ningún lado — lo
// único que persiste es la sesión ya autenticada (token, vencimiento, sesion_id,
// nombre/jornada) y, una vez que arranca el tracking, el momento en que arrancó
// (para poder seguir mostrando "hora de inicio" correcta si el chofer refresca
// la página a mitad de un recorrido).
import React, { useState } from "react";
import RecorridoChoferLogin from "./RecorridoChoferLogin";
import RecorridoChoferActivo from "./RecorridoChoferActivo";

const SESION_STORAGE_KEY = "recorrido_sesion_v1";

const leerSesion = () => {
  try {
    const raw = sessionStorage.getItem(SESION_STORAGE_KEY);
    if (!raw) return null;
    const sesion = JSON.parse(raw);
    if (!sesion?.token || !sesion?.sesionId) return null;
    if (sesion.expiresAt && new Date(sesion.expiresAt).getTime() < Date.now()) return null;
    return sesion;
  } catch {
    return null;
  }
};

const guardarSesion = (sesion) => {
  try {
    sessionStorage.setItem(SESION_STORAGE_KEY, JSON.stringify(sesion));
  } catch {
    // sessionStorage no disponible: la sesión sigue funcionando en memoria para
    // esta misma carga de página, solo no sobrevive a un refresh.
  }
};

const limpiarSesion = () => {
  try {
    sessionStorage.removeItem(SESION_STORAGE_KEY);
  } catch {
    // no crítico
  }
};

const RecorridoPublico = () => {
  const [sesion, setSesion] = useState(() => leerSesion());

  const ingresar = (nuevaSesion) => {
    guardarSesion(nuevaSesion);
    setSesion(nuevaSesion);
  };

  // Persiste cambios parciales (ej. trackingIniciadoAt) sin perder el resto de
  // la sesión ya guardada.
  const actualizarSesion = (parcial) => {
    setSesion((actual) => {
      const nueva = { ...actual, ...parcial };
      guardarSesion(nueva);
      return nueva;
    });
  };

  // Sesión realmente inválida/vencida (rechazada por el backend): hay que volver
  // al login de inmediato, no tiene sentido seguir mostrando la pantalla activa.
  const salirPorSesionInvalida = () => {
    limpiarSesion();
    setSesion(null);
  };

  // Recorrido finalizado con éxito: solo se limpia el storage persistente (para
  // que un refresh posterior no intente retomar una sesión ya finalizada) — el
  // componente activo sigue montado y es quien decide mostrar su propia pantalla
  // de "recorrido finalizado" en vez de saltar de golpe al login.
  const marcarFinalizadoSinDesmontar = () => {
    limpiarSesion();
  };

  if (!sesion) {
    return <RecorridoChoferLogin onIngresoExitoso={ingresar} />;
  }

  return (
    <RecorridoChoferActivo
      sesion={sesion}
      onActualizarSesion={actualizarSesion}
      onSesionInvalida={salirPorSesionInvalida}
      onFinalizado={marcarFinalizadoSinDesmontar}
    />
  );
};

export default RecorridoPublico;
