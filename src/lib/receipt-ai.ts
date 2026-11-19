import { hasAnyDetail, normalizeExtraction, receiptCategories, type Extraction } from './receipt-schemas';

// Receipt extraction is an optional assistant: every suggestion is reviewed by a person before posting.
export const RECEIPT_MODEL = 'gemini-2.5-flash';
export type GenerateReceipt = (request: {
  file: { bytes: Uint8Array; mime: string; name: string };
  prompt: string;
}) => Promise<string>;
export type ReadResult = { extraction: Extraction | null; error: string | null; model: string };

const categoryHelp = receiptCategories.map(c => `${c.id} (${c.label})`).join(', ');
const prompt = `You are reading one business receipt or invoice from Nepal for an accountant. Return only a JSON object with these fields:
- supplier: the seller's name.
- invoiceNumber: the bill or invoice number printed on it.
- date: the bill date as YYYY-MM-DD. If it is a Bikram Sambat date (year 2060 or later), return it exactly as shown in that format.
- total: the final amount payable, digits only (no currency sign or commas).
- vat: the VAT amount if it is shown separately, otherwise null.
- category: the best match from: ${categoryHelp}. Use null if unsure.
- categoryReason: one short sentence on why.
Use null for anything you cannot read. Never guess numbers. Do not include markdown fences.`;

export function describeAiError(error: unknown): string {
  const value = error as { name?: string; statusCode?: number; constructor?: { name?: string } } | null;
  const name = value?.name ?? value?.constructor?.name ?? '';
  const status = value?.statusCode;
  if (name === 'PaymentRequiredError' || status === 402) return 'AI billing or quota is unavailable. Fill in the details yourself or check the AI account.';
  if (name === 'RateLimitError' || status === 429) return 'The AI service is busy right now. Fill in the details yourself or try again in a minute.';
  if (['ConfigurationError', 'AuthenticationError', 'PermissionDeniedError'].includes(name) || status === 401 || status === 403) return 'AI scanning is not configured for this project. Fill in the details yourself.';
  if (name === 'TimeoutError' || name === 'NetworkError') return 'The AI service did not answer in time. Fill in the details yourself or try again.';
  return 'The AI could not read this file. Fill in the details yourself.';
}

export async function readReceipt(
  file: { bytes: Uint8Array; mime: string; name: string },
  generate: GenerateReceipt,
): Promise<ReadResult> {
  try {
    const content = await generate({ file, prompt });
    const raw = content.replace(/^```(?:json)?\s*|\s*```$/g, '');
    const extraction = normalizeExtraction(JSON.parse(raw));
    if (!hasAnyDetail(extraction)) return { extraction: null, error: 'No details could be found on this file. Fill them in yourself.', model: RECEIPT_MODEL };
    return { extraction, error: null, model: RECEIPT_MODEL };
  } catch (error) {
    return { extraction: null, error: error instanceof SyntaxError ? 'The AI answer could not be understood. Fill in the details yourself.' : describeAiError(error), model: RECEIPT_MODEL };
  }
}
