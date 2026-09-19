import { UI_CONFIG } from "../configs/ui";
import {
  MessageType,
  isSummarizeStarted,
  type ChatMessage,
  type FollowUpResponse,
  type SummarizeResponse,
} from "../shared/messages";
import { createLogger } from "../shared/logger";
import {
  clearPopupSession,
  isSameTab,
  loadPopupSession,
  savePopupSession,
  sessionKeyForTab,
  type PopupSession,
} from "../shared/popupSession";

const log = createLogger("panel");

type UiState = "idle" | "loading" | "done" | "follow-up-loading" | "error";

/** DOM references inside the panel's shadow root. Built by panelView.ts. */
export interface PanelElements {
  appTitle: HTMLElement;
  appSubtitle: HTMLElement;
  summarizeBtn: HTMLButtonElement;
  statusEl: HTMLElement;
  errorEl: HTMLElement;
  summarySection: HTMLElement;
  summaryTitle: HTMLElement;
  summaryList: HTMLElement;
  resetBtn: HTMLButtonElement;
  followupSection: HTMLElement;
  followupLabel: HTMLElement;
  followupInput: HTMLInputElement;
  followupBtn: HTMLButtonElement;
  followupStatus: HTMLElement;
  followupAnswers: HTMLElement;
}

export interface PanelController {
  destroy(): void;
}

/**
 * Wires up the panel's state machine, session persistence, and follow-up Q&A.
 * The panel is attached to a single tab (tabId comes from the toolbar click
 * that opened it); tabUrl is read fresh from `location.href` since this code
 * runs inside that tab's content script — no chrome.tabs lookups needed.
 */
export function createPanelController(elements: PanelElements, tabId: number): PanelController {
  const {
    appTitle,
    appSubtitle,
    summarizeBtn,
    statusEl,
    errorEl,
    summarySection,
    summaryTitle,
    summaryList,
    resetBtn,
    followupSection,
    followupLabel,
    followupInput,
    followupBtn,
    followupStatus,
    followupAnswers,
  } = elements;

  let currentState: UiState = "idle";
  let conversationHistory: ChatMessage[] = [];
  let phaseTimer: ReturnType<typeof setTimeout> | null = null;
  let qaThread: Array<{ question: string; answer: string }> = [];
  let currentPageTitle = "";
  let currentSummary = "";
  let currentTabUrl = "";

  // Bumped on every reset/new request so late responses from a
  // cancelled/superseded job are recognized and discarded.
  let requestGeneration = 0;
  // After Reset, ignore chrome.storage.onChanged until the user starts a new
  // summarize — otherwise a late background write can resurrect loading/done.
  let acceptSessionFromStorage = true;

  function currentTabUrlOrLocation(): string {
    return currentTabUrl || location.href;
  }

  async function persistDoneState(): Promise<void> {
    await savePopupSession({
      status: "done",
      tabUrl: currentTabUrlOrLocation(),
      tabId,
      pageTitle: currentPageTitle,
      summary: currentSummary,
      conversationHistory,
      qaThread,
    });
  }

  function restoreDoneSession(saved: PopupSession): void {
    if (!saved.pageTitle || !saved.summary) {
      return;
    }

    currentTabUrl = saved.tabUrl;
    conversationHistory = saved.conversationHistory ?? [];
    qaThread = saved.qaThread ?? [];
    renderSummary(saved.pageTitle, saved.summary, false);
    for (const qa of qaThread) {
      appendFollowUpQA(qa.question, qa.answer);
    }
    setState("done");
  }

  function applySessionUpdate(saved: PopupSession): void {
    if (saved.status === "loading") {
      currentTabUrl = saved.tabUrl;
      setState("loading", UI_CONFIG.loadingAIMsg);
      log.info("Showing in-progress summarize", { tabId: saved.tabId, tabUrl: saved.tabUrl });
      return;
    }

    if (saved.status === "error" && saved.errorMessage) {
      currentTabUrl = saved.tabUrl;
      showError(saved.errorMessage);
      return;
    }

    if (saved.status === "done") {
      followupAnswers.replaceChildren();
      qaThread = [];
      restoreDoneSession(saved);
    }
  }

  function applySessionFromStorage(saved: PopupSession): void {
    if (!isSameTab(saved, tabId, location.href)) {
      setState("idle");
      log.debug("Session belongs to another tab", {
        sessionTabId: saved.tabId,
        tabId,
        sessionUrl: saved.tabUrl,
        activeUrl: location.href,
        status: saved.status,
      });
      return;
    }

    applySessionUpdate(saved);
  }

  function handleSessionStorageChange(
    changes: Record<string, chrome.storage.StorageChange>,
    areaName: string,
  ): void {
    if (areaName !== "session") {
      return;
    }

    const key = sessionKeyForTab(tabId);
    const change = changes[key];
    if (!change) {
      return;
    }

    const saved = change.newValue as PopupSession | undefined;
    if (!saved) {
      return;
    }

    if (!acceptSessionFromStorage) {
      log.debug("Ignoring session update after reset", { status: saved.status, tabId });
      return;
    }

    if (!isSameTab(saved, tabId, location.href)) {
      return;
    }

    log.info("Session updated for active tab", { status: saved.status, tabId: saved.tabId });
    applySessionUpdate(saved);
  }

  // ── UI text from config ────────────────────────────────────────────────────

  function applyUiConfig(): void {
    appTitle.textContent = UI_CONFIG.appTitle;
    appSubtitle.textContent = UI_CONFIG.appSubtitle;
    summarizeBtn.textContent = UI_CONFIG.summarizeBtnLabel;
    followupInput.placeholder = UI_CONFIG.followupPlaceholder;
    followupBtn.textContent = UI_CONFIG.followupSendLabel;
    followupLabel.textContent = UI_CONFIG.followupSectionTitle;
  }

  // ── State machine ───────────────────────────────────────────────────────────

  function setState(state: UiState, statusText?: string): void {
    currentState = state;

    const isLoading = state === "loading";
    const isDone = state === "done" || state === "follow-up-loading";
    const isFollowUpLoading = state === "follow-up-loading";

    summarizeBtn.classList.toggle("hidden", state !== "idle");
    summarizeBtn.disabled = isLoading;
    statusEl.classList.toggle("hidden", !isLoading);
    errorEl.classList.toggle("hidden", state !== "error");
    summarySection.classList.toggle("hidden", !isDone);
    followupSection.classList.toggle("hidden", !isDone);
    // Reset stays visible in every state so an in-flight or stuck request can always be cancelled.

    if (statusText !== undefined) {
      statusEl.textContent = statusText;
    } else {
      statusEl.textContent = "";
    }

    followupInput.disabled = isFollowUpLoading;
    followupBtn.disabled = isFollowUpLoading;
    followupStatus.classList.toggle("hidden", !isFollowUpLoading);
    if (isFollowUpLoading) {
      followupStatus.textContent = UI_CONFIG.followupLoadingMsg;
    }

    log.debug("UI state changed", { state, statusText });
  }

  function showError(message: string): void {
    log.warn("Showing error in panel", { message });
    errorEl.textContent = message;
    setState("error");
  }

  // ── Rendering ────────────────────────────────────────────────────────────────

  function parseBullets(summary: string): string[] {
    const lines = summary
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);

    const bullets = lines
      .map((line) => line.replace(/^[-*\u2022]\s+/, "").trim())
      .filter(Boolean);

    return bullets.length > 0 ? bullets : [summary.trim()];
  }

  function renderSummary(pageTitle: string, summary: string, persist = true): void {
    const bullets = parseBullets(summary);
    summaryTitle.textContent = pageTitle;
    summaryList.replaceChildren();

    for (const bullet of bullets) {
      const li = document.createElement("li");
      li.textContent = bullet;
      summaryList.appendChild(li);
    }

    currentPageTitle = pageTitle;
    currentSummary = summary;
    log.info("Summary rendered", { pageTitle, bulletCount: bullets.length });
    if (persist) {
      void persistDoneState();
    }
  }

  // ── Lightweight markdown renderer ────────────────────────────────────────────

  function parseInline(text: string): DocumentFragment {
    const frag = document.createDocumentFragment();
    const parts = text.split(/(\*\*[^*]+\*\*)/g);
    for (const part of parts) {
      if (part.startsWith("**") && part.endsWith("**")) {
        const strong = document.createElement("strong");
        strong.textContent = part.slice(2, -2);
        frag.appendChild(strong);
      } else {
        frag.appendChild(document.createTextNode(part));
      }
    }
    return frag;
  }

  function renderMarkdown(text: string): HTMLElement {
    const body = document.createElement("div");
    body.className = "followup-answer-body";

    const lines = text.split("\n").map((l) => l.trim());
    let currentList: HTMLUListElement | null = null;

    for (const line of lines) {
      if (!line) {
        currentList = null;
        continue;
      }

      const bulletMatch = line.match(/^[*\-•]\s+(.*)/);
      const numberedMatch = line.match(/^\d+\.\s+(.*)/);
      const itemText = bulletMatch?.[1] ?? numberedMatch?.[1];

      if (itemText !== undefined) {
        if (!currentList) {
          currentList = document.createElement("ul");
          currentList.className = "followup-answer-list";
          body.appendChild(currentList);
        }
        const li = document.createElement("li");
        li.appendChild(parseInline(itemText));
        currentList.appendChild(li);
      } else {
        currentList = null;
        const p = document.createElement("p");
        p.appendChild(parseInline(line));
        body.appendChild(p);
      }
    }

    return body;
  }

  function appendFollowUpQA(question: string, answer: string, persist = false): void {
    const block = document.createElement("div");
    block.className = "followup-qa";

    const q = document.createElement("div");
    q.className = "followup-question";
    q.textContent = `Q: ${question}`;

    block.appendChild(q);
    block.appendChild(renderMarkdown(answer));
    followupAnswers.appendChild(block);
    followupAnswers.scrollTop = followupAnswers.scrollHeight;

    if (persist) {
      qaThread.push({ question, answer });
      void persistDoneState();
    }
  }

  // ── Handlers ─────────────────────────────────────────────────────────────────

  async function handleSummarize(): Promise<void> {
    const endTimer = log.time("panel summarize request");
    log.info("Summarize button clicked");

    const myGeneration = ++requestGeneration;
    acceptSessionFromStorage = true;

    followupAnswers.replaceChildren();
    conversationHistory = [];
    qaThread = [];
    currentPageTitle = "";
    currentSummary = "";
    currentTabUrl = location.href;

    await savePopupSession({
      status: "loading",
      tabUrl: currentTabUrl,
      tabId,
    });

    setState("loading", UI_CONFIG.loadingExtractMsg);
    errorEl.classList.add("hidden");
    summarySection.classList.add("hidden");

    // Phase 2 message after 3 s (extraction usually finishes by then)
    phaseTimer = setTimeout(() => {
      if (currentState === "loading") {
        setState("loading", UI_CONFIG.loadingAIMsg);
      }
    }, 3000);

    try {
      const response = (await chrome.runtime.sendMessage({
        type: MessageType.SUMMARIZE_ACTIVE_TAB,
        tabId,
        tabUrl: currentTabUrl,
      })) as SummarizeResponse | undefined;

      if (myGeneration !== requestGeneration) {
        log.info("Discarding stale summarize response", { myGeneration, requestGeneration });
        return;
      }

      if (!response) {
        log.error("No response from background service worker");
        showError("No response from extension. Try reloading the page.");
        return;
      }

      if (isSummarizeStarted(response)) {
        log.info("Summarize job started in background; waiting for session update", { tabId });
        return;
      }

      if (!response.ok) {
        log.warn("Background returned failure", { code: response.code, message: response.message });
        showError(response.message);
        return;
      }

      conversationHistory = response.conversationHistory;
      renderSummary(response.pageTitle, response.summary);
      setState("done");
    } catch (error) {
      if (myGeneration !== requestGeneration) {
        return;
      }
      log.error("Panel summarize request failed", error);
      showError("Failed to summarize. Try reloading the page.");
    } finally {
      if (phaseTimer !== null) {
        clearTimeout(phaseTimer);
        phaseTimer = null;
      }
      endTimer();
    }
  }

  async function handleFollowUp(): Promise<void> {
    const question = followupInput.value.trim();
    if (!question) return;

    const myGeneration = ++requestGeneration;
    const endTimer = log.time("panel follow-up request");
    log.info("Follow-up submitted", {
      question,
      questionChars: question.length,
      ...log.tokens(question.length),
      historyTurns: conversationHistory.length,
    });

    followupInput.value = "";
    setState("follow-up-loading");

    try {
      log.info("Sending follow-up to background", { type: MessageType.ASK_FOLLOW_UP });
      const response = (await chrome.runtime.sendMessage({
        type: MessageType.ASK_FOLLOW_UP,
        question,
        conversationHistory,
        tabId,
      })) as FollowUpResponse | undefined;

      if (myGeneration !== requestGeneration) {
        log.info("Discarding stale follow-up response", { myGeneration, requestGeneration });
        return;
      }

      if (!response) {
        log.error("No follow-up response from background service worker");
        followupStatus.textContent = "No response from extension.";
        return;
      }

      if (!response.ok) {
        log.warn("Follow-up returned failure", {
          code: response.code,
          message: response.message,
          question,
        });
        followupStatus.textContent = response.message;
        followupStatus.classList.remove("hidden");
        setState("done");
        return;
      }

      conversationHistory = response.conversationHistory;
      appendFollowUpQA(question, response.answer, true);
      setState("done");
      log.info("Follow-up succeeded in panel", {
        question,
        answerChars: response.answer.length,
        ...log.tokens(response.answer.length),
        historyTurns: response.conversationHistory.length,
      });
    } catch (error) {
      if (myGeneration !== requestGeneration) {
        return;
      }
      log.error("Panel follow-up request failed", error, { question });
      setState("done");
    } finally {
      endTimer();
    }
  }

  async function resetAll(): Promise<void> {
    // Invalidate any in-flight request before we tear down local state so a
    // late response can never resurrect the UI or the session we're clearing.
    requestGeneration++;
    acceptSessionFromStorage = false;

    try {
      await chrome.runtime.sendMessage({ type: MessageType.CANCEL_JOB, tabId });
    } catch (error) {
      log.warn("Failed to send cancel request", {
        error: error instanceof Error ? error.message : String(error),
      });
    }

    followupAnswers.replaceChildren();
    conversationHistory = [];
    qaThread = [];
    currentPageTitle = "";
    currentSummary = "";
    currentTabUrl = "";
    await clearPopupSession(tabId);
    setState("idle");
    log.info("Reset by user");
  }

  // ── Event listeners ──────────────────────────────────────────────────────────

  function onSummarizeClick(): void {
    void handleSummarize();
  }

  function onResetClick(): void {
    void resetAll();
  }

  function onFollowUpClick(): void {
    void handleFollowUp();
  }

  function onFollowUpKeydown(e: KeyboardEvent): void {
    if (e.key === "Enter") {
      void handleFollowUp();
    }
  }

  summarizeBtn.addEventListener("click", onSummarizeClick);
  resetBtn.addEventListener("click", onResetClick);
  followupBtn.addEventListener("click", onFollowUpClick);
  followupInput.addEventListener("keydown", onFollowUpKeydown);
  chrome.storage.onChanged.addListener(handleSessionStorageChange);

  // ── Init ─────────────────────────────────────────────────────────────────────

  applyUiConfig();

  void loadPopupSession(tabId).then((saved) => {
    if (saved) {
      applySessionFromStorage(saved);
    } else {
      setState("idle");
      log.debug("Panel initialized (no saved session)");
    }
  });

  return {
    destroy(): void {
      if (phaseTimer !== null) {
        clearTimeout(phaseTimer);
      }
      chrome.storage.onChanged.removeListener(handleSessionStorageChange);
      summarizeBtn.removeEventListener("click", onSummarizeClick);
      resetBtn.removeEventListener("click", onResetClick);
      followupBtn.removeEventListener("click", onFollowUpClick);
      followupInput.removeEventListener("keydown", onFollowUpKeydown);
    },
  };
}
