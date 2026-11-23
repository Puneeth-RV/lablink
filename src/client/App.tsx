import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { ThemeToggle } from './components/ThemeToggle';
import { Loading } from './components/ui';
import { api, session, type Profile } from './lib/api';
import { DiscoverPage } from './pages/DiscoverPage';
import { EquipmentPage } from './pages/EquipmentPage';
import { LoginPage } from './pages/LoginPage';
import { ActivityPage } from './pages/ActivityPage';

// Faculty-only pages are code-split so students never download them.
const ApprovalsPage = lazy(() => import('./pages/ApprovalsPage'));
const ConflictsPage = lazy(() => import('./pages/ConflictsPage'));
const InsightsPage = lazy(() => import('./pages/InsightsPage'));

export type Route =
  | { name: 'discover' }
  | { name: 'equipment'; id: string }
  | { name: 'activity' }
  | { name: 'approvals' }
  | { name: 'conflicts' }
  | { name: 'insights' };

const STUDENT_NAV: { route: Route['name']; label: string }[] = [
  { route: 'discover', label: 'Find equipment' },
  { route: 'activity', label: 'My bookings' },
];
const FACULTY_NAV: { route: Route['name']; label: string }[] = [
  { route: 'approvals', label: 'Approvals' },
  { route: 'conflicts', label: 'Conflicts' },
  { route: 'insights', label: 'Insights' },
  { route: 'discover', label: 'Equipment' },
];

export function App() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [checking, setChecking] = useState(!!session.get());
  const [route, setRoute] = useState<Route>({ name: 'discover' });
  const mainRef = useRef<HTMLElement>(null);

  const loadProfile = useCallback(() => {
    if (!session.get()) return;
    api<Profile>('/me')
      .then(setProfile)
      .catch(() => session.clear())
      .finally(() => setChecking(false));
  }, []);

  useEffect(loadProfile, [loadProfile]);

  const navigate = useCallback((next: Route) => {
    setRoute(next);
    // Move focus to the new page heading so keyboard and screen-reader users land on the content.
    requestAnimationFrame(() => mainRef.current?.querySelector<HTMLElement>('h1')?.focus());
  }, []);

  if (checking) return <Loading label="Restoring your session…" />;

  if (!profile) {
    return (
      <LoginPage
        onSignedIn={(p) => {
          setProfile(p);
          setRoute(p.user.role === 'faculty' ? { name: 'approvals' } : { name: 'discover' });
        }}
      />
    );
  }

  const nav = profile.user.role === 'faculty' ? FACULTY_NAV : STUDENT_NAV;
  const signOut = () => {
    session.clear();
    setProfile(null);
  };

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
          <ThemeToggle />
          <span className="avatar" aria-hidden="true">
            {profile.user.name.replace('Dr. ', '').split(' ').map((w) => w[0]).join('').slice(0, 2)}
          </span>
          <span className="user-name">
            {profile.user.name}
            <span className="muted small">{profile.user.role === 'faculty' ? 'Faculty' : 'Student'} · {profile.user.departmentId.toUpperCase()}</span>
          </span>
          <button type="button" className="btn btn-ghost" onClick={signOut}>
            Sign out
          </button>
        </div>
      </header>
      <main id="main" ref={mainRef} tabIndex={-1}>
        <Suspense fallback={<Loading />}>
          {route.name === 'discover' && <DiscoverPage onOpen={(id) => navigate({ name: 'equipment', id })} />}
          {route.name === 'equipment' && (
            <EquipmentPage
              key={route.id}
              id={route.id}
              profile={profile}
              onBack={() => navigate({ name: 'discover' })}
              onOpen={(id) => navigate({ name: 'equipment', id })}
              onBooked={loadProfile}
            />
          )}
          {route.name === 'activity' && <ActivityPage onChanged={loadProfile} />}
          {route.name === 'approvals' && <ApprovalsPage />}
          {route.name === 'conflicts' && <ConflictsPage />}
          {route.name === 'insights' && <InsightsPage />}
        </Suspense>
      </main>
      <footer className="app-footer">
        LabLink · Fair, explainable lab sharing · All times IST · AI by Google Gemini
      </footer>
    </>
  );
}
