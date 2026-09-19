import type { ChatMessage } from "./messages";

export type PopupSessionStatus = "loading" | "done" | "error";

export interface PopupSession {
  status: PopupSessionStatus;
  tabUrl: string;
  tabId: number;
  /** Background job that last wrote this session — used to undo stale races. */
  jobId?: number;
  pageTitle?: string;
  summary?: string;
  conversationHistory?: ChatMessage[];
  qaThread?: Array<{ question: string; answer: string }>;
  errorCode?: string;
  errorMessage?: string;
}

/** @deprecated Prefer sessionKeyForTab — kept for migrating any leftover single-key writes. */
export const POPUP_SESSION_KEY = "popupState";

/** Per-tab session key so parallel panels do not overwrite each other. */
export function sessionKeyForTab(tabId: number): string {
  return `popupState:${tabId}`;
}

/** Match session to the active tab — prefer stable tabId over URL. */
export function isSameTab(
  session: PopupSession,
  tabId: number | undefined,
  tabUrl: string,
): boolean {
  if (session.tabId && tabId) {
    return session.tabId === tabId;
  }
  return session.tabUrl !== "" && session.tabUrl === tabUrl;
}

export async function loadPopupSession(tabId: number): Promise<PopupSession | null> {
  const key = sessionKeyForTab(tabId);
  const result = await chrome.storage.session.get(key);
  const typed = (result[key] as PopupSession | undefined) ?? null;
  if (typed) {
    return typed;
  }

  // One-time migration: older builds stored a single global popupState.
  const legacy = await chrome.storage.session.get(POPUP_SESSION_KEY);
  const legacySession = (legacy[POPUP_SESSION_KEY] as PopupSession | undefined) ?? null;
  if (legacySession && legacySession.tabId === tabId) {
    await chrome.storage.session.set({ [key]: legacySession });
    await chrome.storage.session.remove(POPUP_SESSION_KEY);
    return legacySession;
  }
  return null;
}

export async function savePopupSession(session: PopupSession): Promise<void> {
  await chrome.storage.session.set({ [sessionKeyForTab(session.tabId)]: session });
}

export async function clearPopupSession(tabId: number): Promise<void> {
  const key = sessionKeyForTab(tabId);
  const legacy = await chrome.storage.session.get(POPUP_SESSION_KEY);
  const legacySession = (legacy[POPUP_SESSION_KEY] as PopupSession | undefined) ?? null;
  const keys = [key];
  // Drop leftover global key when it belongs to this tab (or has no tabId).
  if (!legacySession || legacySession.tabId === tabId || !legacySession.tabId) {
    keys.push(POPUP_SESSION_KEY);
  }
  await chrome.storage.session.remove(keys);
}
