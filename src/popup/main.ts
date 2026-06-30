import { UI_CONFIG } from "../configs/ui";
import { MessageType, isSummarizeStarted, type ChatMessage, type FollowUpResponse, type SummarizeResponse } from "../shared/messages";
import { createLogger } from "../shared/logger";
import {
  clearPopupSession,
  isSameTab,
  loadPopupSession,
  savePopupSession,
  type PopupSession,
} from "../shared/popupSession";

const log = createLogger("popup");

type UiState = "idle" | "loading" | "done" | "follow-up-loading" | "error";

// ── DOM references ───────────────────────────────────────────────────────────

const appTitle = document.getElementById("app-title") as HTMLHeadingElement;
const appSubtitle = document.getElementById("app-subtitle") as HTMLParagraphElement;
const summarizeBtn = document.getElementById("summarize-btn") as HTMLButtonElement;
const statusEl = document.getElementById("status") as HTMLDivElement;
const errorEl = document.getElementById("error") as HTMLDivElement;
const summarySection = document.getElementById("summary-section") as HTMLElement;
const summaryTitle = document.getElementById("summary-title") as HTMLHeadingElement;
const summaryList = document.getElementById("summary-list") as HTMLUListElement;

const resetBtn = document.getElementById("reset-btn") as HTMLButtonElement;

const followupSection = document.getElementById("followup-section") as HTMLElement;
const followupLabel = document.getElementById("followup-label") as HTMLParagraphElement;
const followupInput = document.getElementById("followup-input") as HTMLInputElement;
const followupBtn = document.getElementById("followup-btn") as HTMLButtonElement;
const followupStatus = document.getElementById("followup-status") as HTMLDivElement;
const followupAnswers = document.getElementById("followup-answers") as HTMLDivElement;

// ── State ────────────────────────────────────────────────────────────────────

let currentState: UiState = "idle";
let conversationHistory: ChatMessage[] = [];
let phaseTimer: ReturnType<typeof setTimeout> | null = null;
let qaThread: Array<{ question: string; answer: string }> = [];
let currentPageTitle = "";
let currentSummary = "";
let currentTabUrl = "";
let currentTabId: number | undefined;

// ── Session persistence ──────────────────────────────────────────────────────

async function getActiveTabInfo(): Promise<{ url: string; id?: number }> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return { url: tab?.url ?? "", id: tab?.id };
}

async function persistDoneState(): Promise<void> {
  if (!currentTabId) {
    return;
  }
  await savePopupSession({
    status: "done",
    tabUrl: currentTabUrl,
    tabId: currentTabId,
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
  currentTabId = saved.tabId;
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
    currentTabId = saved.tabId;
    setState("loading", UI_CONFIG.loadingAIMsg);
    log.info("Showing in-progress summarize", { tabId: saved.tabId, tabUrl: saved.tabUrl });
    return;
  }

  if (saved.status === "error" && saved.errorMessage) {
    currentTabUrl = saved.tabUrl;
    currentTabId = saved.tabId;
    showError(saved.errorMessage);
    return;
  }

  if (saved.status === "done") {
    followupAnswers.replaceChildren();
    qaThread = [];
    restoreDoneSession(saved);
  }
}

function applySessionFromStorage(saved: PopupSession, activeTabId: number | undefined, activeTabUrl: string): void {
  if (!isSameTab(saved, activeTabId, activeTabUrl)) {
    setState("idle");
    log.debug("Session belongs to another tab", {
      sessionTabId: saved.tabId,
      activeTabId,
      sessionUrl: saved.tabUrl,
      activeUrl: activeTabUrl,
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
  if (areaName !== "session" || !changes.popupState) {
    return;
  }

  const saved = changes.popupState.newValue as PopupSession | undefined;
  if (!saved) {
    return;
  }

  void getActiveTabInfo().then((active) => {
    if (!isSameTab(saved, active.id, active.url)) {
      return;
    }

    log.info("Session updated for active tab", {
      status: saved.status,
      tabId: saved.tabId,
    });
    applySessionUpdate(saved);
  });
}

// ── UI text from config ──────────────────────────────────────────────────────

function applyUiConfig(): void {
  appTitle.textContent = UI_CONFIG.appTitle;
  appSubtitle.textContent = UI_CONFIG.appSubtitle;
  summarizeBtn.textContent = UI_CONFIG.summarizeBtnLabel;
  followupInput.placeholder = UI_CONFIG.followupPlaceholder;
  followupBtn.textContent = UI_CONFIG.followupSendLabel;
  followupLabel.textContent = UI_CONFIG.followupSectionTitle;
}

// ── State machine ────────────────────────────────────────────────────────────

function setState(state: UiState, statusText?: string): void {
  currentState = state;

  const isLoading = state === "loading";
  const isDone = state === "done" || state === "follow-up-loading";
  const isFollowUpLoading = state === "follow-up-loading";

  summarizeBtn.disabled = isLoading;
  statusEl.classList.toggle("hidden", !isLoading);
  errorEl.classList.toggle("hidden", state !== "error");
  summarySection.classList.toggle("hidden", !isDone);
  followupSection.classList.toggle("hidden", !isDone);
  resetBtn.classList.toggle("hidden", !isDone);

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
  log.warn("Showing error in popup", { message });
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

/** Parse inline markdown: **bold** only. Returns a DocumentFragment. */
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

/** Convert a markdown string into styled DOM nodes (lists + paragraphs). */
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
  const endTimer = log.time("popup summarize request");
  log.info("Summarize button clicked");

  // Reset everything from any previous summarization
  followupAnswers.replaceChildren();
  conversationHistory = [];
  qaThread = [];
  currentPageTitle = "";
  currentSummary = "";
  const { url: tabUrl, id: tabId } = await getActiveTabInfo();
  currentTabUrl = tabUrl;
  currentTabId = tabId;

  if (!tabId) {
    showError("No active tab found. Try again.");
    return;
  }

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
    })) as SummarizeResponse | undefined;

    if (!response) {
      log.error("No response from background service worker");
      showError("No response from extension. Try reloading the page.");
      return;
    }

    if (isSummarizeStarted(response)) {
      log.info("Summarize job started in background; waiting for session update", {
        tabId,
        tabUrl,
      });
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
    if (isPopupClosedDuringRequest(error)) {
      log.info("Popup closed during summarize; job continues in background", { tabId, tabUrl });
      return;
    }
    log.error("Popup summarize request failed", error);
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

  const endTimer = log.time("popup follow-up request");
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
    })) as FollowUpResponse | undefined;

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
    log.info("Follow-up succeeded in popup", {
      question,
      answerChars: response.answer.length,
      ...log.tokens(response.answer.length),
      historyTurns: response.conversationHistory.length,
    });
  } catch (error) {
    log.error("Popup follow-up request failed", error, { question });
    setState("done");
  } finally {
    endTimer();
  }
}

function resetAll(): void {
  followupAnswers.replaceChildren();
  conversationHistory = [];
  qaThread = [];
  currentPageTitle = "";
  currentSummary = "";
  currentTabUrl = "";
  currentTabId = undefined;
  void clearPopupSession();
  setState("idle");
  log.info("Conversation reset by user");
}

function isPopupClosedDuringRequest(error: unknown): boolean {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return (
    message.includes("message channel closed") ||
    message.includes("extension context invalidated") ||
    message.includes("could not establish connection")
  );
}

// ── Event listeners ──────────────────────────────────────────────────────────

summarizeBtn.addEventListener("click", () => {
  void handleSummarize();
});

resetBtn.addEventListener("click", () => {
  resetAll();
});

followupBtn.addEventListener("click", () => {
  void handleFollowUp();
});

followupInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    void handleFollowUp();
  }
});

// ── Init ─────────────────────────────────────────────────────────────────────

async function init(): Promise<void> {
  applyUiConfig();
  chrome.storage.onChanged.addListener(handleSessionStorageChange);

  const active = await getActiveTabInfo();
  const saved = await loadPopupSession();

  if (saved) {
    applySessionFromStorage(saved, active.id, active.url);
  } else {
    setState("idle");
    log.debug("Popup initialized (no saved session)");
  }
}

void init();
