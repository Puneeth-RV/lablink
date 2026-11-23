import { useState, type FormEvent } from 'react';
import { Alternatives, Badge, Loading, Status, ViolationList } from '../components/ui';
import { api, ApiError, type AccessRequest, type Activity, type BookingResult, type Equipment, type NamedAlternative, type Profile, type Slot } from '../lib/api';
import { campusDate, campusIso, campusParts, formatDate, formatSlot, formatTime, titleCase } from '../lib/format';
import { useResource } from '../lib/hooks';

const HOURS = [9, 10, 11, 12, 13, 14, 15, 16, 17];
const STATUS_TEXT: Record<Slot['status'], string> = { free: 'Free', booked: 'Booked', past: 'Past', unavailable: 'Unavailable' };

interface Props {
  id: string;
  profile: Profile;
  onBack: () => void;
  onOpen: (id: string) => void;
  onBooked: () => void;
}

type Outcome =
  | { kind: 'success'; message: string }
  | { kind: 'error'; message: string; violations: string[]; alternatives: NamedAlternative[] };

export function EquipmentPage({ id, profile, onBack, onOpen, onBooked }: Props) {
  const equipment = useResource<Equipment>(`/equipment/${id}`);
  const [day, setDay] = useState(campusDate(1));
  const availability = useResource<{ slots: Slot[] }>(`/equipment/${id}/availability?date=${day}`);
  const isStudent = profile.user.role === 'student';
  const activity = useResource<Activity>(isStudent ? '/activity' : null);

  const [projectId, setProjectId] = useState(profile.projects[0]?.id ?? '');
  const [hour, setHour] = useState(10);
  const [hours, setHours] = useState(1);
  const [outcome, setOutcome] = useState<Outcome>();
  const [busy, setBusy] = useState(false);

  const [justification, setJustification] = useState('');
  const [accessResult, setAccessResult] = useState<{ kind: 'success' | 'error'; message: string }>();

  if (equipment.loading) return <Loading />;
  if (equipment.error || !equipment.data) return <Status kind="error">{equipment.error ?? 'Not found'}</Status>;
  const e = equipment.data;

  const access = activity.data?.accessRequests.find((a) => a.equipmentId === e.id && a.projectId === projectId);
  const trained = !e.requiredTraining || profile.user.trainings.includes(e.requiredTraining);

  async function book(ev: FormEvent) {
    ev.preventDefault();
    setBusy(true);
    setOutcome(undefined);
    try {
      const res = await api<BookingResult>('/bookings', {
        method: 'POST',
        body: { equipmentId: e.id, projectId, start: campusIso(day, hour), end: campusIso(day, hour + hours) },
      });
      setOutcome({
        kind: 'success',
        message:
          res.kind === 'booked'
            ? `Booked ${e.name} for ${formatSlot(res.booking)}.`
            : `High-demand equipment: your request for ${formatSlot(res.request)} joined the fair-allocation queue. Faculty will allocate contested slots by deadline, fair share and need — track it under My bookings.`,
      });
      availability.reload();
      onBooked();
    } catch (err) {
      const details = err instanceof ApiError && !Array.isArray(err.details) ? err.details : undefined;
      setOutcome({ kind: 'error', message: (err as Error).message, violations: details?.violations ?? [], alternatives: details?.alternatives ?? [] });
    } finally {
      setBusy(false);
    }
  }

  function pick(alt: NamedAlternative) {
    if (alt.equipmentId !== e.id) return onOpen(alt.equipmentId);
    const p = campusParts(alt.start);
    setDay(p.day);
    setHour(p.hour);
    setOutcome(undefined);
  }

  async function requestAccess(ev: FormEvent) {
    ev.preventDefault();
    setAccessResult(undefined);
    try {
      await api<AccessRequest>('/access-requests', { method: 'POST', body: { equipmentId: e.id, projectId, justification } });
      setAccessResult({ kind: 'success', message: 'Request sent to faculty for approval.' });
      setJustification('');
      activity.reload();
    } catch (err) {
      const details = err instanceof ApiError && Array.isArray(err.details) ? err.details.map((d) => d.message).join(' ') : '';
      setAccessResult({ kind: 'error', message: `${(err as Error).message}. ${details}`.trim() });
    }
  }

  return (
    <>
      <button type="button" className="link back" onClick={onBack}>
        ← Back to equipment
      </button>
      <h1 tabIndex={-1}>{e.name}</h1>
      <p className="muted">
        {e.location} · {titleCase(e.category)} · max {e.maxSlotHours} h per slot
      </p>
      <p>{e.description}</p>
      <p className="badges">
        {e.capabilities.map((c) => (
          <Badge key={c}>{c}</Badge>
        ))}
      </p>
      {e.status === 'maintenance' && <Status kind="error">This equipment is under maintenance and cannot be booked.</Status>}
      {e.requiredTraining && (
        <p>
          Requires <strong>{titleCase(e.requiredTraining)}</strong> training —{' '}
          {isStudent ? (trained ? 'you have completed it.' : 'you have not completed it yet.') : 'checked automatically at booking.'}
        </p>
      )}

      <div className="two-col">
        <section aria-labelledby="avail-heading" className="card">
          <h2 id="avail-heading">Availability</h2>
          <label htmlFor="day">Date</label>
          <input id="day" type="date" value={day} min={campusDate(0)} onChange={(ev) => ev.target.value && setDay(ev.target.value)} />
          {availability.loading && <Loading />}
          {availability.error && <Status kind="error">{availability.error}</Status>}
          {availability.data && (
            <table className="slots">
              <caption>Hourly availability on {formatDate(`${day}T12:00:00+05:30`)}</caption>
              <thead>
                <tr>
                  <th scope="col">Time</th>
                  <th scope="col">Status</th>
                  <th scope="col">Pending requests</th>
                </tr>
              </thead>
              <tbody>
                {availability.data.slots.map((s) => (
                  <tr key={s.start} className={`slot-${s.status}`}>
                    <th scope="row">
                      {formatTime(s.start)}–{formatTime(s.end)}
                    </th>
                    <td>
                      <span className={`dot dot-${s.status}`} aria-hidden="true" /> {STATUS_TEXT[s.status]}
                    </td>
                    <td>{s.requested || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        {isStudent && (
          <section aria-labelledby="book-heading" className="card">
            <h2 id="book-heading">{e.highDemand ? 'Request a slot' : 'Book a slot'}</h2>
            {e.highDemand && (
              <p className="muted small">
                High-demand equipment is not first-come-first-served: overlapping requests are allocated fairly by deadline urgency, fair
                share of lab time, requirement fit and waiting time.
              </p>
            )}
            {profile.projects.length === 0 ? (
              <p>You have no registered projects.</p>
            ) : (
              <form onSubmit={book}>
                <label htmlFor="project">Project</label>
                <select id="project" value={projectId} onChange={(ev) => setProjectId(ev.target.value)}>
                  {profile.projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.title} (due {formatDate(p.deadline)})
                    </option>
                  ))}
                </select>
                <div className="row">
                  <div>
                    <label htmlFor="start-hour">Start time</label>
                    <select id="start-hour" value={hour} onChange={(ev) => setHour(Number(ev.target.value))}>
                      {HOURS.map((h) => (
                        <option key={h} value={h}>
                          {String(h).padStart(2, '0')}:00
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="duration">Duration</label>
                    <select id="duration" value={hours} onChange={(ev) => setHours(Number(ev.target.value))}>
                      {Array.from({ length: e.maxSlotHours }, (_, i) => i + 1).map((h) => (
                        <option key={h} value={h}>
                          {h} hour{h > 1 ? 's' : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <button type="submit" className="btn btn-primary" disabled={busy || e.status !== 'available'}>
                  {busy ? 'Checking…' : e.highDemand ? 'Join fair queue' : 'Book now'}
                </button>
              </form>
            )}
            <div aria-live="polite">
              {outcome?.kind === 'success' && <Status kind="success">{outcome.message}</Status>}
              {outcome?.kind === 'error' && (
                <div className="status status-error" role="alert">
                  <p>
                    <strong>{outcome.message}.</strong>
                  </p>
                  <ViolationList items={outcome.violations} />
                  {outcome.alternatives.length > 0 && <p>Feasible alternatives:</p>}
                  {outcome.alternatives.length > 0 && <Alternatives items={outcome.alternatives} onPick={pick} />}
                </div>
              )}
            </div>
          </section>
        )}
      </div>

      {isStudent && e.requiresApproval && (
        <section aria-labelledby="access-heading" className="card">
          <h2 id="access-heading">Project access</h2>
          {access ? (
            <p>
              Access for this project: <Badge tone={access.status === 'approved' ? 'ok' : access.status === 'rejected' ? 'danger' : 'warn'}>{access.status}</Badge>
              {access.decisionNote && <span className="muted"> — “{access.decisionNote}”</span>}
            </p>
          ) : (
            <form onSubmit={requestAccess}>
              <p className="muted small">This equipment needs faculty approval for the selected project before booking.</p>
              <label htmlFor="justification">Why does your project need it?</label>
              <textarea
                id="justification"
                rows={3}
                minLength={20}
                maxLength={1000}
                required
                value={justification}
                onChange={(ev) => setJustification(ev.target.value)}
              />
              <button type="submit" className="btn">
                Request access
              </button>
            </form>
          )}
          <div aria-live="polite">{accessResult && <Status kind={accessResult.kind}>{accessResult.message}</Status>}</div>
        </section>
      )}
    </>
  );
}
