import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { ThemeToggle } from './components/ThemeToggle';
import { PersonaSwitcher } from './components/PersonaSwitcher';
import { Loading, Status } from './components/ui';
import { api, session, type DemoUser, type Profile } from './lib/api';
import { useResource } from './lib/hooks';
import { DiscoverPage } from './pages/DiscoverPage';
import { EquipmentPage } from './pages/EquipmentPage';
import { ActivityPage } from './pages/ActivityPage';

// Faculty-only pages are code-split so students never download them.
const ApprovalsPage = lazy(() => import('./pages/ApprovalsPage'));
const ConflictsPage = lazy(() => import('./pages/ConflictsPage'));
const InsightsPage = lazy(() => import('./pages/InsightsPage'));
const FaultsPage = lazy(() => import('./pages/FaultsPage'));
const PlannerPage = lazy(() => import('./pages/PlannerPage'));

export type Route =
  | { name: 'discover' }
  | { name: 'equipment'; id: string }
  | { name: 'activity' }
  | { name: 'approvals' }
  | { name: 'conflicts' }
  | { name: 'insights' }
  | { name: 'faults' }
  | { name: 'planner' };

type Summary = Partial<Record<'upcoming' | 'queued' | 'awaitingApproval' | 'approvals' | 'conflicts' | 'faults', number>>;

/** Which summary counts appear as a badge on each nav item. */
const NAV_COUNTS: Partial<Record<Route['name'], (s: Summary) => number>> = {
  activity: (s) => (s.queued ?? 0) + (s.awaitingApproval ?? 0),
  approvals: (s) => s.approvals ?? 0,
  conflicts: (s) => s.conflicts ?? 0,
  faults: (s) => s.faults ?? 0,
};

const STUDENT_NAV: { route: Route['name']; label: string }[] = [
  { route: 'discover', label: 'Find equipment' },
  { route: 'planner', label: 'Plan my project' },
  { route: 'activity', label: 'My bookings' },
];
const FACULTY_NAV: { route: Route['name']; label: string }[] = [
  { route: 'approvals', label: 'Approvals' },
  { route: 'conflicts', label: 'Conflicts' },
  { route: 'faults', label: 'Faults' },
  { route: 'insights', label: 'Insights' },
  { route: 'discover', label: 'Equipment' },
];

/** Persona shown to first-time visitors so the app is usable immediately, with no login wall. */
const DEFAULT_PERSONA = 'stu-asha';
const PERSONA_KEY = 'lablink.persona';

export function App() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState<string>();
  const [switching, setSwitching] = useState(false);
  const [route, setRoute] = useState<Route>({ name: 'discover' });
  const users = useResource<DemoUser[]>('/auth/demo-users');
  // Re-fetched on every navigation (and persona switch) so badges stay current.
  const summary = useResource<Summary>(profile ? `/summary?u=${profile.user.id}&r=${route.name}` : null);
  const mainRef = useRef<HTMLElement>(null);

  const signInAs = useCallback(async (userId: string): Promise<Profile | null> => {
    setSwitching(true);
    setError(undefined);
    try {
      const { token, profile: next } = await api<{ token: string; profile: Profile }>('/auth/login', { method: 'POST', body: { userId } });
      session.set(token);
      sessionStorage.setItem(PERSONA_KEY, userId);
      setProfile(next);
      return next;
    } catch (err) {
      setError((err as Error).message);
      return null;
    } finally {
      setSwitching(false);
    }
  }, []);

  // Restore the current session, or start one as the default persona.
  useEffect(() => {
    let cancelled = false;
    const restore = session.get() ? api<Profile>('/me').catch(() => null) : Promise.resolve(null);
    void restore.then((existing) => {
      if (cancelled) return;
      if (existing) setProfile(existing);
      else void signInAs(sessionStorage.getItem(PERSONA_KEY) ?? DEFAULT_PERSONA);
    });
    return () => {
      cancelled = true;
    };
  }, [signInAs]);

  const refreshProfile = useCallback(() => {
    api<Profile>('/me')
      .then(setProfile)
      .catch(() => undefined);
  }, []);

  const navigate = useCallback((next: Route) => {
    setRoute(next);
    // Move focus to the new page heading so keyboard and screen-reader users land on the content.
    requestAnimationFrame(() => mainRef.current?.querySelector<HTMLElement>('h1')?.focus());
  }, []);

  async function switchPersona(userId: string) {
    const next = await signInAs(userId);
    if (next) navigate(next.user.role === 'faculty' ? { name: 'approvals' } : { name: 'discover' });
  }

  if (!profile) {
    return (
      <main id="main" className="boot">
        {error ? (
          <Status kind="error">
            Could not start LabLink: {error}{' '}
            <button type="button" className="btn btn-small" onClick={() => void signInAs(DEFAULT_PERSONA)}>
              Retry
            </button>
          </Status>
        ) : (
          <Loading label="Loading LabLink…" />
        )}
      </main>
    );
  }

  const nav = profile.user.role === 'faculty' ? FACULTY_NAV : STUDENT_NAV;

  return (
    <>
      <a className="skip-link" href="#main">
        Skip to main content
      </a>
      <header className="app-header">
        <div className="brand">
          <img src="/logo.svg" alt="" width="32" height="32" />
          <span>LabLink</span>
        </div>
        <nav aria-label="Main">
          <ul>
            {nav.map((n) => (
              <li key={n.route}>
                <button
                  type="button"
                  className="nav-link"
                  aria-current={route.name === n.route ? 'page' : undefined}
                  onClick={() => navigate({ name: n.route } as Route)}
                >
                  {n.label}
                  {(() => {
                    const count = summary.data ? NAV_COUNTS[n.route]?.(summary.data) ?? 0 : 0;
                    return count > 0 ? (
                      <>
                        <span className="nav-count" aria-hidden="true">
                          {count}
                        </span>
                        <span className="visually-hidden">, {count} need attention</span>
                      </>
                    ) : null;
                  })()}
                </button>
              </li>
            ))}
          </ul>
        </nav>
        <div className="user-box">
          {profile.user.role === 'student' && (
            <span className="usage">
              <label htmlFor="usage-meter">Lab hours this week</label>
              <meter id="usage-meter" min={0} max={profile.usage.cap} high={profile.usage.cap * 0.8} value={profile.usage.hours} />
              <span>
                {profile.usage.hours}/{profile.usage.cap} h
              </span>
            </span>
          )}
          {users.data && <PersonaSwitcher users={users.data} currentId={profile.user.id} busy={switching} onSwitch={(id) => void switchPersona(id)} />}
          <ThemeToggle />
        </div>
      </header>
      <main id="main" ref={mainRef} tabIndex={-1}>
        {error && <Status kind="error">{error}</Status>}
        <Suspense fallback={<Loading />}>
          {route.name === 'discover' && <DiscoverPage onOpen={(id) => navigate({ name: 'equipment', id })} />}
          {route.name === 'equipment' && (
            <EquipmentPage
              key={route.id}
              id={route.id}
              profile={profile}
              onBack={() => navigate({ name: 'discover' })}
              onOpen={(id) => navigate({ name: 'equipment', id })}
              onBooked={refreshProfile}
            />
          )}
          {route.name === 'activity' && <ActivityPage onChanged={refreshProfile} />}
          {route.name === 'approvals' && <ApprovalsPage />}
          {route.name === 'conflicts' && <ConflictsPage />}
          {route.name === 'insights' && <InsightsPage />}
          {route.name === 'faults' && <FaultsPage />}
          {route.name === 'planner' && <PlannerPage profile={profile} onBooked={refreshProfile} />}
        </Suspense>
      </main>
      <footer className="app-footer">
        LabLink · All times are IST · Demo personas stand in for campus single sign-on
      </footer>
    </>
  );
}
