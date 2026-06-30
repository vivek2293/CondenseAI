# CondenseAI

A Chrome extension that condenses any webpage into concise summaries using a **local AI model** via [Ollama](https://ollama.com). All processing happens on your machine — no data is sent to external APIs.

## Features

- One-click **Summarize** button in the extension popup
- Extracts readable page content (menus, ads, and scripts stripped when possible)
- Generates 5–8 bullet-point summaries via Ollama
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
2. Click the extension icon in the toolbar
3. Click **Summarize**
4. Wait for the summary (5–8 bullets) to appear in the popup

## Development

```bash
npm run dev    # Vite dev server with HMR — reload extension after changes
npm run build  # Production build to dist/
npm test       # Run unit tests
```

## Configuration

Settings are stored in `chrome.storage.sync` under the key `appConfig`. Defaults:

| Key | Default |
|-----|---------|
| `provider` | `ollama` |
| `ollamaBaseUrl` | `http://127.0.0.1:11434` |
| `model` | `llama3.1` |
| `maxInputChars` | `12000` |
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
| "Ollama isn't running" / "Cannot reach Ollama" | Start Ollama: `ollama serve`, then **reload the extension** at `chrome://extensions` |
| "Model not found" | Pull the model: `ollama pull llama3.1` |
| "This page has no readable content" | Page may be empty or image-only |
| "Can't summarize this type of page" | `chrome://`, `edge://`, and extension pages are restricted |
| Summary is slow | Large pages are truncated; try a shorter article or faster model |
