// src/reports/ReportSuperadmin.jsx
export default function ReportSuperadmin({ estructura }) {
  const { coordinadores = [], subcoordinadores = [], votantes = [] } = estructura;

  const totalCoordinadores = coordinadores.length;
  const totalSubs = subcoordinadores.length;
  const totalVotantes = votantes.length;

  // Mapa subcoordinadores por coordinador
  const subsPorCoord = new Map();
  for (const s of subcoordinadores) {
    const k = String(s.coordinador_ci || "");
    if (!subsPorCoord.has(k)) subsPorCoord.set(k, []);
    subsPorCoord.get(k).push(s);
  }

  // Mapa votantes por asignado_por (sub o coord)
  const votosPorAsignador = new Map();
  for (const v of votantes) {
    const k = String(v.asignado_por || "");
    if (!votosPorAsignador.has(k)) votosPorAsignador.set(k, []);
    votosPorAsignador.get(k).push(v);
  }

  // Detectar si un votante es indirecto (asignado por un sub del mismo coord)
  const getVotantesDirectosDelCoord = (coordCI) => {
    const subs = subsPorCoord.get(String(coordCI)) || [];
    const setSubs = new Set(subs.map((x) => String(x.ci)));
    return votantes.filter(
      (v) =>
        String(v.coordinador_ci) === String(coordCI) &&
        !setSubs.has(String(v.asignado_por))
    );
  };

  let html = `
    <section class="summary-section">
      <h2>Resumen Ejecutivo</h2>
      <div class="summary-grid">
        <div class="summary-item">
          <span class="label">Total Coordinadores</span>
          <span class="value">${totalCoordinadores}</span>
        </div>
        <div class="summary-item">
          <span class="label">Total Subcoordinadores</span>
          <span class="value">${totalSubs}</span>
        </div>
        <div class="summary-item">
          <span class="label">Total Votantes</span>
          <span class="value">${totalVotantes}</span>
        </div>
      </div>
    </section>

    <h2>Estructura Jerárquica</h2>
  `;

  coordinadores.forEach((coord, idx) => {
    const coordCI = String(coord.ci);
    const subs = subsPorCoord.get(coordCI) || [];

    const votosDirectos = getVotantesDirectosDelCoord(coordCI);
    let votosIndirectosCount = 0;

    for (const s of subs) {
      const vs = votosPorAsignador.get(String(s.ci)) || [];
      votosIndirectosCount += vs.length;
    }

    const totalEnRed = votosDirectos.length + votosIndirectosCount;

    html += `
      <h3>Coordinador: ${coord.nombre} ${coord.apellido} <span class="pill">${totalEnRed}</span></h3>
      <div class="info-block">
        <b>CI:</b> ${coord.ci}
        ${coord.telefono ? ` • <b>Teléfono:</b> ${coord.telefono}` : ""}
      </div>

      <h4>Subcoordinadores</h4>
    `;

    if (subs.length === 0) {
      html += `<p class="muted">No registra subcoordinadores.</p>`;
    } else {
      html += `
        <table>
          <thead>
            <tr>
              <th>Subcoordinador</th>
              <th style="width:20%">CI</th>
              <th style="width:20%">Teléfono</th>
              <th style="width:15%">Votantes</th>
            </tr>
          </thead>
          <tbody>
      `;

      subs.forEach((sub) => {
        const vs = votosPorAsignador.get(String(sub.ci)) || [];
        html += `
          <tr>
            <td>${sub.nombre} ${sub.apellido}</td>
            <td>${sub.ci}</td>
            <td>${sub.telefono || "—"}</td>
            <td>${vs.length}</td>
          </tr>
        `;
      });

      html += `</tbody></table>`;
    }

    // Votantes directos del coordinador
    html += `
      <h4 style="margin-top: 12px;">Votantes Directos <span class="pill">${votosDirectos.length}</span></h4>
    `;
    
    if (votosDirectos.length === 0) {
      html += `<p class="muted">No registra votantes directos.</p>`;
    } else {
      html += `
        <table>
          <thead>
            <tr>
              <th>Votante</th>
              <th style="width:20%">CI</th>
              <th style="width:25%">Teléfono</th>
            </tr>
          </thead>
          <tbody>
      `;
      votosDirectos.forEach((v) => {
        html += `
          <tr>
            <td>${v.nombre} ${v.apellido}</td>
            <td>${v.ci}</td>
            <td>${v.telefono || "—"}</td>
          </tr>
        `;
      });
      html += `</tbody></table>`;
    }

    html += `<hr />`;
  });

  return html;
}
