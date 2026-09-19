/**
 * UI configuration — all user-visible strings in one place.
 * Edit here to rename labels, messages, or placeholder text across the popup.
 */

export const UI_CONFIG = {
  appTitle: "CondenseAI",
  appSubtitle: "Local AI via Ollama",

  summarizeBtnLabel: "Summarize",

  loadingExtractMsg: "Extracting page content\u2026",
  loadingAIMsg: "Asking AI to summarize\u2026",

  followupPlaceholder: "Ask a follow-up question\u2026",
  followupSendLabel: "\u27A4",
  followupLoadingMsg: "Thinking\u2026",
  followupSectionTitle: "Ask a follow-up",

  resetLabel: "Reset (cancels any in-progress request)",
  minimizeLabel: "Minimize",
  restoreLabel: "Restore",
  closeLabel: "Close",
} as const;
