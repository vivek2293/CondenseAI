import { UI_CONFIG } from "../configs/ui";

/**
 * Static markup for the floating panel's shadow root.
 * Mirrors the old popup layout (see git history) plus a draggable header
 * with minimize/close controls and an always-visible reset button.
 */
export function renderPanelTemplate(): string {
  return `
    <div class="panel" part="panel">
      <div class="panel-header" data-drag-handle>
        <div class="panel-header-text">
          <h1 data-el="appTitle"></h1>
          <p class="panel-subtitle" data-el="appSubtitle"></p>
        </div>
        <div class="panel-header-actions">
          <button type="button" class="btn-icon btn-reset" data-el="resetBtn" title="${UI_CONFIG.resetLabel}" aria-label="${UI_CONFIG.resetLabel}">&#x1F5D1;</button>
          <button type="button" class="btn-icon btn-minimize" data-el="minimizeBtn" title="${UI_CONFIG.minimizeLabel}" aria-label="${UI_CONFIG.minimizeLabel}">&#x2212;</button>
          <button type="button" class="btn-icon btn-close" data-el="closeBtn" title="${UI_CONFIG.closeLabel}" aria-label="${UI_CONFIG.closeLabel}">&#x2715;</button>
        </div>
      </div>

      <div class="panel-body" data-el="panelBody">
        <button type="button" class="btn-primary" data-el="summarizeBtn"></button>

        <div class="status hidden" data-el="statusEl" aria-live="polite"></div>

        <div class="error hidden" data-el="errorEl" role="alert"></div>

        <section class="summary-section hidden" data-el="summarySection">
          <h2 class="summary-title" data-el="summaryTitle"></h2>
          <ul class="summary-list" data-el="summaryList"></ul>
        </section>

        <section class="followup-section hidden" data-el="followupSection">
          <p class="followup-label" data-el="followupLabel"></p>
          <div class="followup-answers" data-el="followupAnswers"></div>
          <div class="followup-status hidden" data-el="followupStatus" aria-live="polite"></div>
          <div class="followup-row">
            <input type="text" class="followup-input" data-el="followupInput" autocomplete="off" />
            <button type="button" class="btn-send" data-el="followupBtn" aria-label="Send"></button>
          </div>
        </section>
      </div>
    </div>
  `;
}
