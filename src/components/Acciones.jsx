// ======================= COMPONENTE ACCIONES =======================
// Botones principales del dashboard:
// - Agregar Coordinador / Subcoordinador / Votante
// - Menú de descarga de PDFs
// No contiene lógica de datos (solo UI + callbacks)

import React from "react";
import { UserPlus, BarChart3 } from "lucide-react";

const Acciones = ({
  currentUser,
  onAddCoordinador,
  onAddSubcoordinador,
  onAddVotante,
  onGenerarPDF,
}) => {
  if (!currentUser) return null;

  return (
    <div className="max-w-7xl mx-auto px-4 mb-4 flex flex-wrap gap-3 items-center">
      {/* ======================= SUPERADMIN ======================= */}
      {currentUser.role === "superadmin" && (
        <button
          onClick={onAddCoordinador}
          className="flex items-center gap-2 bg-red-600 text-white px-4 h-10 rounded-lg hover:bg-red-700"
        >
          <UserPlus className="w-4 h-4" />
          Agregar Coordinador
        </button>
      )}

      {/* ======================= COORDINADOR ======================= */}
      {currentUser.role === "coordinador" && (
        <button
          onClick={onAddSubcoordinador}
          className="flex items-center gap-2 bg-red-600 text-white px-4 h-10 rounded-lg hover:bg-red-700"
        >
          <UserPlus className="w-4 h-4" />
          Agregar Subcoordinador
        </button>
      )}

      {/* ======================= COORD / SUB ======================= */}
      {(currentUser.role === "coordinador" ||
        currentUser.role === "subcoordinador") && (
        <button
          onClick={onAddVotante}
          className="flex items-center gap-2 border-2 border-red-600 text-red-600 px-4 h-10 rounded-lg hover:bg-red-50"
        >
          <UserPlus className="w-4 h-4" />
          Agregar Votante
        </button>
      )}

      {/* ======================= MENÚ PDF ======================= */}
      <div className="relative inline-block">
        <button
          className="flex items-center gap-2 border-2 border-red-600 text-red-600 px-4 h-10 rounded-lg hover:bg-red-50"
          onClick={(e) => {
            const menu = e.currentTarget.nextSibling;
            if (menu) menu.classList.toggle("hidden");
          }}
        >
          <BarChart3 className="w-4 h-4" />
          Descargar PDF
        </button>

        <div className="absolute mt-1 bg-white border rounded-lg shadow-lg hidden z-20 min-w-[220px]">
          {currentUser.role === "superadmin" && (
            <>
              <button
                className="block w-full text-left px-4 py-2 text-sm hover:bg-red-50"
                onClick={() => onGenerarPDF("ranking")}
              >
                Ranking Global
              </button>
              <button
                className="block w-full text-left px-4 py-2 text-sm hover:bg-red-50"
                onClick={() => onGenerarPDF("estructura")}
              >
                Estructura Completa
              </button>
            </>
          )}

          {currentUser.role !== "superadmin" && (
            <button
              className="block w-full text-left px-4 py-2 text-sm hover:bg-red-50"
              onClick={() => onGenerarPDF("estructura")}
            >
              Mi Estructura
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default Acciones;
