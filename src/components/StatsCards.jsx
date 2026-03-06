export default function StatsCards({ role, stats }) {
  return (
    <div className="max-w-7xl mx-auto px-4 py-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {role === "superadmin" && (
        <>
          <Card title="Coordinadores" value={stats.coordinadores} />
          <Card title="Subcoordinadores" value={stats.subcoordinadores} />
          <Card title="Votantes" value={stats.votantes} />
          <CardProgress
            title="Votos Confirmados"
            confirmed={stats.votosConfirmados}
            total={stats.votantes}
            percentage={stats.porcentajeConfirmados}
          />
        </>
      )}

      {role === "coordinador" && (
        <>
          <Card title="Subcoordinadores" value={stats.subcoordinadores} />
          <Card title="Votantes directos" value={stats.votantesDirectos} />
          <Card title="Total en red" value={stats.total} />
          <CardProgress
            title="Votos Confirmados"
            confirmed={stats.votosConfirmados}
            total={stats.total}
            percentage={stats.porcentajeConfirmados}
          />
        </>
      )}

      {role === "subcoordinador" && (
        <>
          <Card title="Mis votantes" value={stats.votantes} />
          <CardProgress
            title="Votos Confirmados"
            confirmed={stats.votosConfirmados}
            total={stats.votantes}
            percentage={stats.porcentajeConfirmados}
          />
        </>
      )}
    </div>
  );
}

function Card({ title, value }) {
  return (
    <div className="bg-white rounded-lg shadow p-3 sm:p-4">
      <p className="text-gray-600 text-xs sm:text-sm">{title}</p>
      <p className="text-2xl sm:text-3xl font-bold text-red-600">{value}</p>
    </div>
  );
}

function CardProgress({ title, confirmed, total, percentage }) {
  return (
    <div className="bg-white rounded-lg shadow p-3 sm:p-4">
      <p className="text-gray-600 text-xs sm:text-sm">{title}</p>
      <p className="text-2xl sm:text-3xl font-bold text-green-600 mb-2">
        {confirmed}/{total}
      </p>
      <div className="w-full bg-gray-200 rounded-full h-2">
        <div
          className="bg-green-600 h-2 rounded-full transition-all"
          style={{ width: `${percentage}%` }}
        ></div>
      </div>
      <p className="text-xs sm:text-sm text-gray-600 mt-2">{percentage}% confirmado</p>
    </div>
  );
}
