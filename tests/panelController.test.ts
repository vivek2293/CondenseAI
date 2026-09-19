/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPanelController, type PanelElements } from "../src/panel/panelController";
import { MessageType } from "../src/shared/messages";
import { installChromeMock } from "./chromeMock";

function buildElements(): PanelElements {
  document.body.innerHTML = `
    <h1 data-el="appTitle"></h1>
    <p data-el="appSubtitle"></p>
    <button data-el="summarizeBtn"></button>
    <div data-el="statusEl" class="hidden"></div>
    <div data-el="errorEl" class="hidden"></div>
    <section data-el="summarySection" class="hidden">
      <h2 data-el="summaryTitle"></h2>
      <ul data-el="summaryList"></ul>
    </section>
    <button data-el="resetBtn"></button>
    <section data-el="followupSection" class="hidden">
      <p data-el="followupLabel"></p>
      <div data-el="followupAnswers"></div>
      <div data-el="followupStatus" class="hidden"></div>
      <input data-el="followupInput" />
      <button data-el="followupBtn"></button>
    </section>
  `;

  const q = <T extends HTMLElement>(name: string) =>
    document.querySelector(`[data-el="${name}"]`) as T;

  return {
    appTitle: q("appTitle"),
    appSubtitle: q("appSubtitle"),
    summarizeBtn: q("summarizeBtn"),
    statusEl: q("statusEl"),
    errorEl: q("errorEl"),
    summarySection: q("summarySection"),
    summaryTitle: q("summaryTitle"),
    summaryList: q("summaryList"),
    resetBtn: q("resetBtn"),
    followupSection: q("followupSection"),
    followupLabel: q("followupLabel"),
    followupInput: q("followupInput"),
    followupBtn: q("followupBtn"),
    followupStatus: q("followupStatus"),
    followupAnswers: q("followupAnswers"),
  };
}

describe("createPanelController", () => {
  let mock: ReturnType<typeof installChromeMock>;
  let elements: PanelElements;
  let controller: ReturnType<typeof createPanelController>;

  beforeEach(() => {
    mock = installChromeMock();
    elements = buildElements();
  });

  afterEach(() => {
    controller?.destroy();
    mock?.restore();
    document.body.innerHTML = "";
  });

  it("shows Summarize only in idle; hides it after click starts loading", async () => {
    mock.sendMessage.mockResolvedValue({ ok: true, started: true });
    controller = createPanelController(elements, 7);

    await vi.waitFor(() => {
      expect(elements.summarizeBtn.classList.contains("hidden")).toBe(false);
    });

    elements.summarizeBtn.click();

    await vi.waitFor(() => {
      expect(elements.summarizeBtn.classList.contains("hidden")).toBe(true);
      expect(mock.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: MessageType.SUMMARIZE_ACTIVE_TAB,
          tabId: 7,
          tabUrl: window.location.href,
        }),
      );
    });
  });

  it("reset sends CANCEL_JOB and returns Summarize button to idle", async () => {
    mock.sendMessage.mockResolvedValue({ ok: true, started: true });
    controller = createPanelController(elements, 7);
    await vi.waitFor(() => expect(elements.summarizeBtn.classList.contains("hidden")).toBe(false));

    elements.summarizeBtn.click();
    await vi.waitFor(() => expect(elements.summarizeBtn.classList.contains("hidden")).toBe(true));

    mock.sendMessage.mockClear();
    mock.sendMessage.mockResolvedValue({ ok: true });
    elements.resetBtn.click();

    await vi.waitFor(() => {
      expect(mock.sendMessage).toHaveBeenCalledWith({ type: MessageType.CANCEL_JOB, tabId: 7 });
      expect(elements.summarizeBtn.classList.contains("hidden")).toBe(false);
    });
  });
});
