import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import AsistenciaPublica from "./modules/asistencia/AsistenciaPublica.jsx";
import "./tailwind.css";   // ← IMPORTANTE

// ======================= DISPATCHER MÍNIMO DE RUTAS PÚBLICAS =======================
// /q/:slug y /check/:token son el único ruteo por URL del proyecto: el flujo público
// de asistencia (sin login) se resuelve ACÁ, antes de montar App, para que entrar a
// esas rutas nunca monte App/Dashboard ni corra la restauración de sesión del sistema
// actual. Cualquier otra ruta sigue funcionando exactamente igual que antes (App
// decide qué mostrar, sin ningún cambio de comportamiento ni de orden de hooks).
const path = window.location.pathname;
let vista;
if (path.startsWith("/q/")) {
  vista = <AsistenciaPublica modo="qr" valor={path.slice(3).split("/")[0]} />;
} else if (path.startsWith("/check/")) {
  vista = <AsistenciaPublica modo="check" valor={path.slice(7).split("/")[0]} />;
} else {
  vista = <App />;
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    {vista}
  </React.StrictMode>
);
