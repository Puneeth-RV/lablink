import { useState, type FormEvent } from 'react';
import { Badge, SourceBadge, Status } from '../components/ui';
import { api, ApiError, type BookingResult, type PlanResponse, type Profile, type Project } from '../lib/api';
import { formatDate, titleCase } from '../lib/format';

type BookOutcome = { category: string; ok: boolean; message: string };

/** Student describes the project; Gemini infers equipment needs; the scheduler proposes feasible slots. */
export default function PlannerPage({ profile, onBooked }: { profile: Profile; onBooked: () => void }) {
  const [mode, setMode] = useState<'new' | 'existing'>(profile.projects.length ? 'existing' : 'new');
  const [projectId, setProjectId] = useState(profile.projects[0]?.id ?? '');
  const [description, setDescription] = useState('');
  const [created, setCreated] = useState<Project & { source: 'gemini' | 'rules' }>();
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
      let id = projectId;
      if (mode === 'new') {
        // Gemini extracts title, deadline and equipment needs from the free-text description.
        const project = await api<Project & { source: 'gemini' | 'rules' }>('/projects', {
          method: 'POST',
          body: { description },
        });
        setCreated(project);
        setProjectId(project.id);
        setMode('existing');
        setDescription('');
        id = project.id;
        onBooked(); // refresh profile so the new project appears in the list
      }
      setPlan(
        await api<PlanResponse>('/plan', {
          method: 'POST',
          body: { projectId: id, ...(notes.trim() ? { notes } : {}) },
        }),
      );
    } catch (err) {
      const details =
        err instanceof ApiError && Array.isArray(err.details)
          ? ` ${err.details.map((d) => d.message).join(' ')}`
          : '';
      setError(`${(err as Error).message}.${details}`);
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
          body: {
            equipmentId: item.equipmentId,
            projectId: plan.project.id,
            start: item.start,
            end: item.end,
          },
        });
        results.push({
          category: item.category,
          ok: true,
          message:
            res.kind === 'booked'
              ? `Booked ${item.equipmentName}, ${item.label}`
              : `Joined the fair queue for ${item.equipmentName}, ${item.label}`,
        });
      } catch (err) {
        results.push({
          category: item.category,
          ok: false,
          message: `${item.equipmentName}: ${(err as Error).message}`,
        });
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
        LabLink works out which equipment your project needs and finds the earliest slots that fit your
        deadline, training, approvals and weekly hours.
      </p>

      {
        <form onSubmit={generate} className="card">
          <fieldset className="segmented">
            <legend className="visually-hidden">Project source</legend>
            <label>
              <input
                type="radio"
                name="mode"
                value="new"
                checked={mode === 'new'}
                onChange={() => setMode('new')}
              />
              Describe a new project
            </label>
            <label>
              <input
                type="radio"
                name="mode"
                value="existing"
                checked={mode === 'existing'}
                disabled={!profile.projects.length}
                onChange={() => setMode('existing')}
              />
              Use an existing project
            </label>
          </fieldset>
          {mode === 'new' ? (
            <>
              <label htmlFor="plan-description">Describe your project</label>
              <textarea
                id="plan-description"
                rows={4}
                minLength={20}
                maxLength={1000}
                required
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                aria-describedby="plan-description-hint"
                placeholder="e.g. Building a quadcopter frame for my minor project. Need to 3D print the arms and test the ESC signals. Due 5 December."
              />
              <p id="plan-description-hint" className="muted small">
                Write it the way you would explain it to a friend, including when it is due ("due 5 December",
                "in 2 weeks"). LabLink works out the title, deadline and equipment you need.
              </p>
            </>
          ) : (
            <>
              <label htmlFor="plan-project">Project</label>
              <select id="plan-project" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
                {profile.projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title} (due {formatDate(p.deadline)})
                  </option>
                ))}
              </select>
            </>
          )}
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
            {busy ? 'Planning…' : mode === 'new' ? 'Create project and plan' : 'Generate plan'}
          </button>
        </form>
      }

      <div aria-live="polite">
        {error && <Status kind="error">{error}</Status>}
        {created && (
          <Status kind="success">
            Created <strong>{created.title}</strong>, due {formatDate(created.deadline)}
            {created.essentialCategories.length > 0 && (
              <>, needs {created.essentialCategories.map(titleCase).join(', ')}</>
            )}
            . <SourceBadge source={created.source} />
          </Status>
        )}
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
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => void bookAll()}
                disabled={busy || outcomes.length > 0}
              >
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
