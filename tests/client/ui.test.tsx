// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Alternatives, ScoreBreakdownView, Status } from '../../src/client/components/ui';
import { DiscoverPage } from '../../src/client/pages/DiscoverPage';
import { LoginPage } from '../../src/client/pages/LoginPage';

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
    if (url === '/api/auth/login') return json({ token: 'tok', user: { id: 'stu-asha' } });
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

describe('LoginPage', () => {
  it('signs in with a keyboard-selectable persona and has no a11y violations', async () => {
    const onSignedIn = vi.fn();
    const { container } = render(<LoginPage onSignedIn={onSignedIn} />);
    const asha = await screen.findByRole('radio', { name: /Asha Nair/ });
    await expectNoA11yViolations(container);
    await userEvent.click(asha);
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    await waitFor(() => expect(onSignedIn).toHaveBeenCalled());
    expect(sessionStorage.getItem('lablink.token')).toBe('tok');
  });

  it('explains when no persona is chosen', async () => {
    render(<LoginPage onSignedIn={vi.fn()} />);
    await screen.findByRole('radio', { name: /Asha Nair/ });
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Choose an account');
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
    expect(screen.getByText('✦ Gemini')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'View availability and book Keysight Oscilloscope' }));
    expect(onOpen).toHaveBeenCalledWith('osc-1');
  });

  it('validates the need before calling the AI', async () => {
    render(<DiscoverPage onOpen={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Recommend equipment' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Describe what you need');
    expect(fetchMock).not.toHaveBeenCalledWith('/api/discover', expect.anything());
  });
});
