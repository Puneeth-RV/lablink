import type { AiReview, Equipment, PlanNeed } from '../../domain/types.js';

/** A single structured-output call to an LLM; injected so tests never hit the network. */
export type GenerateJson = (args: {
  system: string;
  prompt: string;
  schema: object;
  signal: AbortSignal;
}) => Promise<string>;

export interface EquipmentMatch {
  equipmentId: string;
  reason: string;
}

export interface DiscoveryResult {
  matches: EquipmentMatch[];
  source: 'gemini' | 'rules';
}

export interface AllocationSummaryInput {
  equipmentName: string;
  slotLabel: string;
  entries: {
    studentName: string;
    projectTitle: string;
    decision: 'allocated' | 'declined';
    score?: { urgency: number; fairness: number; fit: number; waiting: number; total: number };
    violations: string[];
    alternativeCount: number;
  }[];
}

export interface AccessReviewInput {
  equipment: Equipment;
  projectTitle: string;
  projectDescription: string;
  daysToDeadline: number;
  justification: string;
  hasTraining: boolean;
}

export interface PlanNeedsInput {
  projectTitle: string;
  description: string;
  /** Categories that exist on campus; the model may only choose from these. */
  categories: string[];
  essentialCategories: string[];
}

export interface ProjectDraftInput {
  description: string;
  /** Today's campus date (YYYY-MM-DD), so relative dates like "next Friday" resolve correctly. */
  today: string;
  categories: string[];
}

export interface ProjectDraft {
  title: string;
  /** YYYY-MM-DD, or null when no deadline could be found. */
  deadline: string | null;
  essentialCategories: string[];
}

export interface AiAssistant {
  discover(query: string, catalog: Equipment[]): Promise<DiscoveryResult>;
  explainAllocation(input: AllocationSummaryInput): Promise<{ text: string; source: 'gemini' | 'rules' }>;
  reviewAccessRequest(input: AccessReviewInput): Promise<AiReview>;
  planNeeds(input: PlanNeedsInput): Promise<{ needs: PlanNeed[]; source: 'gemini' | 'rules' }>;
  draftProject(input: ProjectDraftInput): Promise<ProjectDraft & { source: 'gemini' | 'rules' }>;
}
