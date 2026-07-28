// ======================= APP SISTEMA ELECTORAL =======================
// App maneja SOLO sesión/login.
// Dashboard maneja TODO lo demás.
//
// Pantalla de acceso:
//   - Formulario principal: código de acceso (dirigente / coordinador / subcoordinador)
//   - Enlace secundario: "Acceso Superadmin" → abre formulario con usuario + contraseña

import React, { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";
import { ShieldCheck, Eye, EyeOff, KeyRound, ChevronLeft, Lock } from "lucide-react";
import Dashboard from "./components/Dashboard";
import { normalizeCI } from "./utils/estructuraHelpers";

// ======================= SUPERADMINS LOCALES =======================
const SUPERADMINS = [
  { ci: "4630621", pass: "16052018", nombre: "Denis", apellido: "Ramos" },
  { ci: "4291234", pass: "112233", nombre: "Victor", apellido: "Urunaga" },
  { ci: "2505303", pass: "arzamendia2026", nombre: "Carlos", apellido: "Arzamendia" },
];

const App = () => {
  // ======================= SESIÓN =======================
  const [currentUser, setCurrentUser] = useState(null);

  // Vista activa: "estructura" | "superadmin"
  const [vista, setVista] = useState("estructura");

  // Formulario estructura (código de acceso)
  const [loginCode, setLoginCode] = useState("");
  const [isLoggingCode, setIsLoggingCode] = useState(false);

  // Formulario superadmin (CI + contraseña)
  const [adminCI, setAdminCI] = useState("");
  const [adminPass, setAdminPass] = useState("");
  const [showAdminPass, setShowAdminPass] = useState(false);
  const [isLoggingAdmin, setIsLoggingAdmin] = useState(false);

  // ======================= SESIÓN PERSISTENTE =======================
  useEffect(() => {
    const saved = localStorage.getItem("currentUser");
    if (!saved) return;
    try {
      const u = JSON.parse(saved);
      if (u && u.ci && u.role) setCurrentUser(u);
    } catch (e) {
      console.error("Error leyendo sesión local:", e);
    }
  }, []);

  const saveUser = (u) => {
    setCurrentUser(u);
    localStorage.setItem("currentUser", JSON.stringify(u));
  };

  const handleLogout = () => {
    setCurrentUser(null);
    localStorage.removeItem("currentUser");
    setLoginCode("");
    setAdminCI("");
    setAdminPass("");
    setVista("estructura");
  };

  // ======================= LOGIN SUPERADMIN =======================
  const handleLoginSuperadmin = async () => {
    const ci = adminCI.trim();
    const pass = adminPass;
    if (!ci) { alert("Ingrese su CI."); return; }
    if (!pass) { alert("Ingrese su contraseña."); return; }

    setIsLoggingAdmin(true);
    try {
      const sa = SUPERADMINS.find((s) => s.ci === ci);
      if (!sa) { alert("CI de superadmin no encontrado."); return; }
      if (sa.pass !== pass) { alert("Contraseña incorrecta."); return; }
      saveUser({ ci: sa.ci, nombre: sa.nombre, apellido: sa.apellido, role: "superadmin" });
    } finally {
      setIsLoggingAdmin(false);
    }
  };

  // ======================= LOGIN ESTRUCTURA (CÓDIGO) =======================
  const handleLoginEstructura = async () => {
    const code = loginCode.trim();
    if (!code) { alert("Ingrese su código de acceso."); return; }

    setIsLoggingCode(true);
    try {
      // COORDINADOR
      const { data: coord, error: coordErr } = await supabase
        .from("coordinadores")
        .select("ci,login_code,telefono,padron(*)")
        .eq("login_code", code)
        .maybeSingle();
      if (coordErr) console.error("Error login coord:", coordErr);
      if (coord?.padron) {
        saveUser({
          ci: normalizeCI(coord.ci),
          nombre: coord.padron.nombre,
          apellido: coord.padron.apellido,
          telefono: coord.telefono || "",
          role: "coordinador",
          loginCode: code,
        });
        return;
      }

      // SUBCOORDINADOR
      const { data: sub, error: subErr } = await supabase
        .from("subcoordinadores")
        .select("ci,login_code,telefono,coordinador_ci,padron(*)")
        .eq("login_code", code)
        .maybeSingle();
      if (subErr) console.error("Error login sub:", subErr);
      if (sub?.padron) {
        saveUser({
          ci: normalizeCI(sub.ci),
          nombre: sub.padron.nombre,
          apellido: sub.padron.apellido,
          telefono: sub.telefono || "",
          role: "subcoordinador",
          loginCode: code,
        });
        return;
      }

      // DIRIGENTE
      const { data: dirigente, error: dirErr } = await supabase
        .from("dirigentes")
        .select("ci,nombre,apellido,telefono,login_code,activo")
        .eq("login_code", code)
        .eq("activo", true)
        .maybeSingle();
      if (dirErr) console.error("Error login dirigente:", dirErr);
      if (dirigente) {
        saveUser({
          ci: normalizeCI(dirigente.ci),
          nombre: dirigente.nombre,
          apellido: dirigente.apellido || "",
          telefono: dirigente.telefono || "",
          role: "dirigente",
          loginCode: code,
        });
        return;
      }

      alert("Código de acceso no válido.");
    } finally {
      setIsLoggingCode(false);
    }
  };

  const handleKeyDownCode = (e) => {
    if (e.key === "Enter" && !e.nativeEvent.isComposing && e.keyCode !== 229) {
      handleLoginEstructura();
    }
  };

  const handleKeyDownAdmin = (e) => {
    if (e.key === "Enter" && !e.nativeEvent.isComposing && e.keyCode !== 229) {
      handleLoginSuperadmin();
    }
  };

  // ======================= DASHBOARD =======================
  if (currentUser) {
    return <Dashboard currentUser={currentUser} onLogout={handleLogout} />;
  }

  // ======================= LOGIN SUPERADMIN VIEW =======================
  if (vista === "superadmin") {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center px-4 py-8">
        <div
          className="absolute inset-0 overflow-hidden pointer-events-none"
          aria-hidden="true"
        >
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] rounded-b-full bg-brand-900/40 blur-3xl" />
        </div>

        <div className="relative w-full max-w-sm">
          <div className="bg-slate-800 border border-slate-700 rounded-2xl shadow-2xl overflow-hidden">
            {/* Header */}
            <div className="bg-slate-900 px-6 py-5 text-white text-center">
              <div className="inline-flex items-center justify-center w-12 h-12 bg-brand-600/20 border border-brand-500/30 rounded-full mb-3">
                <Lock className="w-5 h-5 text-brand-400" />
              </div>
              <h1 className="text-lg font-bold tracking-tight text-white">
                Acceso Administrativo
              </h1>
              <p className="text-slate-400 text-xs mt-1">
                Panel de Superadmin — Sistema Electoral SL 2026
              </p>
            </div>

            {/* Form */}
            <div className="px-6 py-6 space-y-4">
              {/* CI */}
              <div>
                <label
                  htmlFor="adminCI"
                  className="block text-xs font-semibold text-slate-300 mb-1.5"
                >
                  CI del Administrador
                </label>
                <input
                  id="adminCI"
                  type="text"
                  value={adminCI}
                  onChange={(e) => setAdminCI(e.target.value.replace(/\D/g, ""))}
                  onKeyDown={handleKeyDownAdmin}
                  className="w-full px-4 py-2.5 text-sm border border-slate-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent bg-slate-700 text-white placeholder-slate-500"
                  placeholder="Solo números"
                  autoComplete="username"
                />
              </div>

              {/* Contraseña */}
              <div>
                <label
                  htmlFor="adminPass"
                  className="block text-xs font-semibold text-slate-300 mb-1.5"
                >
                  Contraseña
                </label>
                <div className="relative">
                  <input
                    id="adminPass"
                    type={showAdminPass ? "text" : "password"}
                    value={adminPass}
                    onChange={(e) => setAdminPass(e.target.value)}
                    onKeyDown={handleKeyDownAdmin}
                    className="w-full px-4 py-2.5 pr-11 text-sm border border-slate-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent bg-slate-700 text-white placeholder-slate-500"
                    placeholder="Contraseña de administrador"
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowAdminPass((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 p-0 border-0 bg-transparent shadow-none"
                    aria-label={showAdminPass ? "Ocultar contraseña" : "Mostrar contraseña"}
                  >
                    {showAdminPass ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>

              {/* Submit */}
              <button
                onClick={handleLoginSuperadmin}
                disabled={isLoggingAdmin}
                className="w-full h-11 bg-brand-600 hover:bg-brand-700 disabled:bg-brand-800 text-white rounded-xl font-semibold text-sm transition-colors flex items-center justify-center gap-2 shadow-sm mt-2"
              >
                {isLoggingAdmin ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Verificando...
                  </>
                ) : (
                  "Ingresar al Panel"
                )}
              </button>
            </div>

            {/* Volver */}
            <div className="px-6 pb-5">
              <button
                onClick={() => { setVista("estructura"); setAdminCI(""); setAdminPass(""); }}
                className="w-full flex items-center justify-center gap-1.5 text-xs text-slate-400 hover:text-slate-200 transition-colors bg-transparent border-0 shadow-none py-2"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                Volver al acceso de estructura
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ======================= LOGIN ESTRUCTURA VIEW =======================
  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center px-4 py-8">
      {/* Background decoration */}
      <div
        className="absolute inset-0 overflow-hidden pointer-events-none"
        aria-hidden="true"
      >
        <div className="absolute -top-40 -right-40 w-96 h-96 rounded-full bg-brand-100 opacity-50" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 rounded-full bg-brand-50 opacity-60" />
      </div>

      <div className="relative w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-card-md overflow-hidden">
          {/* Header */}
          <div className="bg-brand-700 px-8 py-6 text-white text-center">
            <div className="inline-flex items-center justify-center w-14 h-14 bg-white/10 rounded-full mb-3">
              <ShieldCheck className="w-7 h-7 text-white" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight">
              Sistema Electoral
            </h1>
            <p className="text-brand-200 text-sm mt-1">
              Gestión de Votantes — SL 2026
            </p>
          </div>

          {/* Form */}
          <div className="px-8 py-7 space-y-5">
            <div>
              <label
                htmlFor="loginCode"
                className="block text-sm font-medium text-slate-700 mb-1.5"
              >
                Código de Acceso
              </label>
              <div className="relative">
                <KeyRound className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                <input
                  id="loginCode"
                  type="text"
                  value={loginCode}
                  onChange={(e) => setLoginCode(e.target.value)}
                  onKeyDown={handleKeyDownCode}
                  className="w-full pl-10 pr-4 py-2.5 text-sm border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent bg-slate-50 placeholder-slate-400"
                  placeholder="Ingrese su código de acceso"
                  autoComplete="one-time-code"
                  autoFocus
                />
              </div>
              <p className="text-xs text-slate-400 mt-1.5">
                Para dirigentes, coordinadores y subcoordinadores.
              </p>
            </div>

            {/* Submit */}
            <button
              onClick={handleLoginEstructura}
              disabled={isLoggingCode}
              className="w-full h-11 bg-brand-600 hover:bg-brand-700 disabled:bg-brand-400 text-white rounded-xl font-semibold text-sm transition-colors flex items-center justify-center gap-2 shadow-sm"
            >
              {isLoggingCode ? (
                <>
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Verificando...
                </>
              ) : (
                "Ingresar"
              )}
            </button>
          </div>

          {/* Footer / Superadmin link */}
          <div className="px-8 pb-7 space-y-4">
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-xs text-slate-600 space-y-1">
              <p className="font-semibold text-slate-700 mb-2">Instrucciones</p>
              <ol className="list-decimal ml-4 space-y-1 leading-relaxed">
                <li>Ingrese el código de acceso proporcionado por su superior.</li>
                <li>El acceso es personal e intransferible.</li>
                <li>Ante dudas, comuníquese con el administrador.</li>
              </ol>
            </div>

            {/* Separador */}
            <div className="relative flex items-center">
              <div className="flex-1 border-t border-slate-200" />
              <span className="px-3 text-xs text-slate-400">Administradores</span>
              <div className="flex-1 border-t border-slate-200" />
            </div>

            <button
              onClick={() => setVista("superadmin")}
              className="w-full flex items-center justify-center gap-2 h-10 border border-slate-300 bg-white hover:bg-slate-50 text-slate-600 hover:text-slate-800 rounded-xl text-sm font-medium transition-colors shadow-sm"
            >
              <Lock className="w-3.5 h-3.5" />
              Acceso Superadmin
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default App;
