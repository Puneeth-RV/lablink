import type { DemoUser } from '../lib/api';

interface Props {
  users: DemoUser[];
  currentId: string;
  busy: boolean;
  onSwitch: (userId: string) => void;
}

/**
 * Demo persona selector (stands in for campus single sign-on). There is deliberately no
 * login wall: visitors land on the app immediately and can switch roles in one step,
 * while the API still enforces signed sessions and role-based access on every request.
 */
export function PersonaSwitcher({ users, currentId, busy, onSwitch }: Props) {
  const group = (role: DemoUser['role']) => users.filter((u) => u.role === role);
  return (
    <div className="persona-switcher">
      <label htmlFor="persona">Viewing as</label>
      <select id="persona" value={currentId} disabled={busy} onChange={(e) => onSwitch(e.target.value)}>
        <optgroup label="Students">
          {group('student').map((u) => (
            <option key={u.id} value={u.id}>
              {u.name} · {u.departmentId.toUpperCase()}
            </option>
          ))}
        </optgroup>
        <optgroup label="Faculty">
          {group('faculty').map((u) => (
            <option key={u.id} value={u.id}>
              {u.name} · {u.departmentId.toUpperCase()}
            </option>
          ))}
        </optgroup>
      </select>
    </div>
  );
}
