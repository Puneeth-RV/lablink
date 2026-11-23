import { campusTime, DAY_MS, HOUR_MS, toIso } from '../../src/server/domain/time.js';
import type { Booking, Equipment, Project, SlotRequest, User } from '../../src/server/domain/types.js';

/** 08:00 IST on Monday 23 Nov 2026. */
export const NOW = Date.parse('2026-11-23T02:30:00Z');

/** ISO slot `hours` long starting at `hour`:00 IST, `day` days after NOW. */
export function slot(day: number, hour: number, hours = 1) {
  const start = campusTime(NOW, day, hour);
  return { start: toIso(start), end: toIso(start + hours * HOUR_MS) };
}

export const equipment = (overrides: Partial<Equipment> = {}): Equipment => ({
  id: 'osc-1',
  name: 'Oscilloscope A',
  category: 'oscilloscope',
  departmentId: 'ece',
  location: 'ECE Lab 1',
  description: 'Digital storage oscilloscope',
  capabilities: ['signal analysis'],
  requiresApproval: false,
  status: 'available',
  maxSlotHours: 3,
  highDemand: true,
  ...overrides,
});

export const user = (overrides: Partial<User> = {}): User => ({
  id: 'stu-1',
  name: 'Asha',
  role: 'student',
  departmentId: 'ece',
  trainings: [],
  ...overrides,
});

export const project = (overrides: Partial<Project> = {}): Project => ({
  id: 'proj-1',
  title: 'IoT sensor',
  description: 'Sensor node',
  ownerId: 'stu-1',
  supervisorId: 'fac-1',
  deadline: toIso(NOW + 10 * DAY_MS),
  essentialCategories: ['oscilloscope'],
  ...overrides,
});

export const booking = (overrides: Partial<Booking> = {}): Booking => ({
  id: 'b-1',
  equipmentId: 'osc-1',
  userId: 'stu-9',
  projectId: 'proj-9',
  ...slot(1, 10),
  status: 'confirmed',
  createdAt: toIso(NOW - DAY_MS),
  ...overrides,
});

export const slotRequest = (overrides: Partial<SlotRequest> = {}): SlotRequest => ({
  id: 'r-1',
  equipmentId: 'osc-1',
  userId: 'stu-1',
  projectId: 'proj-1',
  ...slot(1, 10),
  status: 'pending',
  createdAt: toIso(NOW - HOUR_MS),
  ...overrides,
});
