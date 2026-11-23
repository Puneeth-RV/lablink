import { useState } from 'react';
import { Badge, Loading, Status } from '../components/ui';
import { api, type OpenFault } from '../lib/api';
import { formatDateTime } from '../lib/format';
import { useResource } from '../lib/hooks';

export default function FaultsPage() {
  const faults = useResource<OpenFault[]>('/faults');
  const [message, setMessage] = useState<{ kind: 'success' | 'error'; text: string }>();

  async function act(f: OpenFault, action: 'maintenance' | 'resolve') {
    try {
      await api(`/faults/${f.id}`, { method: 'POST', body: { action } });
      setMessage({
        kind: 'success',
        text: action === 'maintenance' ? `${f.equipmentName} is now offline for maintenance.` : `Fault resolved — ${f.equipmentName} is back online.`,
      });
      faults.reload();
    } catch (err) {
      setMessage({ kind: 'error', text: (err as Error).message });
    }
  }

  return (
    <>
      <h1 tabIndex={-1}>Equipment faults</h1>
      <p className="muted">Problems reported by students and staff on equipment in your department.</p>
      <div aria-live="polite">{message && <Status kind={message.kind}>{message.text}</Status>}</div>
      {faults.loading && <Loading />}
      {faults.error && <Status kind="error">{faults.error}</Status>}
      {faults.data?.length === 0 && <p className="muted">No open fault reports.</p>}
      <ul className="list">
        {faults.data?.map((f) => (
          <li key={f.id} className="card">
            <h2 className="h3">
              {f.equipmentName}{' '}
              {f.equipmentStatus === 'maintenance' ? <Badge tone="danger">Offline</Badge> : <Badge tone="ok">In service</Badge>}
            </h2>
            <p className="muted small">
              Reported by {f.reporterName} · {formatDateTime(f.createdAt)}
            </p>
            <blockquote>{f.description}</blockquote>
            <div className="actions">
              {f.equipmentStatus !== 'maintenance' && (
                <button type="button" className="btn btn-danger" onClick={() => void act(f, 'maintenance')}>
                  Take offline
                </button>
              )}
              <button type="button" className="btn btn-primary" onClick={() => void act(f, 'resolve')}>
                Mark resolved
              </button>
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
