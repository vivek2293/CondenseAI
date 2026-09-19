# Agent Guide

> Full architecture reference: [ARCHITECTURE.md](./ARCHITECTURE.md)
> Read that first before making any non-trivial change.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Language | TypeScript (strict) |
| Build | Vite + @crxjs/vite-plugin |
| Extension | Chrome Manifest V3 |
| LLM | Ollama (local) via `POST /api/chat` |
| Testing | Vitest (node environment) |
| UI | Vanilla HTML/CSS/TS — no framework, rendered as an in-page floating panel (Shadow DOM), not a toolbar popup |

---

## Coding Conventions

### Error handling

Always use `AppError` with a typed `ErrorCode`. Never throw raw `Error` objects from provider or background code.

```typescript
// Good
throw new AppError(ErrorCode.TIMEOUT, getUserMessage(ErrorCode.TIMEOUT));

// Bad
throw new Error("timed out");
```

Use `toSummarizeFailure(error)` at message-handler boundaries to convert any unknown error to `{ code, message }`.

### Logging

Every file that logs must call `createLogger("scope")` at the top level. Use the returned helpers:

```typescript
const log = createLogger("my-scope");
log.info("Starting X", { key: value });
log.error("X failed", error, { context });
log.info("LLM call", { ...log.tokens(text.length) }); // logs chars + estimatedTokens
const end = log.time("my operation");  // call end() when done — logs durationMs
```

### Message type guards

Never compare `.type` directly. Always import and use the exported type guards:

```typescript
// Good
if (isAskFollowUpMessage(message)) { ... }

// Bad
if (message.type === "ASK_FOLLOW_UP") { ... }
```

### Config access

- **Static defaults** live in `src/configs/provider.ts` — edit for endpoint/model changes.
- **Runtime overrides** come from `chrome.storage.sync` via `getConfig()` in `src/shared/config.ts`.
- Never hardcode URLs, model names, or token limits inline. Reference `config.*` from `getConfig()`.

---

## Key Invariants

1. **`return true` in `onMessage`** — the Chrome service worker message listener must `return true` for every async handler to keep the worker alive until `sendResponse` is called.

2. **Content script guard** — `src/content/index.ts` uses `window.__condenseAIContentScriptLoaded` to prevent double-registration when both the manifest auto-injects and the background injects dynamically.

3. **Extraction via bridge only** — never call `chrome.tabs.sendMessage` directly for page extraction. Use `dispatchExtractionRequest` + `waitForPageExtraction` from `extractionBridge.ts`.

4. **URL candidates** — `getOllamaBaseUrlCandidates` returns both `localhost` and `127.0.0.1` variants. The provider tries each in order; use this helper rather than a hardcoded single URL.

5. **Compressed follow-up history** — `conversationHistory` stored in the panel must never contain the full raw page text. Use `buildFollowUpMessages` which stores only title + summary (~200 tokens).

6. **No `chrome.tabs.*` from content-script/panel code** — `src/panel/` and `src/content/` run in the page's content-script context, which has no `chrome.tabs` API. The panel gets its `tabId` from the `TOGGLE_PANEL` message (set by `chrome.action.onClicked` in the background) and reads `location.href` directly for the URL. Never add a `chrome.tabs.query` call to panel code.

7. **One active job per tab** — the background keeps a cancelable `activeJobs` map keyed by `tabId` (`src/background/index.ts`). Tabs run in parallel; starting a new summarize/follow-up in the *same* tab cancels that tab's prior job; `CANCEL_JOB` includes `tabId` and only aborts that tab. Pass each job's `AbortController`/`signal` into provider calls. Persist panel state only via `commitPopupSession` (or equivalent: check `isCurrentJob`, stamp `jobId`, undo if ownership is lost mid-write) so a cancelled/superseded job can never resurrect a session the user already cleared — including the early `loading` write, not just `done`/`error`.

8. **`chrome.storage.session` for content scripts** — the floating panel runs in an untrusted content-script context. On service-worker startup the background must call `chrome.storage.session.setAccessLevel({ accessLevel: "TRUSTED_AND_UNTRUSTED_CONTEXTS" })` (already in `background/index.ts`). Do not remove that call, or the panel will throw "Access to storage is not allowed from this context." Session state is **per tab** via `sessionKeyForTab(tabId)` (`popupState:<tabId>`); never use a single global key for panel UI state.

---

## Common Tasks

### Adding a new LLM provider (e.g. OpenAI)

1. Add `"openai"` to `ProviderType` in `src/configs/provider.ts`
2. Create `src/providers/openai.ts` implementing `SummarizerProvider` (`summarize` + `askFollowUp`)
3. Add `case "openai": return new OpenAIProvider(config);` in `src/providers/index.ts`
4. Change `type: "openai"`, `baseUrl`, and `apiKey` in `src/configs/provider.ts`

### Adding a new message type

1. Add the constant to `MessageType` in `src/shared/messages.ts`
2. Add the message interface
3. Add a type guard function (`isXxxMessage`)
4. Handle it in `background/index.ts` `onMessage` listener with `return true` if async

### Changing the summarization prompt

Edit `SYSTEM_PROMPT` or `buildChatMessages` in `src/shared/prompt.ts`.
For follow-up context, edit `buildFollowUpMessages`.

### Changing UI labels

Edit `src/configs/ui.ts`. Most strings are applied by `applyUiConfig()` in `panel/panelController.ts` on init; the reset/minimize/close header labels are read directly by `panel/panelTemplate.ts` when it renders.

### Changing panel appearance (position, drag, minimize, close)

Edit `src/panel/panel.css` for styling (the `:host` rule controls the fixed position/size) and `src/panel/panelView.ts` for drag/minimize/close behavior. The markup itself lives in `src/panel/panelTemplate.ts`.

### Adding a cancelable background pipeline

Accept the `ActiveJob` (or its `controller.signal`) from `startJob(tabId)` in `background/index.ts`, pass the signal into any provider call via `SummarizeOptions.signal`/`FollowUpOptions.signal`, and persist results with `commitPopupSession` (check `isCurrentJob`, stamp `jobId`, undo if superseded mid-write) — never a bare `savePopupSession` at the end of a pipeline.

### Running tests

```bash
npm test           # unit tests
npm run typecheck  # tsc --noEmit
npm run verify     # typecheck + tests + production build (also run by git pre-commit)
```

Tests live in `tests/` and use Vitest (`vitest.config.ts`, separate from the CRX Vite build; `pool: "vmThreads"` — do not switch to `forks`/`threads` on Windows without re-running the suite). Chrome APIs are mocked via `tests/chromeMock.ts` where needed. Full `background/index.ts` orchestration and panel drag/UI chrome are out of unit scope — they are guarded by `npm run build` and the contracts covered by message/error/provider/session/panelController tests.

After `npm install`, Husky installs a **pre-commit** hook that runs `npm run verify`. Do not bypass it with `--no-verify` unless explicitly asked.
---

## What NOT to Do

- Do NOT call `chrome.tabs.sendMessage` directly for extraction — use `extractionBridge`.
- Do NOT skip type guards when handling `chrome.runtime.onMessage` messages.
- Do NOT send full page text in follow-up `conversationHistory` — this wastes ~3,000 tokens per request.
- Do NOT hardcode `"localhost"` or `"127.0.0.1"` — use `getOllamaBaseUrlCandidates`.
- Do NOT forget `return true` in async `onMessage` handlers — the service worker will be killed before `sendResponse` is called.
- Do NOT throw outside of `AppError` in provider code — callers rely on `error instanceof AppError` checks.
- Do NOT call `chrome.tabs.query`/`chrome.tabs.*` from `src/panel/` or `src/content/` — that API is unavailable in content-script context. Get `tabId` from the message that opened the panel and read `location.href` for the URL.
- Do NOT write to `chrome.storage.session` from a background pipeline with a bare `savePopupSession` — use `commitPopupSession` (or the same check/`jobId`/undo pattern) so a cancelled job cannot resurrect a cleared session.
- Do NOT use a single global `popupState` key or a single global `activeJob` — sessions and jobs are per `tabId` so parallel tabs do not cancel or overwrite each other.
