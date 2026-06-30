import type { ChatMessage } from "./messages";

export type PopupSessionStatus = "loading" | "done" | "error";

export interface PopupSession {
  status: PopupSessionStatus;
  tabUrl: string;
  tabId: number;
  pageTitle?: string;
  summary?: string;
  conversationHistory?: ChatMessage[];
  qaThread?: Array<{ question: string; answer: string }>;
  errorCode?: string;
  errorMessage?: string;
}

export const POPUP_SESSION_KEY = "popupState";

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

export async function loadPopupSession(): Promise<PopupSession | null> {
  const result = await chrome.storage.session.get(POPUP_SESSION_KEY);
  return (result[POPUP_SESSION_KEY] as PopupSession) ?? null;
}

export async function savePopupSession(session: PopupSession): Promise<void> {
  await chrome.storage.session.set({ [POPUP_SESSION_KEY]: session });
}

export async function clearPopupSession(): Promise<void> {
  await chrome.storage.session.remove(POPUP_SESSION_KEY);
}
