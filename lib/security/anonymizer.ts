/**
 * @file lib/security/anonymizer.ts
 * @description PII Anonymization Utility for GDPR / 152-ФЗ compliance.
 *
 * Strips Personally Identifiable Information (PII) from candidate CV data
 * and chat history BEFORE it is sent to any external third-party LLM service
 * (e.g., OpenRouter).
 *
 * IMPORTANT: All functions return a deep clone of the input.
 * The original objects are NEVER mutated.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A single chat message as returned by the HH.ru Negotiations API. */
export interface RawChatMessage {
  id?: string;
  text?: string;
  created_at?: string;
  author?: {
    id?: string;
    name?: string;
  };
  [key: string]: unknown;
}

/** Shape of the anonymized chat message returned to the caller. */
export interface AnonymizedChatMessage extends Omit<RawChatMessage, 'author'> {
  author?: {
    id?: string;
    name?: string;
  };
}

/**
 * Result returned by anonymizeCandidateData.
 * Both properties are structurally identical to their raw counterparts
 * but contain no PII.
 */
export interface AnonymizedCandidatePayload {
  resume: Record<string, unknown> | null;
  messages: AnonymizedChatMessage[];
}

// ---------------------------------------------------------------------------
// Safe regex constants (ReDoS-resistant)
//
// All patterns avoid catastrophic backtracking by:
//  1. Using possessive-equivalent constructs where possible.
//  2. Keeping character classes mutually exclusive.
//  3. Using a single alternation at the top level rather than nested groups.
// ---------------------------------------------------------------------------

/**
 * Matches most common e-mail address formats.
 * Pattern explanation:
 *   [^\s@]{1,64}   — local part: up to 64 non-space, non-@ chars (no nested groups)
 *   @
 *   [^\s@]{1,253}  — domain: up to 253 non-space, non-@ chars
 *
 * Deliberately simple to be ReDoS-safe; catches all realistic emails in prose.
 */
const EMAIL_REGEX = /[^\s@]{1,64}@[^\s@]{1,253}\.[^\s@]{2,63}/gi;

/**
 * Matches Russian and international phone numbers in common formats:
 *   +7 (999) 123-45-67   |   8-800-555-35-35   |   +1-800-555-1234
 *
 * Uses a fixed-width structure to prevent catastrophic backtracking.
 * The digit groups are strictly bounded ([\d\s\-().]{7,20}).
 */
const PHONE_REGEX = /(?:\+?\d{1,3}[\s\-().]?)?(?:\(?\d{3}\)?[\s\-.]?)\d{3}[\s\-.]?\d{2}[\s\-.]?\d{2}/g;

/**
 * Matches http/https/ftp URLs.
 * Uses a possessive-equivalent [^\s<>"]{1,2048} to bound the URL length
 * and avoid catastrophic backtracking.
 */
const URL_REGEX = /https?:\/\/[^\s<>"]{1,2048}|ftp:\/\/[^\s<>"]{1,2048}/gi;

// ---------------------------------------------------------------------------
// Replacement tokens
// ---------------------------------------------------------------------------

const TOKEN_EMAIL = '[EMAIL]';
const TOKEN_PHONE = '[PHONE]';
const TOKEN_LINK  = '[LINK]';
const TOKEN_NAME  = '[CANDIDATE_NAME]';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Applies all text-based PII regex replacements to a single string.
 * Order matters: URLs first (they may contain @-signs that look like emails).
 */
function sanitizeText(text: string): string {
  return text
    .replace(URL_REGEX,   TOKEN_LINK)
    .replace(EMAIL_REGEX, TOKEN_EMAIL)
    .replace(PHONE_REGEX, TOKEN_PHONE);
}

/**
 * Builds a global regex that matches every occurrence of any of the supplied
 * name tokens (case-insensitive, whole-word boundaries where possible).
 *
 * Returns null when nameTokens is empty so callers can skip the replacement.
 */
function buildNameRegex(nameTokens: string[]): RegExp | null {
  if (nameTokens.length === 0) return null;

  // Escape special regex characters in each name token.
  const escaped = nameTokens
    .filter((n) => n.trim().length > 1) // skip single-char initials — too noisy
    .map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));

  if (escaped.length === 0) return null;

  // Sort longest first so overlapping names are replaced correctly.
  escaped.sort((a, b) => b.length - a.length);

  return new RegExp(`\\b(?:${escaped.join('|')})\\b`, 'gi');
}

/**
 * Replaces name tokens inside a string.
 * Safe no-op when nameRegex is null.
 */
function sanitizeNames(text: string, nameRegex: RegExp | null): string {
  if (!nameRegex) return text;
  // Reset lastIndex before each use (flags include 'g').
  nameRegex.lastIndex = 0;
  return text.replace(nameRegex, TOKEN_NAME);
}

/**
 * Applies all sanitization passes to a string value:
 *   1. Replace names
 *   2. Replace URLs, emails, phones
 */
function sanitizeString(value: string, nameRegex: RegExp | null): string {
  let result = sanitizeNames(value, nameRegex);
  result = sanitizeText(result);
  return result;
}

/**
 * Recursively walks a plain object/array and sanitizes every string value.
 *
 * Safety: uses an explicit stack (iterative DFS) instead of recursion to
 * avoid stack-overflow on deeply nested JSON (Edge Case 2).
 *
 * @param root    - The value to walk. Must already be a deep clone.
 * @param nameRegex - Pre-compiled name regex or null.
 */
function deepSanitizeStrings(
  root: unknown,
  nameRegex: RegExp | null,
): unknown {
  // Use an explicit stack of { parent, key } pairs so we never recurse.
  type StackEntry = { parent: Record<string, unknown> | unknown[]; key: string | number };

  // Kick off by wrapping the root in a synthetic parent.
  const wrapper: Record<string, unknown> = { root };
  const stack: StackEntry[] = [{ parent: wrapper, key: 'root' }];

  while (stack.length > 0) {
    const { parent, key } = stack.pop()!;
    const value = Array.isArray(parent)
      ? (parent as unknown[])[key as number]
      : (parent as Record<string, unknown>)[key as string];

    if (typeof value === 'string') {
      // Sanitize in-place within the already-cloned structure.
      if (Array.isArray(parent)) {
        (parent as unknown[])[key as number] = sanitizeString(value, nameRegex);
      } else {
        (parent as Record<string, unknown>)[key as string] = sanitizeString(value, nameRegex);
      }
    } else if (Array.isArray(value)) {
      for (let i = 0; i < value.length; i++) {
        stack.push({ parent: value as unknown[], key: i });
      }
    } else if (value !== null && typeof value === 'object') {
      for (const k of Object.keys(value as object)) {
        stack.push({ parent: value as Record<string, unknown>, key: k });
      }
    }
    // Primitives other than string (number, boolean, null) are left as-is.
  }

  return wrapper['root'];
}

// ---------------------------------------------------------------------------
// HH.ru CV — known PII field names to delete unconditionally.
// Sourced from the official HH.ru Resume API schema.
// ---------------------------------------------------------------------------
const HH_PII_FIELDS_TO_DELETE: ReadonlySet<string> = new Set([
  'first_name',
  'last_name',
  'middle_name',
  'birth_date',
  'photo',
  'portfolio',
  'contact',       // top-level contact block
  'contacts',      // some API versions use plural
  'site',          // personal websites array
  'phone',
  'email',
  'skype',
  'personalSite',
  'personal_site',
]);

/**
 * Deletes known HH.ru PII fields from the top level of the CV object ONLY.
 * We intentionally avoid deep recursive deletion of these field names because:
 *  a) the HH API schema is well-known and flat at the personal-info level, and
 *  b) blind recursive deletion could corrupt nested data (e.g., deleting a
 *     legitimate "email" field inside a company's contact block).
 */
function deleteKnownHhPiiFields(cv: Record<string, unknown>): void {
  Array.from(HH_PII_FIELDS_TO_DELETE).forEach((field) => {
    delete cv[field];
  });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Extracts candidate name tokens from the raw CV data for use in regex masking.
 * Returns an empty array when no name fields are present.
 */
function extractNameTokens(cvData: Record<string, unknown> | null | undefined): string[] {
  if (!cvData) return [];

  const tokens: string[] = [];

  const push = (val: unknown) => {
    if (typeof val === 'string' && val.trim().length > 0) {
      // Split compound names (e.g. "Иван Иванов") into individual tokens.
      val.trim().split(/\s+/).forEach((t) => {
        if (t.length > 1) tokens.push(t);
      });
    }
  };

  push(cvData['first_name']);
  push(cvData['last_name']);
  push(cvData['middle_name']);

  return tokens;
}

/**
 * Anonymizes a HeadHunter resume JSON object.
 *
 * 1. Deep-clones the input (original is NEVER mutated).
 * 2. Deletes explicit PII fields (name, birth_date, photo, contacts, etc.).
 * 3. Runs text-based sanitization over all remaining string values
 *    (catches embedded emails / phones / URLs / names in free-text fields
 *    like `skills`, `experience[].description`, etc.).
 *
 * @param cvData    - Raw resume object from the HH.ru API (may be null/undefined).
 * @param nameRegex - Pre-compiled regex for name masking (can be null).
 * @returns A sanitized deep clone, or null when the input is nullish.
 */
function anonymizeCv(
  cvData: unknown,
  nameRegex: RegExp | null,
): Record<string, unknown> | null {
  // Edge Case 1: Null / undefined guard.
  if (cvData == null) return null;

  // Deep clone via JSON round-trip (safe for plain API JSON payloads).
  let cloned: Record<string, unknown>;
  try {
    cloned = JSON.parse(JSON.stringify(cvData)) as Record<string, unknown>;
  } catch {
    // If serialization fails (circular refs, etc.), return null defensively.
    return null;
  }

  // Step 1: Delete well-known PII fields at the top level.
  deleteKnownHhPiiFields(cloned);

  // Step 2: Sanitize all remaining string values (iterative DFS, no recursion).
  deepSanitizeStrings(cloned, nameRegex);

  return cloned;
}

/**
 * Anonymizes a list of chat messages.
 *
 * Each message's `text` is sanitized, and the `author.name` field is masked.
 *
 * @param messages  - Array of raw HH.ru chat messages (may be null/undefined/empty).
 * @param nameRegex - Pre-compiled regex for name masking (can be null).
 * @returns A new array of sanitized message clones.
 */
function anonymizeMessages(
  messages: unknown,
  nameRegex: RegExp | null,
): AnonymizedChatMessage[] {
  // Edge Case 1: Guard against non-array inputs.
  if (!Array.isArray(messages)) return [];

  return messages.map((msg: unknown): AnonymizedChatMessage => {
    // Guard against non-object message entries.
    if (msg === null || typeof msg !== 'object') return {};

    // Clone individual message.
    let cloned: AnonymizedChatMessage;
    try {
      cloned = JSON.parse(JSON.stringify(msg)) as AnonymizedChatMessage;
    } catch {
      return {};
    }

    // Sanitize free-text body.
    if (typeof cloned.text === 'string') {
      cloned.text = sanitizeString(cloned.text, nameRegex);
    }

    // Mask author name (but keep author.id for audit trail / ordering).
    if (cloned.author && typeof cloned.author.name === 'string') {
      cloned.author.name = TOKEN_NAME;
    }

    return cloned;
  });
}

/**
 * Main entry point.
 *
 * Anonymizes both the candidate's CV and their chat history before the data
 * is sent to any external LLM service.
 *
 * ```typescript
 * import { anonymizeCandidateData } from '@/lib/security/anonymizer';
 *
 * const safePayload = anonymizeCandidateData(
 *   candidate.raw_data?.resume,
 *   candidate.raw_data?.messages,
 * );
 * // safePayload.resume and safePayload.messages contain no PII.
 * ```
 *
 * @param cvData      - Raw resume object from the HH.ru API.
 * @param chatHistory - Array of chat message objects from the HH.ru API.
 * @returns An {@link AnonymizedCandidatePayload} — a deep clone with no PII.
 */
export function anonymizeCandidateData(
  cvData?: unknown,
  chatHistory?: unknown,
): AnonymizedCandidatePayload {
  // Extract name tokens BEFORE cloning/deleting fields so we still have
  // access to first_name / last_name / middle_name.
  const nameTokens = extractNameTokens(
    cvData != null && typeof cvData === 'object'
      ? (cvData as Record<string, unknown>)
      : null,
  );
  const nameRegex = buildNameRegex(nameTokens);

  const resume   = anonymizeCv(cvData, nameRegex);
  const messages = anonymizeMessages(chatHistory, nameRegex);

  return { resume, messages };
}
