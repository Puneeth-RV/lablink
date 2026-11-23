import { useMemo, useState, type FormEvent } from 'react';
import { EquipmentMedia } from '../components/EquipmentMedia';
import { Badge, Loading, SourceBadge, Status } from '../components/ui';
import { api, type DiscoverResponse, type Equipment, type Meta } from '../lib/api';
import { titleCase } from '../lib/format';
import { useDebounced, useResource } from '../lib/hooks';

function EquipmentBadges({ e }: { e: Equipment }) {
  return (
    <span className="badges">
      {e.status === 'maintenance' ? (
        <Badge tone="danger">Under maintenance</Badge>
      ) : (
        !e.highDemand && !e.requiresApproval && <Badge tone="ok">Instant booking</Badge>
      )}
      {e.highDemand && <Badge tone="warn">High demand · fair queue</Badge>}
      {e.requiresApproval && <Badge tone="info">Faculty approval</Badge>}
      {e.requiredTraining && <Badge>Training: {titleCase(e.requiredTraining)}</Badge>}
    </span>
  );
}

export function DiscoverPage({ onOpen }: { onOpen: (id: string) => void }) {
  const meta = useResource<Meta>('/meta');
  const [q, setQ] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [category, setCategory] = useState('');
  const debouncedQ = useDebounced(q);
  const query = useMemo(() => {
    const p = new URLSearchParams();
    if (debouncedQ.trim()) p.set('q', debouncedQ.trim());
    if (departmentId) p.set('departmentId', departmentId);
    if (category) p.set('category', category);
    return `/equipment?${p.toString()}`;
  }, [debouncedQ, departmentId, category]);
  const list = useResource<Equipment[]>(query);
  const deptName = (id: string) => meta.data?.departments.find((d) => d.id === id)?.name ?? id;

  const [need, setNeed] = useState('');
  const [ai, setAi] = useState<DiscoverResponse>();
  const [aiError, setAiError] = useState<string>();
  const [aiBusy, setAiBusy] = useState(false);

  async function ask(e: FormEvent) {
    e.preventDefault();
    if (need.trim().length < 3) return setAiError('Describe what you need in a few words.');
    setAiBusy(true);
    setAiError(undefined);
    try {
      setAi(await api<DiscoverResponse>('/discover', { method: 'POST', body: { query: need } }));
    } catch (err) {
      setAiError((err as Error).message);
    } finally {
      setAiBusy(false);
    }
  }

  return (
    <>
      <h1 tabIndex={-1}>Find lab equipment</h1>
      <p className="muted">
        Equipment from all departments. Describe what you need, or browse the full list below.
      </p>

      <section aria-labelledby="ai-heading" className="card">
        <h2 id="ai-heading">Find by project need</h2>
        <form onSubmit={ask}>
          <label htmlFor="need">What are you trying to build or measure?</label>
          <textarea
            id="need"
            rows={2}
            maxLength={500}
            value={need}
            onChange={(e) => setNeed(e.target.value)}
            placeholder="e.g. I need to debug I2C signals between my ESP32 and a soil sensor"
            aria-describedby={aiError ? 'need-error' : 'need-hint'}
            aria-invalid={!!aiError}
          />
          <p id="need-hint" className="muted small">
            Suggestions are generated with Gemini and limited to equipment in the catalogue.
          </p>
          {aiError && (
            <p id="need-error" className="field-error" role="alert">
              {aiError}
            </p>
          )}
          <button type="submit" className="btn btn-primary" disabled={aiBusy}>
            {aiBusy ? 'Searching…' : 'Recommend equipment'}
          </button>
        </form>
        <div aria-live="polite">
          {ai && (
            <div className="ai-results">
              <p>
                {ai.matches.length} recommendation{ai.matches.length === 1 ? '' : 's'}{' '}
                <SourceBadge source={ai.source} />
              </p>
              <ol>
                {ai.matches.map((m) => (
                  <li key={m.equipmentId}>
                    <button type="button" className="link" onClick={() => onOpen(m.equipmentId)}>
                      {m.equipment.name}
                    </button>{' '}
                    <span className="muted">({deptName(m.equipment.departmentId)})</span> — {m.reason}{' '}
                    <EquipmentBadges e={m.equipment} />
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>
      </section>

      <section aria-labelledby="browse-heading">
        <h2 id="browse-heading">Browse the catalogue</h2>
        <div className="filters">
          <div>
            <label htmlFor="q">Search</label>
            <input
              id="q"
              type="search"
              value={q}
              maxLength={100}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Name or capability"
            />
          </div>
          <div>
            <label htmlFor="dept">Department</label>
            <select id="dept" value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}>
              <option value="">All departments</option>
              {meta.data?.departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="cat">Category</label>
            <select id="cat" value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="">All categories</option>
              {meta.data?.categories.map((c) => (
                <option key={c} value={c}>
                  {titleCase(c)}
                </option>
              ))}
            </select>
          </div>
        </div>
        {list.loading && <Loading />}
        {list.error && <Status kind="error">{list.error}</Status>}
        {list.data && (
          <>
            <p className="muted" role="status">
              {list.data.length} item{list.data.length === 1 ? '' : 's'} found
            </p>
            <ul className="grid">
              {list.data.map((e) => (
                <li key={e.id} className="card equipment-card">
                  <EquipmentMedia id={e.id} name={e.name} category={e.category} />
                  <h3>{e.name}</h3>
                  <p className="muted small">
                    {deptName(e.departmentId)} · {e.location}
                  </p>
                  <p>{e.description}</p>
                  <EquipmentBadges e={e} />
                  <button
                    type="button"
                    className="btn"
                    onClick={() => onOpen(e.id)}
                    aria-label={`View & book ${e.name}`}
                  >
                    View &amp; book
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </>
  );
}
