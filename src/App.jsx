// ======================= APP SISTEMA ELECTORAL =======================
// App maneja SOLO sesión/login.
// Dashboard maneja TODO lo demás.

import React, { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";
import { ShieldCheck, Eye, EyeOff } from "lucide-react";
import Dashboard from "./components/Dashboard";
import { normalizeCI } from "./utils/estructuraHelpers";

// ======================= SUPERADMINS LOCALES =======================
const SUPERADMINS = [
  {
    ci: "dramos",
    pass: "16052018",
    nombre: "Denis",
    apellido: "Ramos",
  },
  {
    ci: "3641845",
    pass: "j.gomez",
    nombre: "José",
    apellido: "Gomez",
  },
];

const App = () => {
  // ======================= SESIÓN =======================
  const [currentUser, setCurrentUser] = useState(null);
  const [loginID, setLoginID] = useState("");
  const [loginPass, setLoginPass] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [isLogging, setIsLogging] = useState(false);

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

  const isSuperadminLogin = SUPERADMINS.some((s) => s.ci === loginID.trim());

  // ======================= LOGIN =======================
  const handleLogin = async () => {
    const code = loginID.trim();
    if (!code) return alert("Ingrese CI o código.");

    setIsLogging(true);

    try {
      // ======================= SUPERADMIN LOCAL =======================
      const superadmin = SUPERADMINS.find((s) => s.ci === code);

      if (superadmin) {
        if (loginPass !== superadmin.pass) {
          alert("Contraseña incorrecta.");
          return;
        }
        const u = {
          ci: superadmin.ci,
          nombre: superadmin.nombre,
          apellido: superadmin.apellido,
          role: "superadmin",
        };
        setCurrentUser(u);
        localStorage.setItem("currentUser", JSON.stringify(u));
        return;
      }

      // ======================= COORDINADOR =======================
      const { data: coord, error: coordErr } = await supabase
        .from("coordinadores")
        .select("ci,login_code,telefono,padron(*)")
        .eq("login_code", code)
        .maybeSingle();

      if (coordErr) console.error("Error login coord:", coordErr);

      if (coord?.padron) {
        const u = {
          ci: normalizeCI(coord.ci),
          nombre: coord.padron.nombre,
          apellido: coord.padron.apellido,
          telefono: coord.telefono || "",
          role: "coordinador",
        };
        setCurrentUser(u);
        localStorage.setItem("currentUser", JSON.stringify(u));
        return;
      }

      // ======================= SUBCOORDINADOR =======================
      const { data: sub, error: subErr } = await supabase
        .from("subcoordinadores")
        .select("ci,login_code,telefono,coordinador_ci,padron(*)")
        .eq("login_code", code)
        .maybeSingle();

      if (subErr) console.error("Error login sub:", subErr);

      if (sub?.padron) {
        const u = {
          ci: normalizeCI(sub.ci),
          nombre: sub.padron.nombre,
          apellido: sub.padron.apellido,
          telefono: sub.telefono || "",
          role: "subcoordinador",
        };
        setCurrentUser(u);
        localStorage.setItem("currentUser", JSON.stringify(u));
        return;
      }

      alert("Usuario no encontrado.");
    } finally {
      setIsLogging(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter") handleLogin();
  };

  const handleLogout = () => {
    setCurrentUser(null);
    localStorage.removeItem("currentUser");
    setLoginID("");
    setLoginPass("");
  };

  // ======================= DASHBOARD =======================
  if (currentUser) {
    return <Dashboard currentUser={currentUser} onLogout={handleLogout} />;
  }

  // ======================= LOGIN VIEW =======================
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
        {/* Card */}
        <div className="bg-white rounded-2xl shadow-card-md overflow-hidden">
          {/* Header band */}
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
            {/* CI / Código */}
            <div>
              <label
                htmlFor="loginID"
                className="block text-sm font-medium text-slate-700 mb-1.5"
              >
                CI o Código de Acceso
              </label>
              <input
                id="loginID"
                type="text"
                value={loginID}
                onChange={(e) => setLoginID(e.target.value)}
                onKeyDown={handleKeyDown}
                className="w-full px-4 py-2.5 text-sm border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent bg-slate-50 placeholder-slate-400"
                placeholder="Ej: A1B2C3D4"
                autoComplete="username"
              />
            </div>

            {/* Contraseña — solo superadmin */}
            {isSuperadminLogin && (
              <div className="animate-fade-in">
                <label
                  htmlFor="loginPass"
                  className="block text-sm font-medium text-slate-700 mb-1.5"
                >
                  Contraseña Superadmin
                </label>
                <div className="relative">
                  <input
                    id="loginPass"
                    type={showPass ? "text" : "password"}
                    value={loginPass}
                    onChange={(e) => setLoginPass(e.target.value)}
                    onKeyDown={handleKeyDown}
                    className="w-full px-4 py-2.5 pr-11 text-sm border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent bg-slate-50 placeholder-slate-400"
                    placeholder="Ingrese contraseña"
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPass((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0 border-0 bg-transparent shadow-none"
                    aria-label={showPass ? "Ocultar contraseña" : "Mostrar contraseña"}
                  >
                    {showPass ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>
            )}

            {/* Submit */}
            <button
              onClick={handleLogin}
              disabled={isLogging}
              className="w-full h-11 bg-brand-600 hover:bg-brand-700 disabled:bg-brand-400 text-white rounded-xl font-semibold text-sm transition-colors flex items-center justify-center gap-2 shadow-sm"
            >
              {isLogging ? (
                <>
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Ingresando...
                </>
              ) : (
                "Iniciar Sesión"
              )}
            </button>
          </div>

          {/* Footer note */}
          <div className="px-8 pb-7">
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-xs text-slate-600 space-y-1">
              <p className="font-semibold text-slate-700 mb-2">Instrucciones</p>
              <ol className="list-decimal ml-4 space-y-1 leading-relaxed">
                <li>Ingrese su CI o código de acceso proporcionado.</li>
                <li>Los superadmins deben ingresar su contraseña.</li>
                <li>Ante dudas, comuníquese con el administrador.</li>
              </ol>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default App;
