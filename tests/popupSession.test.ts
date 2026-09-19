import { afterEach, describe, expect, it } from "vitest";
import {
  clearPopupSession,
  isSameTab,
  loadPopupSession,
  POPUP_SESSION_KEY,
  savePopupSession,
  sessionKeyForTab,
  type PopupSession,
} from "../src/shared/popupSession";
import { installChromeMock } from "./chromeMock";

const baseSession = (overrides: Partial<PopupSession> = {}): PopupSession => ({
  status: "done",
  tabUrl: "https://example.com",
  tabId: 42,
  pageTitle: "Example",
  summary: "- one",
  ...overrides,
});

describe("isSameTab", () => {
  it("prefers tabId when both sides have it", () => {
    expect(isSameTab(baseSession(), 42, "https://other.com")).toBe(true);
    expect(isSameTab(baseSession(), 99, "https://example.com")).toBe(false);
  });

  it("falls back to tabUrl when either tabId is missing", () => {
    expect(
      isSameTab(baseSession({ tabId: undefined as unknown as number }), undefined, "https://example.com"),
    ).toBe(true);
    expect(
      isSameTab(baseSession({ tabId: undefined as unknown as number }), undefined, "https://other.com"),
    ).toBe(false);
  });
});

describe("sessionKeyForTab", () => {
  it("namespaces keys per tab", () => {
    expect(sessionKeyForTab(7)).toBe("popupState:7");
    expect(sessionKeyForTab(7)).not.toBe(sessionKeyForTab(8));
  });
});

describe("popupSession storage", () => {
  let mock: ReturnType<typeof installChromeMock>;

  afterEach(() => {
    mock?.restore();
  });

  it("loads null when empty", async () => {
    mock = installChromeMock();
    await expect(loadPopupSession(42)).resolves.toBeNull();
  });

  it("round-trips save and load per tab without clobbering another tab", async () => {
    mock = installChromeMock();
    const a = baseSession({ tabId: 1, summary: "A" });
    const b = baseSession({ tabId: 2, summary: "B", tabUrl: "https://b.example" });
    await savePopupSession(a);
    await savePopupSession(b);

    expect(mock.sessionStore.get(sessionKeyForTab(1))).toEqual(a);
    expect(mock.sessionStore.get(sessionKeyForTab(2))).toEqual(b);
    await expect(loadPopupSession(1)).resolves.toEqual(a);
    await expect(loadPopupSession(2)).resolves.toEqual(b);
  });

  it("clearPopupSession only clears the requested tab", async () => {
    mock = installChromeMock();
    await savePopupSession(baseSession({ tabId: 1 }));
    await savePopupSession(baseSession({ tabId: 2 }));
    await clearPopupSession(1);
    expect(mock.sessionStore.has(sessionKeyForTab(1))).toBe(false);
    expect(mock.sessionStore.has(sessionKeyForTab(2))).toBe(true);
  });

  it("clearPopupSession also removes a matching legacy global key", async () => {
    mock = installChromeMock();
    const legacy = baseSession({ tabId: 3 });
    mock.sessionStore.set(POPUP_SESSION_KEY, legacy);
    await savePopupSession(baseSession({ tabId: 3 }));
    await clearPopupSession(3);
    expect(mock.sessionStore.has(sessionKeyForTab(3))).toBe(false);
    expect(mock.sessionStore.has(POPUP_SESSION_KEY)).toBe(false);
  });

  it("migrates a legacy global popupState into the per-tab key", async () => {
    mock = installChromeMock();
    const legacy = baseSession({ tabId: 9 });
    mock.sessionStore.set(POPUP_SESSION_KEY, legacy);

    await expect(loadPopupSession(9)).resolves.toEqual(legacy);
    expect(mock.sessionStore.has(POPUP_SESSION_KEY)).toBe(false);
    expect(mock.sessionStore.get(sessionKeyForTab(9))).toEqual(legacy);
  });
});
