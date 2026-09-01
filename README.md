# MarkDown Stripper

MarkDown Stripper is a local-first document handoff workspace: people import messy Markdown or documents, while browser agents use WebMCP to inspect the same live editor, prepare structured AI context, surface privacy findings, and help complete the handoff.

## Hackathon submission snapshot

- Live app: <https://markdown-stripper.site>
- Public repository: <https://github.com/miwas1/markdown-stripper>
- Submission copy, demo script, and compliance checklist: [SUBMISSION.md](SUBMISSION.md)
- License: MIT ([LICENSE](LICENSE))
- Hosting: Cloudflare Workers + static assets

The demo should be opened in ChatGPT’s in-app browser, or in Google Chrome 149+ with `chrome://flags/#enable-webmcp-testing` enabled. Browsers without WebMCP still get the complete human editor.

## The WebMCP use case

The difficult part of sharing a document with an agent is not only removing Markdown. It is deciding what the agent should see, preserving useful sources, and giving a person a clear privacy checkpoint before content leaves the editor.

MarkDown Stripper makes that a shared workflow:

1. A person pastes or imports Markdown, TXT, HTML, DOCX, PDF, or an image.
2. An agent reads bounded document state and calls `prepare_agent_handoff`.
3. The page switches to AI-ready context and opens local Insights for the person.
4. The agent runs the optional local privacy scan and checks `get_handoff_readiness`, while the person reviews privacy findings, OCR warnings, references, and the visible output.
5. If anything is redacted, the scan is rerun for the new document version. The person then explicitly approves that exact version in Insights; only then can the agent request a copy or local TXT download.

Try this prompt after inserting the sample document:

> Prepare this document for an agent handoff, check readiness, and tell me what I should review. Do not share or export anything until I approve it.

## WebMCP tools

All tools are registered imperatively on the top-level page with `document.modelContext.registerTool(...)`. Tool inputs are narrow JSON Schemas, document text is bounded, content-bearing results are marked untrusted, and mutations reuse the same React actions as the human UI.

| Tool | Type | Purpose |
| --- | --- | --- |
| `get_document_state` | Read | Current lengths, mode, imports, assets, and scan status |
| `get_converted_text` | Read | Bounded converted output for agent review |
| `list_document_assets` | Read | Links, images, emails, and broken references |
| `get_safety_findings` | Read | Stable local privacy finding IDs and severities |
| `get_handoff_readiness` | Read | Content-free readiness checklist before sharing |
| `set_document_content` | Write | Replace the visible editor content |
| `set_conversion_options` | Write | Select Plain, Readable, or AI-ready output |
| `prepare_agent_handoff` | Write | Set AI-ready mode, append references, open Insights |
| `run_deep_privacy_scan` | Write | Start the optional on-device PII scan |
| `redact_document_findings` | Write | Replace explicitly reviewed finding IDs with placeholders |
| `copy_converted_text` | Write | Use the visible clipboard action |
| `download_converted_text` | Write | Start a local `.txt` download |
| `insert_sample_document` | Write | Load a judge-friendly demonstration document |
| `clear_document` | Write | Clear the visible document and derived state |

The implementation follows the current WebMCP shape: `execute` returns ordinary JSON-serializable values, `title` labels tools for browser UI, and registration is cancelled with `AbortController` when the page unmounts. See [src/App.tsx](src/App.tsx) and [src/lib/webmcp.ts](src/lib/webmcp.ts).

## Product capabilities

- Structure-aware Plain, Readable, and AI-ready conversion
- Local import for Markdown, TXT, HTML, DOCX, PDF, and common images
- Browser OCR for images and scanned PDF pages
- Unicode-aware deterministic checks (including checksum-validated financial identifiers) plus an optional local PII model
- Snapshot-bound selective redaction with stable finding IDs, deterministic overlap handling, and consistent aliases for repeated values
- Local semantic duplicate detection
- Link, image, email, and reference extraction
- Clipboard, TXT, and DOCX export
- No document text is sent to the usage telemetry endpoint or model asset host

## Local development

```bash
npm install
npm run dev
```

Then open <http://localhost:3000>. To test site tools, use the ChatGPT desktop app’s built-in browser or enable WebMCP in Chrome, reload the page, and inspect the registered tools with Chrome DevTools or the Model Context Tool Inspector.

## Verification and deployment

```bash
npm run check       # TypeScript, unit tests, and production build
npm run deploy:dry  # Build and validate a Wrangler deployment without publishing
npm run deploy      # Build and deploy to Cloudflare
```

The Worker serves the Vite build from `dist/` and keeps `/api/usage` limited to allowlisted aggregate dimensions. Model and OCR capability files are pinned and served from the separate public model asset origin; uploaded documents remain in the browser.

## Repository map

- `src/App.tsx` — editor, Insights drawer, and WebMCP registration
- `src/lib/document/` — conversion, import, OCR, privacy, semantic, and handoff logic
- `src/lib/webmcp.ts` — local WebMCP types, validation helpers, and result helpers
- `manual-test/` — fixture set and full manual test plan
- `SUBMISSION.md` — Devpost-ready narrative, video storyboard, and final checklist
- `wrangler.jsonc` — Cloudflare Worker/static asset configuration

## Hackathon provenance

The converter, importers, OCR, local privacy scan, and semantic insights pre-date the challenge work. The WebMCP extension was added during the submission period and is the work being presented: page-local tool registration, structured agent/human handoff, bounded untrusted reads, privacy-aware mutations, and the judge-facing workflow documentation. Keep the dated Git history available when submitting so the meaningful WebMCP extension is easy to verify.

At this audit point, the dated WebMCP baseline is commit `c665ddc` (`2026-08-31 18:52 WAT`, `webmcp enabled`). Commit and push the final working-tree changes before submitting so the complete extension is part of the public history.

## License

MIT. See [LICENSE](LICENSE).
