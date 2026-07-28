// ======================= TARJETAS ESTADÍSTICAS: MAPEO TERRITORIAL =======================
import React from "react";
import { Home, MapPin, Clock, CheckCircle2, XCircle, AlertTriangle } from "lucide-react";

const Card = ({ label, value, icon: Icon, accent }) => (
  <div
    className={`rounded-xl p-4 flex flex-col gap-2 ${
      accent ? "bg-brand-700 text-white shadow-card-md" : "bg-white border border-slate-200 shadow-card"
    }`}
  >
    <div className="flex items-center justify-between">
      <p className={`text-xs font-semibold uppercase tracking-wide ${accent ? "text-brand-200" : "text-slate-500"}`}>{label}</p>
      {Icon && (
        <div className={`p-1.5 rounded-lg ${accent ? "bg-white/10" : "bg-brand-50"}`}>
          <Icon className={`w-4 h-4 ${accent ? "text-white" : "text-brand-600"}`} />
        </div>
      )}
    </div>
    <p className={`text-3xl font-bold leading-none ${accent ? "text-white" : "text-slate-800"}`}>{value ?? 0}</p>
  </div>
);

const MapeoStatsCards = ({ estadisticas }) => (
  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
    <Card label="Total hogares" value={estadisticas.total} icon={Home} accent />
    <Card label="Mapeados" value={estadisticas.mapeados} icon={MapPin} />
    <Card label="Pend. verificar" value={estadisticas.pendientesVerificar} icon={Clock} />
    <Card label="Visitados" value={estadisticas.visitados} icon={CheckCircle2} />
    <Card label="No visitados" value={estadisticas.noVisitados} icon={XCircle} />
    <Card label="Fuera de radio" value={estadisticas.fueraDeRadio} icon={AlertTriangle} />
  </div>
);

export default MapeoStatsCards;
