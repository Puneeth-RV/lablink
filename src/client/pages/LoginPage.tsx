import { useState, type FormEvent } from 'react';
import { Loading, Status } from '../components/ui';
import { api, session, type DemoUser, type Profile, type User } from '../lib/api';
import { useResource } from '../lib/hooks';

export function LoginPage({ onSignedIn }: { onSignedIn: (p: Profile) => void }) {
  const users = useResource<DemoUser[]>('/auth/demo-users');
  const [selected, setSelected] = useState('');
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!selected) return setError('Choose an account to continue.');
    setBusy(true);
    setError(undefined);
    try {
      const { token } = await api<{ token: string; user: User }>('/auth/login', { method: 'POST', body: { userId: selected } });
      session.set(token);
      onSignedIn(await api<Profile>('/me'));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const group = (role: DemoUser['role']) => users.data?.filter((u) => u.role === role) ?? [];

  return (
    <main id="main" className="login">
      <h1>LabLink</h1>
      <p className="lead">
        Discover specialised lab equipment across departments, book slots fairly, request project access and get faculty approvals —
        with conflicts resolved transparently by deadline, fairness and need.
      </p>
      {users.loading && <Loading />}
      {users.error && <Status kind="error">{users.error}</Status>}
      {users.data && (
        <form onSubmit={submit} className="card" aria-describedby={error ? 'login-error' : undefined}>
          {(['student', 'faculty'] as const).map((role) => (
            <fieldset key={role}>
              <legend>{role === 'student' ? 'Sign in as a student' : 'Sign in as faculty'}</legend>
              <div className="persona-grid">
                {group(role).map((u) => (
                  <label key={u.id} className="persona">
                    <input type="radio" name="persona" value={u.id} checked={selected === u.id} onChange={() => setSelected(u.id)} />
                    <span>
                      {u.name}
                      <span className="muted"> · {u.departmentId.toUpperCase()}</span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
          ))}
          {error && (
            <p id="login-error" className="field-error" role="alert">
              {error}
            </p>
          )}
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
          <p className="muted small">Demo accounts stand in for campus single sign-on.</p>
        </form>
      )}
    </main>
  );
}
