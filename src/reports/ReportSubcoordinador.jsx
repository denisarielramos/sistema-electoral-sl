// src/reports/ReportSubcoordinador.jsx
export default function ReportSubcoordinador({ estructura, currentUser }) {
  const { votantes = [] } = estructura;

  const misVotantes = votantes.filter(
    (v) => String(v.asignado_por) === String(currentUser.ci)
  );

  const conTelefono = misVotantes.filter((v) => !!v.telefono).length;
  const sinTelefono = misVotantes.length - conTelefono;

  let html = `
    <section class="summary-section">
      <h2>Resumen de Mis Votantes</h2>
      <div class="summary-grid">
        <div class="summary-item">
          <span class="label">Total Votantes</span>
          <span class="value">${misVotantes.length}</span>
        </div>
        <div class="summary-item">
          <span class="label">Con Teléfono</span>
          <span class="value">${conTelefono}</span>
        </div>
        <div class="summary-item">
          <span class="label">Sin Teléfono</span>
          <span class="value">${sinTelefono}</span>
        </div>
      </div>
    </section>

    <h2>Listado de Votantes</h2>
  `;

  if (misVotantes.length === 0) {
    html += `<p class="muted">No tiene votantes asignados.</p>`;
    return html;
  }

  html += `
    <table>
      <thead>
        <tr>
          <th>Votante</th>
          <th style="width:18%">CI</th>
          <th style="width:20%">Teléfono</th>
        </tr>
      </thead>
      <tbody>
  `;

  misVotantes.forEach((v) => {
    html += `
      <tr>
        <td>${v.nombre} ${v.apellido}</td>
        <td>${v.ci}</td>
        <td>${v.telefono || "—"}</td>
      </tr>
    `;
  });

  html += `</tbody></table>`;
  return html;
}
