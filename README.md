# CondenseAI

A Chrome extension that condenses any webpage into concise summaries using a **local AI model** via [Ollama](https://ollama.com). All processing happens on your machine — no data is sent to external APIs.

## Features

- Floating **panel** injected into the page — draggable, minimizable, closable, and stays put while you browse
- One-click **Summarize** button that extracts readable page content (menus, ads, and scripts stripped when possible)
- Generates 5–8 bullet-point summaries via Ollama, with a 120 s abort timeout
- **Reset** button always available — cancels any in-flight summarize/follow-up request and clears the conversation
- Configurable provider architecture (Ollama today, extensible later)

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

## Usage

1. Open any webpage with readable content
2. Click the extension icon in the toolbar — a floating panel appears on the page (drag its header to reposition it)
3. Click **Summarize**
4. Wait for the summary (5–8 bullets) to appear in the panel
5. Use the header buttons to **reset** (cancels the request and clears the conversation), **minimize** (collapses to just the header), or **close** (removes the panel — click the toolbar icon again to reopen it)

## Development

```bash
npm install         # also installs the git pre-commit hook (Husky)
npm run dev         # Vite dev server with HMR — reload extension after changes
npm run build       # Production build to dist/
npm run typecheck   # TypeScript only
npm test            # Unit tests (Vitest)
npm run verify      # typecheck + tests + build (same as pre-commit)
```

A **pre-commit hook** runs `npm run verify` so type errors, failing unit tests, or a broken extension build cannot be committed silently. Do not skip hooks (`--no-verify`) unless you have an explicit reason.
## Configuration

Settings are stored in `chrome.storage.sync` under the key `appConfig`. Defaults:

| Key | Default |
|-----|---------|
| `provider` | `ollama` |
| `ollamaBaseUrl` | `http://127.0.0.1:11434` |
| `model` | `llama3.1` |
| `maxInputChars` | `8000` |
| `requestTimeoutMs` | `120000` |

To change settings from the browser console (extension service worker context or via storage):

```js
chrome.storage.sync.set({
  appConfig: {
    model: "mistral",
    maxInputChars: 8000,
  },
});
```

Partial updates are merged with defaults on next use.

## Troubleshooting

| Problem | Solution |
|---------|----------|
| "Ollama isn't running" / "Cannot reach Ollama" | Start Ollama from the Start menu / Applications (or `ollama serve`), then **reload the extension** at `chrome://extensions` |
| "Model not found" | Pull the model: `ollama pull llama3.1` |
| "This page has no readable content" | Page may be empty or image-only |
| "Can't summarize this type of page" | `chrome://`, `edge://`, and extension pages are restricted |
| Summary is slow | Large pages are truncated; try a shorter article or faster model |
