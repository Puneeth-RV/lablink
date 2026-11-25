import { TableScroll } from '../components/TableScroll';
import { Loading, Status } from '../components/ui';
import type { UtilisationReport } from '../lib/api';
import { percent, titleCase } from '../lib/format';
import { useResource } from '../lib/hooks';

export default function InsightsPage() {
  const report = useResource<UtilisationReport>('/analytics/utilisation');
  if (report.loading) return <Loading />;
  if (report.error || !report.data) return <Status kind="error">{report.error ?? 'No data'}</Status>;
  const { departments, equipment, peakHours, suggestions } = report.data;
  const sorted = [...equipment].filter((e) => e.capacityHours > 0).sort((a, b) => b.rate - a.rate);
  const maxPeak = Math.max(1, ...peakHours.map((p) => p.bookedHours));

  return (
    <>
      <h1 tabIndex={-1}>Utilisation insights</h1>
      <p className="muted">Last 7 days, lab hours 09:00–18:00.</p>

      <section aria-labelledby="sugg-heading" className="card">
        <h2 id="sugg-heading">Recommendations</h2>
        {suggestions.length ? (
          <ul>
            {suggestions.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        ) : (
          <p>Utilisation is balanced.</p>
        )}
      </section>

      <div className="two-col">
        <section aria-labelledby="dept-heading" className="card">
          <h2 id="dept-heading">By department</h2>
          <TableScroll label="Utilisation by department">
            <table>
              <caption className="visually-hidden">Utilisation by department</caption>
              <thead>
                <tr>
                  <th scope="col">Department</th>
                  <th scope="col">Utilisation</th>
                </tr>
              </thead>
              <tbody>
                {departments.map((d) => (
                  <tr key={d.departmentId}>
                    <th scope="row">{d.name}</th>
                    <td>
                      <meter min={0} max={1} value={d.rate} aria-label={`${d.name} utilisation`} />{' '}
                      {percent(d.rate)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScroll>
        </section>

        <section aria-labelledby="peak-heading" className="card">
          <h2 id="peak-heading">Peak hours</h2>
          <TableScroll label="Bookings by hour">
            <table>
              <caption className="visually-hidden">Bookings by hour of day</caption>
              <thead>
                <tr>
                  <th scope="col">Hour</th>
                  <th scope="col">Bookings</th>
                </tr>
              </thead>
              <tbody>
                {peakHours.map((p) => (
                  <tr key={p.hour}>
                    <th scope="row">{String(p.hour).padStart(2, '0')}:00</th>
                    <td>
                      <meter
                        min={0}
                        max={maxPeak}
                        value={p.bookedHours}
                        aria-label={`${p.hour}:00 bookings`}
                      />{' '}
                      {p.bookedHours}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScroll>
        </section>
      </div>

      <section aria-labelledby="eq-heading" className="card">
        <h2 id="eq-heading">By equipment</h2>
        <TableScroll label="Utilisation by equipment">
          <table>
            <caption className="visually-hidden">Utilisation by equipment, most used first</caption>
            <thead>
              <tr>
                <th scope="col">Equipment</th>
                <th scope="col">Category</th>
                <th scope="col">Booked hours</th>
                <th scope="col">Utilisation</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((e) => (
                <tr key={e.equipmentId}>
                  <th scope="row">{e.name}</th>
                  <td>{titleCase(e.category)}</td>
                  <td>
                    {e.bookedHours} / {e.capacityHours}
                  </td>
                  <td>
                    <meter
                      min={0}
                      max={1}
                      low={0.25}
                      high={0.75}
                      optimum={0.5}
                      value={e.rate}
                      aria-label={`${e.name} utilisation`}
                    />{' '}
                    {percent(e.rate)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableScroll>
      </section>
    </>
  );
}
