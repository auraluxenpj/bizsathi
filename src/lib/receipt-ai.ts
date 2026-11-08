import { hasAnyDetail, normalizeExtraction, receiptCategories, type Extraction } from './receipt-schemas';

// Reads one receipt with the AI gateway. The AI only ever suggests: its answer is validated, stored as received,
// and shown to a person who must confirm or change every field before anything is posted.

export const RECEIPT_MODEL = 'google/gemini-2.5-flash';
export type GenerateChat = (request: Record<string, unknown>) => Promise<unknown>;
export type ReadResult = { extraction: Extraction | null; error: string | null; model: string };

const categoryHelp = receiptCategories.map(c => `${c.id} (${c.label})`).join(', ');
const prompt = `You are reading one business receipt or invoice from Nepal for an accountant. Return only the JSON requested.
- supplier: the seller's name.
- invoiceNumber: the bill or invoice number printed on it.
- date: the bill date as YYYY-MM-DD. If it is a Bikram Sambat date (year 2060 or later), return it exactly as shown in that format.
- total: the final amount payable, digits only (no currency sign or commas).
- vat: the VAT amount if it is shown separately, otherwise null.
- category: the best match from: ${categoryHelp}. Use null if unsure.
- categoryReason: one short sentence on why.
Use null for anything you cannot read. Never guess numbers.`;

const jsonSchema = {
  type: 'json_schema',
  json_schema: {
    name: 'receipt', strict: true,
    schema: { type: 'object', additionalProperties: false, required: ['supplier', 'invoiceNumber', 'date', 'total', 'vat', 'category', 'categoryReason'], properties: {
      supplier: { type: ['string', 'null'] }, invoiceNumber: { type: ['string', 'null'] }, date: { type: ['string', 'null'] }, total: { type: ['string', 'null'] }, vat: { type: ['string', 'null'] },
      category: { type: ['string', 'null'], enum: [...receiptCategories.map(c => c.id), null] }, categoryReason: { type: ['string', 'null'] } } },
  },
} as const;

/** A short, plain-language reason for a failed read. */
export function describeAiError(error: unknown): string {
  const name = (error as { name?: string; constructor?: { name?: string } } | null)?.name ?? (error as { constructor?: { name?: string } } | null)?.constructor?.name ?? '';
  if (name === 'PaymentRequiredError') return 'AI credits are used up. Fill in the details yourself, or add credits and scan again.';
  if (name === 'RateLimitError') return 'The AI service is busy right now. Fill in the details yourself or try again in a minute.';
  if (name === 'ConfigurationError' || name === 'AuthenticationError' || name === 'PermissionDeniedError') return 'AI scanning is not set up for this project. Fill in the details yourself.';
  if (name === 'TimeoutError' || name === 'NetworkError') return 'The AI service did not answer in time. Fill in the details yourself or try again.';
  return 'The AI could not read this file. Fill in the details yourself.';
}

const toBase64 = (bytes: Uint8Array) => { let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); return btoa(s); };

export async function readReceipt(file: { bytes: Uint8Array; mime: string; name: string }, generate: GenerateChat): Promise<ReadResult> {
  const url = `data:${file.mime};base64,${toBase64(file.bytes)}`;
  const part = file.mime === 'application/pdf' ? { type: 'file', file: { filename: file.name, file_data: url } } : { type: 'image_url', image_url: { url } };
  try {
    const response = await generate({ model: RECEIPT_MODEL, temperature: 0, messages: [{ role: 'user', content: [{ type: 'text', text: prompt }, part] }], response_format: jsonSchema });
    const content = (response as { choices?: { message?: { content?: unknown } }[] })?.choices?.[0]?.message?.content;
    const raw = typeof content === 'string' ? content.replace(/^```(?:json)?\s*|\s*```$/g, '') : content;
    const extraction = normalizeExtraction(typeof raw === 'string' ? JSON.parse(raw) : raw);
    if (!hasAnyDetail(extraction)) return { extraction: null, error: 'No details could be found on this file. Fill them in yourself.', model: RECEIPT_MODEL };
    return { extraction, error: null, model: RECEIPT_MODEL };
  } catch (error) {
    return { extraction: null, error: error instanceof SyntaxError ? 'The AI answer could not be understood. Fill in the details yourself.' : describeAiError(error), model: RECEIPT_MODEL };
  }
}
