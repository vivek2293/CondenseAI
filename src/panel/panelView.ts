import panelCss from "./panel.css?inline";
import { UI_CONFIG } from "../configs/ui";
import { createLogger } from "../shared/logger";
import { createPanelController, type PanelController, type PanelElements } from "./panelController";
import { renderPanelTemplate } from "./panelTemplate";

const log = createLogger("panel-view");

const HOST_ID = "condenseai-panel-host";
const MINIMIZE_ICON = "\u2212";
const RESTORE_ICON = "\u25A1";

let host: HTMLElement | null = null;
let controller: PanelController | null = null;
let disposeDrag: (() => void) | null = null;

function queryEl<T extends HTMLElement>(root: ParentNode, name: string): T {
  const el = root.querySelector<T>(`[data-el="${name}"]`);
  if (!el) {
    throw new Error(`Panel template missing element: ${name}`);
  }
  return el;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function wireDrag(hostEl: HTMLElement, handle: HTMLElement): () => void {
  let dragOffsetX = 0;
  let dragOffsetY = 0;

  function onPointerMove(e: PointerEvent): void {
    const width = hostEl.offsetWidth;
    const height = hostEl.offsetHeight;
    const left = clamp(e.clientX - dragOffsetX, 0, Math.max(0, window.innerWidth - width));
    const top = clamp(e.clientY - dragOffsetY, 0, Math.max(0, window.innerHeight - height));
    hostEl.style.left = `${left}px`;
    hostEl.style.top = `${top}px`;
  }

  function onPointerUp(): void {
    handle.classList.remove("dragging");
    document.removeEventListener("pointermove", onPointerMove);
    document.removeEventListener("pointerup", onPointerUp);
  }

  function onPointerDown(e: PointerEvent): void {
    if ((e.target as HTMLElement).closest("button")) {
      return;
    }

    const rect = hostEl.getBoundingClientRect();
    hostEl.style.right = "auto";
    hostEl.style.left = `${rect.left}px`;
    hostEl.style.top = `${rect.top}px`;

    dragOffsetX = e.clientX - rect.left;
    dragOffsetY = e.clientY - rect.top;

    handle.classList.add("dragging");
    document.addEventListener("pointermove", onPointerMove);
    document.addEventListener("pointerup", onPointerUp);
  }

  function onResize(): void {
    const rect = hostEl.getBoundingClientRect();
    const width = hostEl.offsetWidth;
    const height = hostEl.offsetHeight;
    if (rect.left > window.innerWidth - width || rect.top > window.innerHeight - height) {
      hostEl.style.left = `${clamp(rect.left, 0, Math.max(0, window.innerWidth - width))}px`;
      hostEl.style.top = `${clamp(rect.top, 0, Math.max(0, window.innerHeight - height))}px`;
    }
  }

  handle.addEventListener("pointerdown", onPointerDown);
  window.addEventListener("resize", onResize);

  return () => {
    handle.removeEventListener("pointerdown", onPointerDown);
    window.removeEventListener("resize", onResize);
    document.removeEventListener("pointermove", onPointerMove);
    document.removeEventListener("pointerup", onPointerUp);
  };
}

function wireMinimize(panelRoot: HTMLElement, minimizeBtn: HTMLButtonElement): void {
  minimizeBtn.addEventListener("click", () => {
    const isMinimized = panelRoot.classList.toggle("minimized");
    minimizeBtn.textContent = isMinimized ? RESTORE_ICON : MINIMIZE_ICON;
    minimizeBtn.title = isMinimized ? UI_CONFIG.restoreLabel : UI_CONFIG.minimizeLabel;
    minimizeBtn.setAttribute("aria-label", isMinimized ? UI_CONFIG.restoreLabel : UI_CONFIG.minimizeLabel);
  });
}

function wireClose(closeBtn: HTMLButtonElement): void {
  closeBtn.addEventListener("click", () => {
    unmountPanel();
  });
}

export function isPanelMounted(): boolean {
  return host !== null;
}

export function unmountPanel(): void {
  controller?.destroy();
  controller = null;
  disposeDrag?.();
  disposeDrag = null;
  host?.remove();
  host = null;
  log.info("Panel unmounted");
}

function restoreIfMinimized(): void {
  if (!host) return;
  const panelRoot = host.shadowRoot?.querySelector(".panel");
  panelRoot?.classList.remove("minimized");
  const minimizeBtn = host.shadowRoot?.querySelector<HTMLButtonElement>('[data-el="minimizeBtn"]');
  if (minimizeBtn) {
    minimizeBtn.textContent = MINIMIZE_ICON;
    minimizeBtn.title = UI_CONFIG.minimizeLabel;
    minimizeBtn.setAttribute("aria-label", UI_CONFIG.minimizeLabel);
  }
}

function mountPanel(tabId: number): void {
  host = document.createElement("div");
  host.id = HOST_ID;

  const shadow = host.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = panelCss;
  shadow.appendChild(style);

  const wrapper = document.createElement("div");
  wrapper.innerHTML = renderPanelTemplate();
  shadow.appendChild(wrapper);

  const elements: PanelElements = {
    appTitle: queryEl(shadow, "appTitle"),
    appSubtitle: queryEl(shadow, "appSubtitle"),
    summarizeBtn: queryEl(shadow, "summarizeBtn"),
    statusEl: queryEl(shadow, "statusEl"),
    errorEl: queryEl(shadow, "errorEl"),
    summarySection: queryEl(shadow, "summarySection"),
    summaryTitle: queryEl(shadow, "summaryTitle"),
    summaryList: queryEl(shadow, "summaryList"),
    resetBtn: queryEl(shadow, "resetBtn"),
    followupSection: queryEl(shadow, "followupSection"),
    followupLabel: queryEl(shadow, "followupLabel"),
    followupInput: queryEl(shadow, "followupInput"),
    followupBtn: queryEl(shadow, "followupBtn"),
    followupStatus: queryEl(shadow, "followupStatus"),
    followupAnswers: queryEl(shadow, "followupAnswers"),
  };

  const panelRoot = queryEl<HTMLElement>(shadow, "panelBody").closest(".panel") as HTMLElement;
  const header = shadow.querySelector<HTMLElement>("[data-drag-handle]");
  const minimizeBtn = queryEl<HTMLButtonElement>(shadow, "minimizeBtn");
  const closeBtn = queryEl<HTMLButtonElement>(shadow, "closeBtn");

  if (header) {
    disposeDrag = wireDrag(host, header);
  }
  wireMinimize(panelRoot, minimizeBtn);
  wireClose(closeBtn);

  document.documentElement.appendChild(host);
  controller = createPanelController(elements, tabId);
  log.info("Panel mounted", { tabId });
}

export function togglePanel(tabId: number): void {
  if (!isPanelMounted()) {
    mountPanel(tabId);
    return;
  }
  restoreIfMinimized();
}
