export const REDACTED_KEYS: ReadonlySet<string> = new Set([
  // credentials
  'password',
  'password_hash',
  'mfa_secret',
  'mfa_secret_enc',
  'token',
  'secret',
  'authorization',
  'cookie',
  // tier 2 identifiers (PLAN.md §8.9)
  'phone',
  'alt_phone',
  'email',
  'address',
  'address_line',
  'guardian_name',
  'dob',
  'pan',
  'pan_enc',
  'value_enc',
  'identifiers',
  // tier 3 clinical
  'medical_history',
  'dental_history',
  'vitals',
  'chief_complaint',
  'presenting_symptoms',
  'volunteer_notes',
  'checklist',
  'result',
  'clinical_findings',
  'soft_tissue_findings',
  'diagnosis_summary',
  'medications',
  'general_instructions',
  'follow_up_instructions',
  'content_summary',
  'notes',
  'baseline',
  'content',
]);

const CENSOR = '[redacted]';

export function redactDeep<T>(value: T): T {
  return walk(value, new WeakSet()) as T;
}

function walk(value: unknown, seen: WeakSet<object>): unknown {
  if (value === null || typeof value !== 'object') return value;
  if (seen.has(value)) return '[circular]';
  seen.add(value);
  if (Array.isArray(value)) return value.map((v) => walk(v, seen));
  if (value instanceof Error) return { name: value.name, message: value.message, stack: value.stack };
  const out: Record<string, unknown> = {};
  for (const [key, v] of Object.entries(value)) {
    out[key] = REDACTED_KEYS.has(key.toLowerCase()) ? CENSOR : walk(v, seen);
  }
  return out;
}
