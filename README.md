# MarkDown Stripper

Browser-based Markdown cleanup with local document import, OCR, privacy scanning, and WebMCP tools.

## WebMCP

On a browser with WebMCP enabled, the page registers tools on `document.modelContext` so an agent can work with the same visible editor state as a human. The tools are progressive enhancement; the normal editor remains available in unsupported browsers.

Registered tools include:

- `get_document_state` and `get_converted_text` for bounded reads
- `set_document_content` and `set_conversion_options` for editor control
- `list_document_assets` and `get_safety_findings` for structured insights
- `run_deep_privacy_scan` and `redact_document_findings` for local privacy workflows
- `copy_converted_text`, `download_converted_text`, `clear_document`, and `insert_sample_document`

The tool registrations reuse the app's existing React actions, validate inputs, return structured text results, and clean up with `AbortSignal` when the page unmounts.

## Local development

```bash
npm install
npm run dev
```

To test WebMCP in Chrome, enable `chrome://flags/#enable-webmcp-testing`, relaunch Chrome, and open the local app. The Model Context Tool Inspector extension or Chrome DevTools can then discover and invoke the registered tools.

## Build and deploy

```bash
npm run lint
npm test
npm run build
npm run deploy
```

The Cloudflare Worker serves the Vite build from `dist/`; API usage telemetry remains at `/api/usage`.
