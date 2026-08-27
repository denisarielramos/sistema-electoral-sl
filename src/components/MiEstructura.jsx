// ======================= MI ESTRUCTURA =======================
// Renderiza la estructura jerárquica completa
// UI original intacta
// Lógica y estado vienen por props

import React from "react";
import {
  ChevronDown,
  ChevronRight,
  Phone,
  Trash2,
  Copy,
} from "lucide-react";

const MiEstructura = ({
  currentUser,
  estructura,
  expandedCoords,
  toggleExpand,
  normalizeCI,

  abrirTelefono,
  quitarPersona,

  getMisSubcoordinadores,
  getMisVotantes,
  getVotantesDeSubcoord,
  getVotantesDirectosCoord,
}) => {
  // ======================= DATOS PERSONA =======================
  const DatosPersona = ({ persona, rol, loginCode }) => (
    <div className="space-y-1 text-xs md:text-sm">
      <p className="font-semibold break-words">
        {persona.nombre} {persona.apellido}
      </p>
      <p>
        <b>CI:</b> {persona.ci}
      </p>
      {rol && (
        <p>
          <b>Rol:</b> {rol}
        </p>
      )}
      {loginCode && (
        <button
          onClick={() => navigator.clipboard.writeText(loginCode)}
          className="p-1 border rounded text-red-600 inline-flex items-center gap-1"
        >
          <Copy className="w-4 h-4" /> Copiar acceso
        </button>
      )}
      {persona.local_votacion && <p>Local: {persona.local_votacion}</p>}
      {persona.mesa && <p>Mesa: {persona.mesa}</p>}
      {persona.orden && <p>Orden: {persona.orden}</p>}
      {persona.direccion && <p>Dirección: {persona.direccion}</p>}
      {persona.telefono && <p>Tel: {persona.telefono}</p>}
    </div>
  );

  // ======================= RENDER =======================
  return (
    <div className="bg-white rounded-lg shadow">
      <div className="p-6 border-b">
        <h2 className="text-xl font-bold text-gray-800">Mi Estructura</h2>
      </div>

      <div className="p-6">
        {/* ======================= SUPERADMIN ======================= */}
        {currentUser.role === "superadmin" &&
          estructura.coordinadores.map((coord) => (
            <div
              key={coord.ci}
              className="border rounded-lg mb-3 bg-red-50/40"
            >
              <div
                className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between p-4 cursor-pointer"
                onClick={() => toggleExpand(coord.ci)}
              >
                <div className="flex items-start gap-3 flex-1 min-w-0">
                  {expandedCoords[normalizeCI(coord.ci)] ? (
                    <ChevronDown className="w-5 h-5 text-red-600 shrink-0" />
                  ) : (
                    <ChevronRight className="w-5 h-5 text-red-600 shrink-0" />
                  )}
                  <DatosPersona
                    persona={coord}
                    rol="Coordinador"
                    loginCode={coord.login_code}
                  />
                </div>

                <div className="flex gap-2 sm:justify-start">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      abrirTelefono("coordinador", coord);
                    }}
                    className="w-10 h-10 border-2 border-green-600 text-green-700 rounded-lg"
                  >
                    <Phone className="w-5 h-5 mx-auto" />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      quitarPersona(coord.ci, "coordinador");
                    }}
                    className="w-10 h-10 bg-red-600 text-white rounded-lg"
                  >
                    <Trash2 className="w-5 h-5 mx-auto" />
                  </button>
                </div>
              </div>

              {expandedCoords[normalizeCI(coord.ci)] && (
                <div className="bg-white px-4 pb-4">
                  {estructura.subcoordinadores
                    .filter(
                      (s) =>
                        normalizeCI(s.coordinador_ci) ===
                        normalizeCI(coord.ci)
                    )
                    .map((sub) => (
                      <div
                        key={sub.ci}
                        className="border rounded p-3 mb-2 bg-red-50/40"
                      >
                        <DatosPersona
                          persona={sub}
                          rol="Subcoordinador"
                          loginCode={sub.login_code}
                        />

                        {getVotantesDeSubcoord(sub.ci).map((v) => (
                          <div
                            key={v.ci}
                            className="bg-white border p-2 mt-2 rounded flex flex-col gap-2 sm:flex-row sm:justify-between"
                          >
                            <DatosPersona persona={v} rol="Votante" />
                            <div className="flex gap-2">
                              <button
                                onClick={() =>
                                  abrirTelefono("votante", v)
                                }
                                className="w-10 h-10 border-2 border-green-600 text-green-700 rounded-lg"
                              >
                                <Phone className="w-5 h-5 mx-auto" />
                              </button>
                              <button
                                onClick={() =>
                                  quitarPersona(v.ci, "votante")
                                }
                                className="w-10 h-10 bg-red-600 text-white rounded-lg"
                              >
                                <Trash2 className="w-5 h-5 mx-auto" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    ))}

                  {getVotantesDirectosCoord(coord.ci).map((v) => (
                    <div
                      key={v.ci}
                      className="bg-white border p-2 mt-2 rounded flex flex-col gap-2 sm:flex-row sm:justify-between"
                    >
                      <DatosPersona persona={v} rol="Votante" />
                      <div className="flex gap-2">
                        <button
                          onClick={() => abrirTelefono("votante", v)}
                          className="w-10 h-10 border-2 border-green-600 text-green-700 rounded-lg"
                        >
                          <Phone className="w-5 h-5 mx-auto" />
                        </button>
                        <button
                          onClick={() => quitarPersona(v.ci, "votante")}
                          className="w-10 h-10 bg-red-600 text-white rounded-lg"
                        >
                          <Trash2 className="w-5 h-5 mx-auto" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}

        {/* ======================= COORDINADOR ======================= */}
        {currentUser.role === "coordinador" &&
          getMisSubcoordinadores().map((sub) => (
            <div
              key={sub.ci}
              className="border rounded-lg mb-3 bg-red-50/40"
            >
              <div
                className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between p-4 cursor-pointer"
                onClick={() => toggleExpand(sub.ci)}
              >
                <div className="flex items-start gap-3 flex-1 min-w-0">
                  {expandedCoords[normalizeCI(sub.ci)] ? (
                    <ChevronDown className="w-5 h-5 text-red-600 shrink-0" />
                  ) : (
                    <ChevronRight className="w-5 h-5 text-red-600 shrink-0" />
                  )}
                  <DatosPersona
                    persona={sub}
                    rol="Subcoordinador"
                    loginCode={sub.login_code}
                  />
                </div>
              </div>

              {expandedCoords[normalizeCI(sub.ci)] && (
                <div className="bg-white px-4 pb-4">
                  {getVotantesDeSubcoord(sub.ci).map((v) => (
                    <div
                      key={v.ci}
                      className="bg-white border p-2 mt-2 rounded flex flex-col gap-2 sm:flex-row sm:justify-between"
                    >
                      <DatosPersona persona={v} rol="Votante" />
                      <div className="flex gap-2">
                        <button
                          onClick={() => abrirTelefono("votante", v)}
                          className="w-10 h-10 border-2 border-green-600 text-green-700 rounded-lg"
                        >
                          <Phone className="w-5 h-5 mx-auto" />
                        </button>
                        <button
                          onClick={() => quitarPersona(v.ci, "votante")}
                          className="w-10 h-10 bg-red-600 text-white rounded-lg"
                        >
                          <Trash2 className="w-5 h-5 mx-auto" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}

        {/* ======================= SUBCOORDINADOR ======================= */}
        {currentUser.role === "subcoordinador" &&
          getMisVotantes().map((v) => (
            <div
              key={v.ci}
              className="bg-white border p-3 mt-2 rounded flex flex-col gap-2 sm:flex-row sm:justify-between"
            >
              <DatosPersona persona={v} rol="Votante" />
              <div className="flex gap-2">
                <button
                  onClick={() => abrirTelefono("votante", v)}
                  className="w-10 h-10 border-2 border-green-600 text-green-700 rounded-lg"
                >
                  <Phone className="w-5 h-5 mx-auto" />
                </button>
                <button
                  onClick={() => quitarPersona(v.ci, "votante")}
                  className="w-10 h-10 bg-red-600 text-white rounded-lg"
                >
                  <Trash2 className="w-5 h-5 mx-auto" />
                </button>
              </div>
            </div>
          ))}
      </div>
    </div>
  );
};

export default MiEstructura;
