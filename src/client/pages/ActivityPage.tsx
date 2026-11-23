import { useState } from 'react';
import { Alternatives, Badge, Loading, SourceBadge, Status, ViolationList } from '../components/ui';
import { api, type Activity } from '../lib/api';
import { useResource } from '../lib/hooks';
import { downloadIcs } from '../lib/ics';

const TONE = { pending: 'warn', allocated: 'ok', approved: 'ok', declined: 'danger', rejected: 'danger' } as const;

export function ActivityPage({ onChanged }: { onChanged: () => void }) {
  const activity = useResource<Activity>('/activity');
  const [message, setMessage] = useState<{ kind: 'success' | 'error'; text: string }>();

  async function cancel(id: string, label: string) {
    try {
      await api(`/bookings/${id}`, { method: 'DELETE' });
      setMessage({ kind: 'success', text: `Cancelled booking ${label}. The slot is free for others.` });
      activity.reload();
      onChanged();
    } catch (err) {
      setMessage({ kind: 'error', text: (err as Error).message });
    }
  }

  async function checkIn(id: string, name: string) {
    try {
      await api(`/bookings/${id}/check-in`, { method: 'POST' });
      setMessage({ kind: 'success', text: `Checked in to ${name}. Enjoy your session.` });
      activity.reload();
    } catch (err) {
      setMessage({ kind: 'error', text: (err as Error).message });
    }
  }

  return (
    <>
      <h1 tabIndex={-1}>My bookings</h1>
      <p className="muted small">Check in from 10 minutes before your slot. Bookings not checked in within 15 minutes are released to others.</p>
      <div aria-live="polite">{message && <Status kind={message.kind}>{message.text}</Status>}</div>
      {activity.loading && <Loading />}
      {activity.error && <Status kind="error">{activity.error}</Status>}
      {activity.data && (
        <>
          <section aria-labelledby="bookings-heading">
            <h2 id="bookings-heading">Confirmed bookings</h2>
            {activity.data.bookings.length === 0 ? (
              <p className="muted">No upcoming bookings.</p>
            ) : (
              <ul className="list">
                {activity.data.bookings.map((b) => (
                  <li key={b.id} className="card row-between">
                    <span>
                      <strong>{b.equipmentName}</strong> · {b.label}
                      <br />
                      <span className="muted small">{b.projectTitle}</span>
                    </span>
                    <span className="actions">
                      {b.checkedInAt && <Badge tone="ok">Checked in</Badge>}
                      {b.canCheckIn && (
                        <button type="button" className="btn btn-primary btn-small" onClick={() => void checkIn(b.id, b.equipmentName)} aria-label={`Check in to ${b.equipmentName}`}>
                          Check in
                        </button>
                      )}
                      <button
                        type="button"
                        className="btn btn-small"
                        aria-label={`Add ${b.equipmentName} on ${b.label} to calendar`}
                        onClick={() =>
                          downloadIcs({ uid: b.id, title: `Lab: ${b.equipmentName}`, location: b.equipmentName, description: `LabLink booking for ${b.projectTitle}`, start: b.start, end: b.end })
                        }
                      >
                        Add to calendar
                      </button>
                      {b.upcoming && (
                        <button type="button" className="btn btn-ghost btn-small" onClick={() => cancel(b.id, b.label)} aria-label={`Cancel ${b.equipmentName} on ${b.label}`}>
                          Cancel
                        </button>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section aria-labelledby="queue-heading">
            <h2 id="queue-heading">Fair-queue requests</h2>
            {activity.data.slotRequests.length === 0 ? (
              <p className="muted">No requests for high-demand equipment.</p>
            ) : (
              <ul className="list">
                {activity.data.slotRequests.map((r) => (
                  <li key={r.id} className="card">
                    <p>
                      <strong>{r.equipmentName}</strong> · {r.label} <Badge tone={TONE[r.status]}>{r.status}</Badge>
                    </p>
                    <p className="muted small">{r.projectTitle}</p>
                    {r.outcome?.explanation && <p className="explanation">{r.outcome.explanation}</p>}
                    {r.outcome && <ViolationList items={r.outcome.violations} />}
                    {r.status === 'declined' && <Alternatives items={r.alternatives} />}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section aria-labelledby="access-list-heading">
            <h2 id="access-list-heading">Access requests</h2>
            {activity.data.accessRequests.length === 0 ? (
              <p className="muted">No access requests.</p>
            ) : (
              <ul className="list">
                {activity.data.accessRequests.map((a) => (
                  <li key={a.id} className="card">
                    <p>
                      <strong>{a.equipmentName}</strong> for {a.projectTitle} <Badge tone={TONE[a.status]}>{a.status}</Badge>
                    </p>
                    {a.decisionNote && <p className="muted">Faculty note: {a.decisionNote}</p>}
                    {a.aiReview && (
                      <p className="small">
                        Review: {a.aiReview.summary} <SourceBadge source={a.aiReview.source} />
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </>
  );
}
