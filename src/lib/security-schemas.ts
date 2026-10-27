import { z } from 'zod';

export const businessInput = z.object({ businessId: z.string().uuid() });
export const findingInput = businessInput.extend({ title: z.string().trim().min(1).max(200), details: z.string().trim().min(1).max(12000) });
export const eventInput = findingInput.extend({ kind: z.enum(['report', 'disposition', 'approval']), relatedId: z.string().uuid().nullable(), decision: z.enum(['open', 'remediated', 'accepted_risk', 'false_positive', 'approved', 'rejected']).nullable() });
export const analysisInput = businessInput.extend({ findingId: z.string().uuid() });
export const impactSchema = z.object({
  impact: z.string(),
  severity: z.enum(['critical', 'high', 'medium', 'low', 'informational']),
  assumptions: z.array(z.string()),
  steps: z.array(z.object({ priority: z.enum(['P0', 'P1', 'P2', 'P3']), action: z.string(), rationale: z.string(), verification: z.string() }).strict()),
}).strict();
export type ImpactSummary = z.infer<typeof impactSchema>;

export function isAdministrator(role: string, status: string) {
  return status === 'active' && (role === 'owner' || role === 'admin');
}