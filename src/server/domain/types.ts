/** Core domain types for LabLink. Timestamps are ISO-8601 strings at the edges, epoch ms internally. */

export type Role = 'student' | 'faculty';

export interface Department {
  id: string;
  name: string;
}

export interface User {
  id: string;
  name: string;
  role: Role;
  departmentId: string;
  /** Safety trainings the user has completed, e.g. "laser-safety". */
  trainings: string[];
}

export type EquipmentStatus = 'available' | 'maintenance';

export interface Equipment {
  id: string;
  name: string;
  category: string;
  departmentId: string;
  location: string;
  description: string;
  capabilities: string[];
  /** Faculty must approve a project-based access request before booking. */
  requiresApproval: boolean;
  /** Safety training needed to operate the equipment, if any. */
  requiredTraining?: string;
  status: EquipmentStatus;
  maxSlotHours: number;
  /**
   * High-demand equipment is allocated fairly through a request queue instead of
   * first-come-first-served instant booking.
   */
  highDemand: boolean;
}

export interface Project {
  id: string;
  title: string;
  description: string;
  ownerId: string;
  supervisorId: string;
  /** ISO date-time of the project deadline. */
  deadline: string;
  /** Equipment categories the project cannot be completed without. */
  essentialCategories: string[];
}

export interface Interval {
  /** epoch ms, inclusive */
  start: number;
  /** epoch ms, exclusive */
  end: number;
}

/** `no-show`: not checked in within the grace period, so the slot was released to others. */
export type BookingStatus = 'confirmed' | 'cancelled' | 'no-show';

export interface Booking {
  id: string;
  equipmentId: string;
  userId: string;
  projectId: string;
  start: string;
  end: string;
  status: BookingStatus;
  createdAt: string;
  checkedInAt?: string;
}

export type SlotRequestStatus = 'pending' | 'allocated' | 'declined';

/** A request for a contested slot on high-demand equipment, resolved by the allocation engine. */
export interface SlotRequest {
  id: string;
  equipmentId: string;
  userId: string;
  projectId: string;
  start: string;
  end: string;
  status: SlotRequestStatus;
  createdAt: string;
  outcome?: AllocationOutcome;
}

export type AccessRequestStatus = 'pending' | 'approved' | 'rejected';

export interface AiReview {
  summary: string;
  riskFlags: string[];
  source: 'gemini' | 'rules';
}

export interface AccessRequest {
  id: string;
  equipmentId: string;
  userId: string;
  projectId: string;
  justification: string;
  status: AccessRequestStatus;
  createdAt: string;
  decidedBy?: string;
  decisionNote?: string;
  aiReview?: AiReview;
}

export interface ScoreBreakdown {
  urgency: number;
  fairness: number;
  fit: number;
  waiting: number;
  total: number;
}

export interface Alternative {
  equipmentId: string;
  start: string;
  end: string;
  kind: 'same-equipment-later' | 'equivalent-equipment';
}

export interface AllocationOutcome {
  decision: 'allocated' | 'declined';
  score?: ScoreBreakdown;
  /** Hard-rule violations that made the request infeasible. */
  violations: string[];
  alternatives: Alternative[];
  explanation?: string;
}

export type FaultStatus = 'open' | 'resolved';

export interface FaultReport {
  id: string;
  equipmentId: string;
  reportedBy: string;
  description: string;
  status: FaultStatus;
  createdAt: string;
  resolvedBy?: string;
}

/** One equipment need inferred from a project description. */
export interface PlanNeed {
  category: string;
  hours: number;
  reason: string;
}

export interface PlanItem extends PlanNeed {
  equipmentId?: string;
  start?: string;
  end?: string;
  /** Human-readable reasons this need could not be scheduled automatically. */
  issues: string[];
}
