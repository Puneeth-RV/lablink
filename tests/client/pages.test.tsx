// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ActivityPage } from '../../src/client/pages/ActivityPage';
import ApprovalsPage from '../../src/client/pages/ApprovalsPage';
import ConflictsPage from '../../src/client/pages/ConflictsPage';
import { EquipmentPage } from '../../src/client/pages/EquipmentPage';
import FaultsPage from '../../src/client/pages/FaultsPage';
import InsightsPage from '../../src/client/pages/InsightsPage';
import PlannerPage from '../../src/client/pages/PlannerPage';
import type { Profile } from '../../src/client/lib/api';

async function expectNoA11yViolations(container: HTMLElement) {
  const results = await axe.run(container, { rules: { 'color-contrast': { enabled: false } } });
  expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
}

const json = (body: unknown, status = 200) =>
  Promise.resolve(
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }),
  );
const FUTURE = new Date(Date.now() + 2 * 86_400_000).toISOString();
const LATER = new Date(Date.now() + 2 * 86_400_000 + 3_600_000).toISOString();
const DEADLINE = new Date(Date.now() + 10 * 86_400_000).toISOString();

const profile: Profile = {
  user: { id: 'stu-asha', name: 'Asha Nair', role: 'student', departmentId: 'ece', trainings: [] },
  projects: [
    {
      id: 'p1',
      title: 'IoT Node',
      description: 'd',
      ownerId: 'stu-asha',
      supervisorId: 'fac-iyer',
      deadline: DEADLINE,
      essentialCategories: ['oscilloscope'],
    },
  ],
  usage: { hours: 2, cap: 12 },
};

const equipment = {
  id: 'ece-osc-1',
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

type Route = (url: string, init?: RequestInit) => Promise<Response> | undefined;
let routes: Route;
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn(
    (url: string, init?: RequestInit) =>
      routes(url, init) ?? json({ error: { code: 'NOT_FOUND', message: 'nope' } }, 404),
  );
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe('ActivityPage', () => {
  it('summarises statuses, offers check-in and cancels a booking', async () => {
    routes = (url, init) => {
      if (url === '/api/activity') {
        return json({
          bookings: [
            {
              id: 'b1',
              equipmentId: 'ece-osc-2',
              userId: 'stu-asha',
              projectId: 'p1',
              start: FUTURE,
              end: LATER,
              status: 'confirmed',
              createdAt: FUTURE,
              equipmentName: 'Rigol Scope',
              projectTitle: 'IoT Node',
              label: 'Wed 10:00',
              upcoming: true,
              canCheckIn: true,
            },
          ],
          slotRequests: [
            {
              id: 'r1',
              equipmentId: 'ece-osc-1',
              userId: 'stu-asha',
              projectId: 'p1',
              start: FUTURE,
              end: LATER,
              status: 'declined',
              createdAt: FUTURE,
              equipmentName: 'Keysight',
              projectTitle: 'IoT Node',
              label: 'Wed 10:00',
              alternatives: [
                {
                  equipmentId: 'ece-osc-2',
                  equipmentName: 'Rigol Scope',
                  start: FUTURE,
                  end: LATER,
                  kind: 'equivalent-equipment',
                  label: 'Wed 10:00',
                },
              ],
              outcome: {
                decision: 'declined',
                violations: [],
                alternatives: [],
                explanation: 'Meera had a closer deadline.',
              },
            },
          ],
          accessRequests: [
            {
              id: 'a1',
              equipmentId: 'ece-fpga-1',
              userId: 'stu-asha',
              projectId: 'p1',
              justification: 'x',
              status: 'pending',
              createdAt: FUTURE,
              equipmentName: 'Zynq',
              projectTitle: 'IoT Node',
              aiReview: { summary: 'Looks fine', riskFlags: [], source: 'gemini' },
            },
          ],
        });
      }
      if (url === '/api/bookings/b1/check-in' && init?.method === 'POST') return json({});
      if (url === '/api/bookings/b1' && init?.method === 'DELETE') return json({ status: 'cancelled' });
      return undefined;
    };
    const onChanged = vi.fn();
    const { container } = render(<ActivityPage onChanged={onChanged} />);
    const summary = await screen.findByRole('list', { name: 'Summary' });
    expect(within(summary).getByText('In fair queue')).toBeInTheDocument();
    expect(screen.getByText('Declined')).toBeInTheDocument();
    expect(screen.getByText('Meera had a closer deadline.')).toBeInTheDocument();
    expect(screen.getByText('Awaiting approval', { selector: '.badge' })).toBeInTheDocument();
    await expectNoA11yViolations(container);

    await userEvent.click(screen.getByRole('button', { name: 'Check in to Rigol Scope' }));
    expect(await screen.findByText(/Checked in to Rigol Scope/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Cancel Rigol Scope on Wed 10:00' }));
    expect(await screen.findByText(/Cancelled booking/)).toBeInTheDocument();
    expect(onChanged).toHaveBeenCalled();
  });
});

describe('EquipmentPage', () => {
  it('shows availability, explains infeasible bookings and reports faults', async () => {
    routes = (url, init) => {
      if (url === '/api/equipment/ece-osc-1') return json(equipment);
      if (url.startsWith('/api/equipment/ece-osc-1/availability'))
        return json({ slots: [{ start: FUTURE, end: LATER, status: 'booked', requested: 2 }] });
      if (url === '/api/activity') return json({ bookings: [], slotRequests: [], accessRequests: [] });
      if (url === '/api/bookings')
        return json(
          {
            error: {
              code: 'NOT_FOUND',
              message: 'This slot cannot be booked',
              details: { violations: ['Faculty approval is required for this equipment.'], alternatives: [] },
            },
          },
          422,
        );
      if (url === '/api/equipment/ece-osc-1/faults' && init?.method === 'POST')
        return json({ id: 'f1' }, 201);
      return undefined;
    };
    const { container } = render(
      <EquipmentPage id="ece-osc-1" profile={profile} onBack={vi.fn()} onOpen={vi.fn()} onBooked={vi.fn()} />,
    );
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Keysight Oscilloscope' }),
    ).toBeInTheDocument();
    expect(await screen.findByRole('table')).toHaveTextContent('Booked');
    await expectNoA11yViolations(container);

    await userEvent.click(screen.getByRole('button', { name: 'Join fair queue' }));
    expect(await screen.findByText('Faculty approval is required for this equipment.')).toBeInTheDocument();

    await userEvent.click(screen.getByText('Report a problem with this equipment'));
    await userEvent.type(screen.getByLabelText('What is wrong?'), 'Channel 2 shows no signal');
    await userEvent.click(screen.getByRole('button', { name: 'Send report' }));
    expect(await screen.findByText(/department has been notified/)).toBeInTheDocument();
  });
});

describe('PlannerPage', () => {
  it('creates a project from free text and books the proposed plan', async () => {
    routes = (url) => {
      if (url === '/api/projects')
        return json(
          {
            ...profile.projects[0],
            id: 'p2',
            title: 'Smart Wheelchair',
            essentialCategories: ['gpu-workstation'],
            source: 'gemini',
          },
          201,
        );
      if (url === '/api/plan') {
        return json({
          source: 'gemini',
          project: { id: 'p2', title: 'Smart Wheelchair', deadline: DEADLINE },
          items: [
            {
              category: 'gpu-workstation',
              hours: 4,
              reason: 'Train the model',
              equipmentId: 'cse-gpu-1',
              equipmentName: 'RTX Workstation',
              highDemand: false,
              start: FUTURE,
              end: LATER,
              label: 'Wed 10:00',
              issues: [],
            },
            {
              category: 'laser-cutter',
              hours: 1,
              reason: 'Cut panels',
              highDemand: false,
              issues: ['Laser Cutter: Required safety training has not been completed.'],
            },
          ],
        });
      }
      if (url === '/api/bookings')
        return json({ kind: 'booked', booking: { start: FUTURE, end: LATER } }, 201);
      return undefined;
    };
    const onBooked = vi.fn();
    const { container } = render(<PlannerPage profile={profile} onBooked={onBooked} />);
    await userEvent.click(screen.getByRole('radio', { name: 'Describe a new project' }));
    await userEvent.type(
      screen.getByLabelText('Describe your project'),
      'Smart wheelchair with obstacle detection, due next Friday',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Create project and plan' }));

    expect(await screen.findByText('Smart Wheelchair', { selector: 'strong' })).toBeInTheDocument();
    expect(screen.getByText('Train the model')).toBeInTheDocument();
    expect(screen.getByText(/Required safety training/)).toBeInTheDocument();
    await expectNoA11yViolations(container);

    await userEvent.click(screen.getByRole('button', { name: 'Book all 1 slot' }));
    expect(await screen.findByText(/Booked RTX Workstation/)).toBeInTheDocument();
    expect(onBooked).toHaveBeenCalled();
  });
});

describe('faculty pages', () => {
  it('approves an access request with its AI pre-review', async () => {
    routes = (url, init) => {
      if (url === '/api/approvals' && init?.method === 'GET') {
        return json([
          {
            id: 'a1',
            equipmentId: 'ece-fpga-1',
            userId: 'stu-asha',
            projectId: 'p1',
            justification: 'Benchmark Verilog',
            status: 'pending',
            createdAt: FUTURE,
            studentName: 'Asha Nair',
            equipmentName: 'Zynq Board',
            projectTitle: 'FPGA Filter',
            deadline: DEADLINE,
            aiReview: { summary: 'Well justified', riskFlags: ['High-demand equipment'], source: 'gemini' },
          },
        ]);
      }
      if (url === '/api/approvals/a1') return json({ status: 'approved' });
      return undefined;
    };
    const { container } = render(<ApprovalsPage />);
    expect(await screen.findByRole('list', { name: 'Risk flags' })).toHaveTextContent(
      'High-demand equipment',
    );
    expect(container).toHaveTextContent('Well justified');
    await expectNoA11yViolations(container);
    await userEvent.type(screen.getByLabelText('Note to student (optional)'), 'Go ahead');
    await userEvent.click(screen.getByRole('button', { name: 'Approve' }));
    expect(await screen.findByText(/Approved Asha Nair's request/)).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/approvals/a1',
      expect.objectContaining({ body: JSON.stringify({ decision: 'approved', note: 'Go ahead' }) }),
    );
  });

  it('shows the fair ranking and applies the allocation', async () => {
    const entry = (id: string, name: string, decision: 'allocated' | 'declined', total: number) => ({
      requestId: id,
      studentName: name,
      projectTitle: 'P',
      deadline: DEADLINE,
      label: 'Tue 10:00',
      decision,
      violations: [],
      alternatives: [],
      score: { urgency: 0.8, fairness: 1, fit: 1, waiting: 0.4, total },
    });
    routes = (url) => {
      if (url === '/api/conflicts')
        return json([
          {
            id: 'g1',
            equipmentId: 'ece-osc-1',
            equipmentName: 'Keysight',
            label: 'Tue 10:00–12:00',
            ranking: [entry('r1', 'Meera', 'allocated', 0.84), entry('r2', 'Asha', 'declined', 0.78)],
          },
        ]);
      if (url === '/api/conflicts/resolve')
        return json({
          id: 'g1',
          equipmentId: 'ece-osc-1',
          equipmentName: 'Keysight',
          label: 'Tue',
          ranking: [],
          explanation: 'Meera has the closest deadline.',
          explanationSource: 'gemini',
        });
      return undefined;
    };
    const { container } = render(<ConflictsPage />);
    expect(await screen.findByText('Proposed: allocate')).toBeInTheDocument();
    expect(screen.getAllByRole('meter', { name: 'Deadline urgency (40%)' })).toHaveLength(2);
    await expectNoA11yViolations(container);
    await userEvent.click(screen.getByRole('button', { name: 'Apply fair allocation' }));
    expect(await screen.findByText(/Meera has the closest deadline/)).toBeInTheDocument();
  });

  it('takes faulty equipment offline', async () => {
    routes = (url) => {
      if (url === '/api/faults')
        return json([
          {
            id: 'f1',
            equipmentId: 'ece-osc-2',
            equipmentName: 'Rigol Scope',
            equipmentStatus: 'available',
            reporterName: 'Asha',
            description: 'No signal on CH3',
            createdAt: FUTURE,
          },
        ]);
      if (url === '/api/faults/f1') return json({});
      return undefined;
    };
    const { container } = render(<FaultsPage />);
    expect(await screen.findByText('No signal on CH3')).toBeInTheDocument();
    await expectNoA11yViolations(container);
    await userEvent.click(screen.getByRole('button', { name: 'Take offline' }));
    expect(await screen.findByText(/now offline for maintenance/)).toBeInTheDocument();
  });

  it('renders utilisation tables and recommendations', async () => {
    routes = (url) =>
      url === '/api/analytics/utilisation'
        ? json({
            equipment: [
              {
                equipmentId: 'e1',
                name: 'Keysight',
                category: 'oscilloscope',
                departmentId: 'ece',
                bookedHours: 56,
                capacityHours: 63,
                rate: 0.89,
              },
            ],
            departments: [{ departmentId: 'ece', name: 'ECE', rate: 0.4 }],
            peakHours: [{ hour: 9, bookedHours: 8 }],
            suggestions: ['Keysight is 89% booked — redirect new requests.'],
          })
        : undefined;
    const { container } = render(<InsightsPage />);
    expect(await screen.findByText(/redirect new requests/)).toBeInTheDocument();
    expect(screen.getByRole('meter', { name: 'Keysight utilisation' })).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});

describe('example inputs', () => {
  it('fills the field with one click so users can try a feature without typing', async () => {
    const { Examples } = await import('../../src/client/components/Examples');
    const onPick = vi.fn();
    const { container } = render(
      <Examples label="Example needs" examples={['Debug I2C signals']} onPick={onPick} />,
    );
    expect(screen.getByRole('group', { name: 'Example needs' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Debug I2C signals' }));
    expect(onPick).toHaveBeenCalledWith('Debug I2C signals');
    await expectNoA11yViolations(container);
  });
});
