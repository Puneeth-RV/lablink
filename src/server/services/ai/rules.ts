import type { AiReview } from '../../domain/types.js';
import { parseDeadline, tokens } from './text.js';
import type {
  AccessReviewInput,
  AiAssistant,
  AllocationSummaryInput,
  DiscoveryResult,
  PlanNeedsInput,
  ProjectDraft,
  ProjectDraftInput,
} from './types.js';
import type { Equipment, PlanNeed } from '../../domain/types.js';

/** Deterministic fallback: keeps every AI feature working without the LLM. */
export class RulesAssistant implements AiAssistant {
  async discover(query: string, catalog: Equipment[]): Promise<DiscoveryResult> {
    const wanted = tokens(query);
    const matches = catalog
      .map((e) => {
        const haystack = tokens([e.name, e.category, e.description, ...e.capabilities].join(' '));
        const hits = wanted.filter((w) => haystack.some((h) => h.startsWith(w) || w.startsWith(h)));
        return { e, hits: [...new Set(hits)] };
      })
      .filter((m) => m.hits.length > 0)
      .sort((a, b) => b.hits.length - a.hits.length || a.e.name.localeCompare(b.e.name))
      .slice(0, 5)
      .map(({ e, hits }) => ({ equipmentId: e.id, reason: `Matches: ${hits.join(', ')}.` }));
    return { matches, source: 'rules' };
  }

  async explainAllocation(input: AllocationSummaryInput): Promise<{ text: string; source: 'rules' }> {
    const winner = input.entries.find((e) => e.decision === 'allocated');
    const parts = [
      winner
        ? `${winner.studentName} received ${input.equipmentName} (${input.slotLabel}) with the highest priority score of ${winner.score?.total ?? 0}, driven by deadline urgency ${winner.score?.urgency ?? 0} and fairness ${winner.score?.fairness ?? 0}.`
        : `No request could be granted for ${input.equipmentName} (${input.slotLabel}).`,
    ];
    for (const e of input.entries.filter((x) => x.decision === 'declined')) {
      parts.push(
        e.violations.length
          ? `${e.studentName}'s request was not feasible (${e.violations.join(' ')}).`
          : `${e.studentName} was offered ${e.alternativeCount} alternative slot(s).`,
      );
    }
    return { text: parts.join(' '), source: 'rules' };
  }

  async reviewAccessRequest(input: AccessReviewInput): Promise<AiReview> {
    const riskFlags: string[] = [];
    if (!input.hasTraining && input.equipment.requiredTraining)
      riskFlags.push(`Student lacks ${input.equipment.requiredTraining} training.`);
    if (input.daysToDeadline < 3) riskFlags.push('Project deadline is less than 3 days away.');
    if (tokens(input.justification).length < 8)
      riskFlags.push('Justification is brief — consider asking for more detail.');
    if (input.equipment.highDemand)
      riskFlags.push('High-demand equipment — slots are allocated through the fair queue.');
    return {
      summary: `Request to use ${input.equipment.name} for "${input.projectTitle}" (deadline in ${Math.max(0, Math.round(input.daysToDeadline))} days).`,
      riskFlags,
      source: 'rules',
    };
  }

  async draftProject(input: ProjectDraftInput): Promise<ProjectDraft & { source: 'rules' }> {
    const text = input.description.toLowerCase();
    const words = tokens(input.description);
    const essentialCategories = input.categories.filter((c) =>
      c
        .split('-')
        .some((part) => part.length > 2 && words.some((w) => w.startsWith(part) || part.startsWith(w))),
    );
    return {
      title:
        input.description
          .split(/[.,;\n]/)[0]!
          .trim()
          .slice(0, 60) || 'Untitled project',
      deadline: parseDeadline(text, input.today),
      essentialCategories,
      source: 'rules',
    };
  }

  async planNeeds(input: PlanNeedsInput): Promise<{ needs: PlanNeed[]; source: 'rules' }> {
    return {
      needs: input.essentialCategories
        .filter((c) => input.categories.includes(c))
        .map((category) => ({
          category,
          hours: 2,
          reason: `Listed as essential for "${input.projectTitle}".`,
        })),
      source: 'rules',
    };
  }
}
