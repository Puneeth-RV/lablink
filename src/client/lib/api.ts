import type {
  AccessRequest,
  AiReview,
  Alternative,
  Booking,
  Department,
  Equipment,
  Project,
  ScoreBreakdown,
  SlotRequest,
  User,
} from '../../server/domain/types';

export type {
  AccessRequest,
  AiReview,
  Alternative,
  Booking,
  Department,
  Equipment,
  Project,
  ScoreBreakdown,
  SlotRequest,
  User,
};

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?:
      { violations?: string[]; alternatives?: NamedAlternative[] } | { field: string; message: string }[],
  ) {
    super(message);
  }
}

const TOKEN_KEY = 'lablink.token';

/** Session token lives in sessionStorage: cleared when the tab closes, never sent to third parties. */
export const session = {
  get: () => sessionStorage.getItem(TOKEN_KEY),
  set: (token: string) => sessionStorage.setItem(TOKEN_KEY, token),
  clear: () => sessionStorage.removeItem(TOKEN_KEY),
};

export async function api<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const token = session.get();
  const res = await fetch(`/api${path}`, {
    method: init.method ?? 'GET',
    headers: {
      ...(init.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  const data = res.status === 204 ? undefined : await res.json().catch(() => undefined);
  if (!res.ok) {
    const err = data?.error ?? {};
    throw new ApiError(res.status, err.code ?? 'ERROR', err.message ?? 'Request failed', err.details);
  }
  return data as T;
}

// ---- response shapes -------------------------------------------------------------

export interface DemoUser {
  id: string;
  name: string;
  role: User['role'];
  departmentId: string;
}

export interface Profile {
  user: User;
  projects: Project[];
  usage: { hours: number; cap: number };
}

export interface Meta {
  departments: Department[];
  categories: string[];
}

export interface Slot {
  start: string;
  end: string;
  status: 'free' | 'booked' | 'past' | 'unavailable';
  requested: number;
}

export interface DiscoverResponse {
  source: 'gemini' | 'rules';
  matches: { equipmentId: string; reason: string; equipment: Equipment }[];
}

export type NamedAlternative = Alternative & { equipmentName?: string; label?: string };

export type BookingResult = { kind: 'booked'; booking: Booking } | { kind: 'queued'; request: SlotRequest };

export interface Activity {
  bookings: (Booking & {
    equipmentName: string;
    projectTitle: string;
    label: string;
    upcoming: boolean;
    canCheckIn: boolean;
  })[];
  slotRequests: (SlotRequest & {
    equipmentName: string;
    projectTitle: string;
    label: string;
    alternatives: NamedAlternative[];
  })[];
  accessRequests: (AccessRequest & { equipmentName: string; projectTitle: string })[];
}

export type PendingApproval = AccessRequest & {
  studentName: string;
  equipmentName: string;
  projectTitle: string;
  deadline: string;
};

export interface ConflictEntry {
  requestId: string;
  studentName: string;
  projectTitle: string;
  deadline: string;
  label: string;
  score?: ScoreBreakdown;
  decision: 'allocated' | 'declined';
  violations: string[];
  alternatives: NamedAlternative[];
}

export interface ConflictGroup {
  id: string;
  equipmentId: string;
  equipmentName: string;
  label: string;
  ranking: ConflictEntry[];
  explanation?: string;
  explanationSource?: 'gemini' | 'rules';
}

export interface UtilisationReport {
  equipment: {
    equipmentId: string;
    name: string;
    category: string;
    departmentId: string;
    bookedHours: number;
    capacityHours: number;
    rate: number;
  }[];
  departments: { departmentId: string; name: string; rate: number }[];
  peakHours: { hour: number; bookedHours: number }[];
  suggestions: string[];
}

export interface PlanResponse {
  source: 'gemini' | 'rules';
  project: { id: string; title: string; deadline: string };
  items: {
    category: string;
    hours: number;
    reason: string;
    equipmentId?: string;
    equipmentName?: string;
    highDemand: boolean;
    start?: string;
    end?: string;
    label?: string;
    issues: string[];
  }[];
}

export interface OpenFault {
  id: string;
  equipmentId: string;
  equipmentName: string;
  equipmentStatus: 'available' | 'maintenance';
  reporterName: string;
  description: string;
  createdAt: string;
}
