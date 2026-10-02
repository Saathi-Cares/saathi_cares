/** Field names whose values are never logged. Matched after `normaliseKey`, so `medicalHistory` and `Set-Cookie` count. */
export const REDACTED_KEYS: readonly string[] = [
  // credentials
  'password',
  'password_hash',
  'mfa_secret',
  'mfa_secret_enc',
  'token',
  'access_token',
  'refresh_token',
  'api_key',
  'secret',
  'authorization',
  'cookie',
  'set_cookie',
  // tier 2 identifiers (PLAN.md §8.9)
  'phone',
  'phone_number',
  'alt_phone',
  'mobile',
  'email',
  'email_address',
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
];

/** Case and separators are ignored: `medical_history`, `medicalHistory` and `Medical-History` are one key. */
export function normaliseKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, '');
}

const NORMALISED_KEYS: ReadonlySet<string> = new Set(REDACTED_KEYS.map(normaliseKey));

export function isRedactedKey(key: string): boolean {
  return NORMALISED_KEYS.has(normaliseKey(key));
}

const CENSOR = '[redacted]';
// why: bounds recursion so a deeply nested payload cannot blow the stack or bloat a log line.
const MAX_DEPTH = 32;
// why: shared substructures are re-walked at each occurrence, so without a budget a shared graph is exponential (logging-path DoS).
export const MAX_NODES = 20_000;

type Budget = { nodes: number };

export function redactDeep<T>(value: T): T {
  return walk(value, new Set(), { nodes: 0 }, 0) as T;
}

/** `ancestors` holds only the objects on the current path, so shared (non-cyclic) references are walked in full. */
function walk(value: unknown, ancestors: Set<object>, budget: Budget, depth: number): unknown {
  if (value === null || typeof value !== 'object') return value;
  if (value instanceof Date) return value;
  if (value instanceof Uint8Array) return `[binary ${value.byteLength} bytes]`;
  if (depth > MAX_DEPTH) return '[depth limit]';
  if (budget.nodes >= MAX_NODES) return '[truncated]';
  budget.nodes += 1;
  if (ancestors.has(value)) return '[circular]';
  ancestors.add(value);
  const next = (v: unknown): unknown => walk(v, ancestors, budget, depth + 1);
  try {
    if (value instanceof Error) return serialiseError(value, next);
    if (Array.isArray(value)) return value.map(next);
    if (value instanceof Set) return Array.from(value).map(next);
    const entries = value instanceof Map ? Object.entries(Object.fromEntries(value)) : Object.entries(value);
    const out: Record<string, unknown> = {};
    for (const [key, v] of entries) {
      out[key] = isRedactedKey(key) ? CENSOR : next(v);
    }
    return out;
  } finally {
    ancestors.delete(value);
  }
}

/** `{ type, name, message, stack }` plus the error's own enumerable properties (e.g. a pg `code`), redacted like any object. */
function serialiseError(error: Error, next: (v: unknown) => unknown): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, v] of Object.entries(error)) {
    out[key] = isRedactedKey(key) ? CENSOR : next(v);
  }
  out.type = error.name;
  out.name = error.name;
  out.message = error.message;
  out.stack = error.stack;
  if (error.cause !== undefined) out.cause = next(error.cause);
  return out;
}
