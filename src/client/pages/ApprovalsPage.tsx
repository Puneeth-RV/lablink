import { useState } from 'react';
import { Loading, SourceBadge, Status } from '../components/ui';
import { api, type PendingApproval } from '../lib/api';
import { daysUntil, formatDate } from '../lib/format';
import { useResource } from '../lib/hooks';

export default function ApprovalsPage() {
  const pending = useResource<PendingApproval[]>('/approvals');
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<{ kind: 'success' | 'error'; text: string }>();

  async function decide(a: PendingApproval, decision: 'approved' | 'rejected') {
    try {
      const note = notes[a.id]?.trim();
      await api(`/approvals/${a.id}`, { method: 'POST', body: { decision, ...(note ? { note } : {}) } });
      setMessage({
        kind: 'success',
        text: `${decision === 'approved' ? 'Approved' : 'Rejected'} ${a.studentName}'s request for ${a.equipmentName}.`,
      });
      pending.reload();
    } catch (err) {
      setMessage({ kind: 'error', text: (err as Error).message });
    }
  }

  return (
    <>
      <h1 tabIndex={-1}>Access approvals</h1>
      <p className="muted">
        Access requests for equipment in your department. Each request includes an automated pre-review.
      </p>
      <div aria-live="polite">{message && <Status kind={message.kind}>{message.text}</Status>}</div>
      {pending.loading && <Loading label="Loading requests and reviews…" />}
      {pending.error && <Status kind="error">{pending.error}</Status>}
      {pending.data?.length === 0 && <p className="muted">No pending requests.</p>}
      <ul className="list">
        {pending.data?.map((a) => (
          <li key={a.id} className="card">
            <h2 className="h3">
              {a.studentName} → {a.equipmentName}
            </h2>
            <p className="muted small">
              {a.projectTitle} · due {formatDate(a.deadline)} ({daysUntil(a.deadline)} days)
            </p>
            <blockquote>{a.justification}</blockquote>
            {a.aiReview && (
              <div className="review">
                <p>
                  <strong>Pre-review</strong> <SourceBadge source={a.aiReview.source} />: {a.aiReview.summary}
                </p>
                {a.aiReview.riskFlags.length > 0 && (
                  <ul aria-label="Risk flags">
                    {a.aiReview.riskFlags.map((f) => (
                      <li key={f}>{f}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}
            <label htmlFor={`note-${a.id}`}>Note to student (optional)</label>
            <input
              id={`note-${a.id}`}
              maxLength={500}
              value={notes[a.id] ?? ''}
              onChange={(e) => setNotes({ ...notes, [a.id]: e.target.value })}
            />
            <div className="actions">
              <button type="button" className="btn btn-primary" onClick={() => decide(a, 'approved')}>
                Approve
              </button>
              <button type="button" className="btn btn-danger" onClick={() => decide(a, 'rejected')}>
                Reject
              </button>
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
