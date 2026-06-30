/**
 * Input sanitization helpers for LLM prompt construction.
 *
 * These run BEFORE any user-controlled or page-controlled string
 * is interpolated into a prompt message.  They do not guarantee
 * immunity from prompt injection — no client-side check can — but
 * they significantly raise the bar alongside the delimiter strategy
 * used in prompt.ts.
 */

/** Remove ASCII/Unicode control characters (except normal whitespace). */
function stripControlChars(value: string): string {
  // Keep: \t (9), \n (10), \r (13), space (32+)
  // Remove: 0-8, 11-12, 14-31, 127 (DEL), and Unicode control categories
  return value.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F\u0080-\u009F]/g, "");
}

/**
 * Sanitize a page title before it appears in a prompt.
 * Trims, enforces a hard length cap, and strips control characters.
 */
export function sanitizeTitle(title: string): string {
  const MAX_TITLE_CHARS = 300;
  return stripControlChars(title.trim()).slice(0, MAX_TITLE_CHARS);
}

/**
 * Sanitize extracted page text before it appears in a prompt.
 * Only strips control characters — do not trim/slice here because
 * the caller already handles truncation via truncate().
 */
export function sanitizeText(text: string): string {
  return stripControlChars(text);
}

/**
 * Sanitize a user-supplied follow-up question.
 * Trims, enforces a length cap, and strips control characters.
 * The user is a trusted actor, so this is a lightweight guard
 * against accidental or copy-paste injection, not a hard security boundary.
 */
export function sanitizeQuestion(question: string): string {
  const MAX_QUESTION_CHARS = 1_000;
  return stripControlChars(question.trim()).slice(0, MAX_QUESTION_CHARS);
}
