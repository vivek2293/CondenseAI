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
| UI | Vanilla HTML/CSS/TS — no framework |

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

5. **Compressed follow-up history** — `conversationHistory` stored in the popup must never contain the full raw page text. Use `buildFollowUpMessages` which stores only title + summary (~200 tokens).

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

Edit `src/configs/ui.ts`. All strings are applied by `applyUiConfig()` in `popup/main.ts` on init.

### Running tests

```bash
npm test
```

Tests live in `tests/` and use Vitest. They import from `src/` directly (no Chrome APIs needed — mocked where necessary).

---

## What NOT to Do

- Do NOT call `chrome.tabs.sendMessage` directly for extraction — use `extractionBridge`.
- Do NOT skip type guards when handling `chrome.runtime.onMessage` messages.
- Do NOT send full page text in follow-up `conversationHistory` — this wastes ~3,000 tokens per request.
- Do NOT hardcode `"localhost"` or `"127.0.0.1"` — use `getOllamaBaseUrlCandidates`.
- Do NOT forget `return true` in async `onMessage` handlers — the service worker will be killed before `sendResponse` is called.
- Do NOT throw outside of `AppError` in provider code — callers rely on `error instanceof AppError` checks.
