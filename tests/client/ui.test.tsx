// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ThemeToggle } from '../../src/client/components/ThemeToggle';
import { Alternatives, ScoreBreakdownView, Status } from '../../src/client/components/ui';
import { DiscoverPage } from '../../src/client/pages/DiscoverPage';
import { App } from '../../src/client/App';
import { PersonaSwitcher } from '../../src/client/components/PersonaSwitcher';

async function expectNoA11yViolations(container: HTMLElement) {
  const results = await axe.run(container, { rules: { 'color-contrast': { enabled: false } } });
  expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
}

const json = (body: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }));

const EQUIPMENT = {
  id: 'osc-1',
  name: 'Keysight Oscilloscope',
  category: 'oscilloscope',
  departmentId: 'ece',
  location: 'Lab 101',
  description: 'Scope',
  capabilities: ['signal analysis'],
  requiresApproval: true,
  status: 'available',
  maxSlotHours: 3,
  highDemand: true,
};

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  sessionStorage.clear();
  fetchMock = vi.fn((url: string, init?: RequestInit) => {
    if (url === '/api/auth/demo-users') return json([{ id: 'stu-asha', name: 'Asha Nair', role: 'student', departmentId: 'ece' }, { id: 'fac-iyer', name: 'Dr. Iyer', role: 'faculty', departmentId: 'ece' }]);
    if (url === '/api/auth/login') return json({ token: 'tok', profile: { user: { id: 'stu-asha', name: 'Asha Nair', role: 'student', departmentId: 'ece', trainings: [] }, projects: [], usage: { hours: 2, cap: 12 } } });
    if (url === '/api/me') return json({ user: { id: 'stu-asha', name: 'Asha Nair', role: 'student', departmentId: 'ece', trainings: [] }, projects: [], usage: { hours: 2, cap: 12 } });
    if (url === '/api/meta') return json({ departments: [{ id: 'ece', name: 'ECE' }], categories: ['oscilloscope'] });
    if (url.startsWith('/api/equipment')) return json([EQUIPMENT]);
    if (url === '/api/discover') {
      const { query } = JSON.parse(String(init?.body));
      return json({ source: 'gemini', matches: [{ equipmentId: 'osc-1', reason: `Fits "${query}"`, equipment: EQUIPMENT }] });
    }
    return json({ error: { code: 'NOT_FOUND', message: 'nope' } }, 404);
  });
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => vi.unstubAllGlobals());

describe('shared UI components', () => {
  it('announces errors assertively and other messages politely', () => {
    render(
      <>
        <Status kind="error">Broken</Status>
        <Status kind="success">Saved</Status>
      </>,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Broken');
    expect(screen.getByRole('status')).toHaveTextContent('Saved');
  });

  it('labels every score factor with text, not colour alone', () => {
    render(<ScoreBreakdownView score={{ urgency: 0.5, fairness: 1, fit: 0.4, waiting: 0, total: 0.6 }} />);
    expect(screen.getByRole('meter', { name: 'Deadline urgency (40%)' })).toBeInTheDocument();
    expect(screen.getByText('50%')).toBeInTheDocument();
  });

  it('lets users pick an alternative by keyboard', async () => {
    const onPick = vi.fn();
    render(<Alternatives items={[{ equipmentId: 'osc-2', equipmentName: 'Scope B', start: '2026-11-24T04:30:00Z', end: '2026-11-24T05:30:00Z', kind: 'equivalent-equipment', label: 'Tue 10:00' }]} onPick={onPick} />);
    await userEvent.tab();
    await userEvent.keyboard('{Enter}');
    expect(onPick).toHaveBeenCalledWith(expect.objectContaining({ equipmentId: 'osc-2' }));
  });
});

describe('ThemeToggle', () => {
  it('switches theme, persists the choice and updates its accessible name', async () => {
    document.documentElement.dataset.theme = 'light';
    render(<ThemeToggle />);
    await userEvent.click(screen.getByRole('button', { name: 'Switch to dark mode' }));
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(localStorage.getItem('lablink.theme')).toBe('dark');
    expect(screen.getByRole('button', { name: 'Switch to light mode' })).toBeInTheDocument();
  });
});

describe('App (no login wall)', () => {
  it('opens straight into the app as the default persona', async () => {
    const { container } = render(<App />);
    expect(await screen.findByRole('heading', { name: 'Find lab equipment' })).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith('/api/auth/login', expect.objectContaining({ method: 'POST' }));
    expect(sessionStorage.getItem('lablink.token')).toBe('tok');
    expect(screen.getByRole('navigation', { name: 'Main' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Skip to main content' })).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});

describe('PersonaSwitcher', () => {
  it('groups personas by role and switches on change', async () => {
    const onSwitch = vi.fn();
    render(
      <PersonaSwitcher
        users={[
          { id: 'stu-asha', name: 'Asha Nair', role: 'student', departmentId: 'ece' },
          { id: 'fac-iyer', name: 'Dr. Iyer', role: 'faculty', departmentId: 'ece' },
        ]}
        currentId="stu-asha"
        busy={false}
        onSwitch={onSwitch}
      />,
    );
    const select = screen.getByLabelText('Viewing as');
    expect(screen.getByRole('group', { name: 'Faculty' })).toBeInTheDocument();
    await userEvent.selectOptions(select, 'fac-iyer');
    expect(onSwitch).toHaveBeenCalledWith('fac-iyer');
  });
});

describe('DiscoverPage', () => {
  it('shows labelled filters, catalogue results and AI recommendations', async () => {
    const onOpen = vi.fn();
    const { container } = render(<DiscoverPage onOpen={onOpen} />);
    expect(await screen.findByRole('heading', { name: 'Keysight Oscilloscope' })).toBeInTheDocument();
    expect(screen.getByLabelText('Department')).toBeInTheDocument();
    expect(screen.getByText('High demand · fair queue')).toBeInTheDocument();
    await expectNoA11yViolations(container);

    await userEvent.type(screen.getByLabelText('What are you trying to build or measure?'), 'debug I2C signals');
    await userEvent.click(screen.getByRole('button', { name: 'Recommend equipment' }));
    expect(await screen.findByText(/Fits "debug I2C signals"/)).toBeInTheDocument();
    expect(screen.getByText('Gemini')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'View & book Keysight Oscilloscope' }));
    expect(onOpen).toHaveBeenCalledWith('osc-1');
  });

  it('validates the need before calling the AI', async () => {
    render(<DiscoverPage onOpen={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Recommend equipment' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Describe what you need');
    expect(fetchMock).not.toHaveBeenCalledWith('/api/discover', expect.anything());
  });
});
