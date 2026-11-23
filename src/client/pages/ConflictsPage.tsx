import { useState } from 'react';
import { Alternatives, Badge, Loading, ScoreBreakdownView, SourceBadge, Status, ViolationList } from '../components/ui';
import { api, type ConflictGroup } from '../lib/api';
import { daysUntil, percent } from '../lib/format';
import { useResource } from '../lib/hooks';

export default function ConflictsPage() {
  const groups = useResource<ConflictGroup[]>('/conflicts');
  const [resolved, setResolved] = useState<ConflictGroup[]>([]);
  const [busy, setBusy] = useState<string>();
  const [error, setError] = useState<string>();

  async function resolve(id: string) {
    setBusy(id);
    setError(undefined);
    try {
      const result = await api<ConflictGroup>('/conflicts/resolve', { method: 'POST', body: { groupId: id } });
      setResolved((r) => [result, ...r]);
      groups.reload();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(undefined);
    }
  }

  return (
    <>
      <h1 tabIndex={-1}>Scheduling conflicts</h1>
      <p className="muted">
        Overlapping requests for high-demand equipment. LabLink ranks them by deadline urgency (40%), fair share of lab time (25%),
        requirement fit (20%) and waiting time (15%), after checking hard rules such as training, approvals and deadlines. Everyone who
        misses out gets feasible alternatives.
      </p>
      <div aria-live="polite">
        {error && <Status kind="error">{error}</Status>}
        {resolved.map((g) => (
          <Status key={g.id} kind="success">
            <strong>Allocated {g.equipmentName}</strong> ({g.label}). {g.explanation} {g.explanationSource && <SourceBadge source={g.explanationSource} />}
          </Status>
        ))}
      </div>
      {groups.loading && <Loading />}
      {groups.error && <Status kind="error">{groups.error}</Status>}
      {groups.data?.length === 0 && <p>No open conflicts in your department.</p>}
      {groups.data?.map((g) => (
        <section key={g.id} className="card" aria-labelledby={`g-${g.id}`}>
          <h2 id={`g-${g.id}`} className="h3">
            {g.equipmentName} · {g.label} <Badge tone="warn">{g.ranking.length} requests</Badge>
          </h2>
          <ol className="ranking">
            {g.ranking.map((r, i) => (
              <li key={r.requestId}>
                <p>
                  <strong>
                    #{i + 1} {r.studentName}
                  </strong>{' '}
                  — {r.projectTitle} · {r.label} · deadline in {daysUntil(r.deadline)} days{' '}
                  {r.decision === 'allocated' ? <Badge tone="ok">Proposed: allocate</Badge> : <Badge tone="danger">Proposed: alternatives</Badge>}
                  {r.score && <span className="score-total"> Score {percent(r.score.total)}</span>}
                </p>
                {r.score && <ScoreBreakdownView score={r.score} />}
                <ViolationList items={r.violations} />
                {r.decision === 'declined' && (
                  <details>
                    <summary>{r.alternatives.length} alternative(s) offered</summary>
                    <Alternatives items={r.alternatives} />
                  </details>
                )}
              </li>
            ))}
          </ol>
          <button type="button" className="btn btn-primary" onClick={() => resolve(g.id)} disabled={busy === g.id}>
            {busy === g.id ? 'Allocating…' : 'Apply fair allocation'}
          </button>
        </section>
      ))}
    </>
  );
}
