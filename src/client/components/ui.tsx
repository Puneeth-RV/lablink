import { type ReactNode } from 'react';
import type { NamedAlternative, ScoreBreakdown } from '../lib/api';
import { formatSlot, percent } from '../lib/format';

/** Announces async results to screen readers; errors interrupt (assertive), the rest wait (polite). */
export function Status({ kind = 'info', children }: { kind?: 'info' | 'success' | 'error'; children: ReactNode }) {
  return (
    <div className={`status status-${kind}`} role={kind === 'error' ? 'alert' : 'status'}>
      {children}
    </div>
  );
}

export function Loading({ label = 'Loading…' }: { label?: string }) {
  return (
    <p className="muted" role="status">
      {label}
    </p>
  );
}

export function Badge({ tone = 'neutral', children }: { tone?: 'neutral' | 'warn' | 'info' | 'ok' | 'danger'; children: ReactNode }) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

export function SourceBadge({ source }: { source: 'gemini' | 'rules' }) {
  return source === 'gemini' ? <Badge tone="info">Gemini</Badge> : <Badge>Rule-based</Badge>;
}

export function ViolationList({ items }: { items: string[] }) {
  if (!items.length) return null;
  return (
    <ul className="violations">
      {items.map((v) => (
        <li key={v}>{v}</li>
      ))}
    </ul>
  );
}

export function Alternatives({ items, onPick }: { items: NamedAlternative[]; onPick?: (alt: NamedAlternative) => void }) {
  if (!items.length) return <p className="muted">No alternatives found before the deadline.</p>;
  return (
    <ul className="alternatives" aria-label="Suggested alternatives">
      {items.map((a) => (
        <li key={`${a.equipmentId}-${a.start}`}>
          <span>
            <strong>{a.equipmentName ?? a.equipmentId}</strong> · {a.label ?? formatSlot(a)}{' '}
            <Badge>{a.kind === 'equivalent-equipment' ? 'Equivalent equipment' : 'Same equipment, other time'}</Badge>
          </span>
          {onPick && (
            <button type="button" className="btn btn-small" onClick={() => onPick(a)}>
              Use this
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}

const FACTORS: { key: keyof Omit<ScoreBreakdown, 'total'>; label: string }[] = [
  { key: 'urgency', label: 'Deadline urgency (40%)' },
  { key: 'fairness', label: 'Fair share (25%)' },
  { key: 'fit', label: 'Requirement fit (20%)' },
  { key: 'waiting', label: 'Waiting time (15%)' },
];

/** Explainable score: every factor shown as a labelled meter plus its value in text. */
export function ScoreBreakdownView({ score }: { score: ScoreBreakdown }) {
  return (
    <dl className="score">
      {FACTORS.map(({ key, label }) => (
        <div key={key} className="score-row">
          <dt>{label}</dt>
          <dd>
            <meter min={0} max={1} value={score[key]} aria-label={label} />
            <span>{percent(score[key])}</span>
          </dd>
        </div>
      ))}
    </dl>
  );
}
