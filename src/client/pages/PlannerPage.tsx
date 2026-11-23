import { useState, type FormEvent } from 'react';
import { Badge, SourceBadge, Status } from '../components/ui';
import { api, type BookingResult, type PlanResponse, type Profile } from '../lib/api';
import { formatDate, titleCase } from '../lib/format';

type BookOutcome = { category: string; ok: boolean; message: string };

/** Student describes the project; Gemini infers equipment needs; the scheduler proposes feasible slots. */
export default function PlannerPage({ profile, onBooked }: { profile: Profile; onBooked: () => void }) {
  const [projectId, setProjectId] = useState(profile.projects[0]?.id ?? '');
  const [notes, setNotes] = useState('');
  const [plan, setPlan] = useState<PlanResponse>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [outcomes, setOutcomes] = useState<BookOutcome[]>([]);

  async function generate(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(undefined);
    setOutcomes([]);
    try {
      setPlan(await api<PlanResponse>('/plan', { method: 'POST', body: { projectId, ...(notes.trim() ? { notes } : {}) } }));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function bookAll() {
    if (!plan) return;
    setBusy(true);
    const results: BookOutcome[] = [];
    for (const item of plan.items.filter((i) => i.equipmentId && i.start && i.end)) {
      try {
        const res = await api<BookingResult>('/bookings', {
          method: 'POST',
          body: { equipmentId: item.equipmentId, projectId: plan.project.id, start: item.start, end: item.end },
        });
        results.push({ category: item.category, ok: true, message: res.kind === 'booked' ? `Booked ${item.equipmentName}, ${item.label}` : `Joined the fair queue for ${item.equipmentName}, ${item.label}` });
      } catch (err) {
        results.push({ category: item.category, ok: false, message: `${item.equipmentName}: ${(err as Error).message}` });
      }
    }
    setOutcomes(results);
    setBusy(false);
    onBooked();
  }

  const schedulable = plan?.items.filter((i) => i.start).length ?? 0;

  return (
    <>
      <h1 tabIndex={-1}>Plan my project</h1>
      <p className="muted">
        LabLink works out which equipment your project needs and finds the earliest slots that fit your deadline, training, approvals and
        weekly hours.
      </p>

      {profile.projects.length === 0 ? (
        <p>You have no registered projects.</p>
      ) : (
        <form onSubmit={generate} className="card">
          <label htmlFor="plan-project">Project</label>
          <select id="plan-project" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
            {profile.projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title} (due {formatDate(p.deadline)})
              </option>
            ))}
          </select>
          <label htmlFor="plan-notes">What do you need to do next? (optional)</label>
          <textarea
            id="plan-notes"
            rows={2}
            maxLength={500}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g. Validate the sensor readings and print an enclosure"
          />
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy && !plan ? 'Planning…' : 'Generate plan'}
          </button>
        </form>
      )}

      <div aria-live="polite">
        {error && <Status kind="error">{error}</Status>}
        {plan && (
          <section className="card" aria-labelledby="plan-heading">
            <h2 id="plan-heading">
              Proposed plan for {plan.project.title} <SourceBadge source={plan.source} />
            </h2>
            <table>
              <caption className="visually-hidden">Proposed equipment bookings</caption>
              <thead>
                <tr>
                  <th scope="col">Need</th>
                  <th scope="col">Why</th>
                  <th scope="col">Proposed slot</th>
                </tr>
              </thead>
              <tbody>
                {plan.items.map((i) => (
                  <tr key={i.category}>
                    <th scope="row">
                      {titleCase(i.category)}
                      <br />
                      <span className="muted small">{i.hours} h</span>
                    </th>
                    <td>{i.reason}</td>
                    <td>
                      {i.start ? (
                        <>
                          <strong>{i.equipmentName}</strong>
                          <br />
                          {i.label} {i.highDemand && <Badge tone="warn">Fair queue</Badge>}
                        </>
                      ) : (
                        <ul className="violations">
                          {i.issues.map((x) => (
                            <li key={x}>{x}</li>
                          ))}
                        </ul>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {schedulable > 0 && (
              <button type="button" className="btn btn-primary" onClick={() => void bookAll()} disabled={busy || outcomes.length > 0}>
                {busy ? 'Booking…' : `Book all ${schedulable} slot${schedulable > 1 ? 's' : ''}`}
              </button>
            )}
          </section>
        )}
        {outcomes.map((o) => (
          <Status key={o.category} kind={o.ok ? 'success' : 'error'}>
            {o.message}
          </Status>
        ))}
      </div>
    </>
  );
}
