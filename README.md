# CondenseAI

A Chrome extension that turns any webpage into a concise summary using a **local AI model** via [Ollama](https://ollama.com). Everything runs on your machine — no data ever leaves your computer.

## Features

**Floating panel**
- A small panel appears on the page when you click the toolbar icon — drag it anywhere, minimize it out of the way, or close it entirely
- Reopening the panel restores your previous summary and conversation without re-summarizing

**One-click summarization**
- Click **Summarize** and get a clean 5–8 bullet-point summary of the page in seconds
- Page clutter (ads, menus, navigation) is stripped before summarizing

**Follow-up questions**
- After a summary appears, ask any question about the page in the text box below it
- The AI answers in context — it remembers the summary and all previous questions in the session
- Ask as many follow-up questions as you like; the conversation thread grows as you go

**Always in control**
- The **Reset** button immediately cancels any in-progress request and clears the conversation
- Works across multiple tabs independently — summarizing one tab never affects another
- If you navigate away or reopen the panel, your last summary and Q&A thread are still there

**Private by design**
- All AI processing runs locally via Ollama — no cloud APIs, no telemetry, no accounts

---

## Prerequisites

- [Google Chrome](https://www.google.com/chrome/)
- [Node.js](https://nodejs.org/) 18+
- [Ollama](https://ollama.com/download) installed and running

Pull the default model:

```bash
ollama pull llama3.1
```

Ensure Ollama is serving (it usually starts automatically):

```bash
ollama serve
```

---

## Setup

```bash
npm install
npm run build
```

Load the extension in Chrome:

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select the `dist` folder from this project

---

## Usage

1. Open any webpage with readable content
2. Click the **CondenseAI** icon in the toolbar — a floating panel appears
3. Click **Summarize** and wait for the bullet-point summary
4. Type a question in the **"Ask a follow-up"** box and press **Enter** (or ➤)
5. Use the header buttons to **Reset**, **Minimize**, or **Close** the panel

---

## Development

```bash
npm install         # also installs the git pre-commit hook (Husky)
npm run dev         # Vite dev server with HMR — reload extension after changes
npm run build       # Production build to dist/
npm run typecheck   # TypeScript only
npm test            # Unit tests (Vitest)
npm run verify      # typecheck + tests + build (same as pre-commit)
```

A **pre-commit hook** runs `npm run verify` so type errors, failing unit tests, or a broken build cannot be committed silently.

---

## Configuration

Settings are stored in `chrome.storage.sync` under the key `appConfig`. Defaults:

| Key | Default |
|-----|---------|
| `provider` | `ollama` |
| `ollamaBaseUrl` | `http://127.0.0.1:11434` |
| `model` | `llama3.1` |
| `maxInputChars` | `8000` |
| `requestTimeoutMs` | `120000` |

To change settings from the browser console (service worker context):

```js
chrome.storage.sync.set({
  appConfig: {
    model: "mistral",
    maxInputChars: 8000,
  },
});
```

Partial updates are merged with defaults on next use.

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| "Ollama isn't running" / "Cannot reach Ollama" | Start Ollama (`ollama serve`), then **reload the extension** at `chrome://extensions` |
| "Model not found" | Pull the model: `ollama pull llama3.1` |
| "This page has no readable content" | Page may be empty or image-only |
| "Can't summarize this type of page" | `chrome://`, `edge://`, and extension pages are restricted |
| Summary is slow | Try a shorter article or a faster model |
| Follow-up feels off-topic | Hit **Reset** and re-summarize to start a fresh conversation |
