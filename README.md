# MarkDown Stripper

MarkDown Stripper is a local-first document handoff workspace: people import messy Markdown or documents, while browser agents use WebMCP to inspect the same live editor, prepare structured AI context, surface privacy findings, and help complete the handoff.

## Hackathon submission snapshot

- Live app: <https://markdown-stripper.site>
- Public repository: <https://github.com/miwas1/markdown-stripper>
- Submission copy, demo script, and compliance checklist: [SUBMISSION.md](SUBMISSION.md)
- License: MIT ([LICENSE](LICENSE))
- Hosting: Cloudflare Workers + static assets

The demo should be opened in ChatGPT’s in-app browser, or in Google Chrome 149+ with `chrome://flags/#enable-webmcp-testing` enabled. Browsers without WebMCP still get the complete human editor.

No MCP server configuration is required: these are page-local WebMCP Site tools discovered while the page is open in a compatible built-in browser. The project does not currently expose a remote MCP endpoint for traditional MCP clients.

## The WebMCP use case

The difficult part of sharing a document with an agent is not only removing Markdown. It is deciding what the agent should see, preserving useful sources, and giving a person a clear privacy checkpoint before content leaves the editor.

MarkDown Stripper makes that a shared workflow:

1. A person pastes or imports Markdown, TXT, HTML, DOCX, PDF, or an image.
2. An agent reads the document status and prepares a handoff.
3. The page switches to AI-ready context and opens local Insights for the person.
4. The agent runs the optional local privacy scan and checks whether the handoff is ready, while the person reviews privacy findings, OCR warnings, references, and the visible output.
5. If anything is redacted, the scan is rerun for the new document version. The person then explicitly approves that exact version in Insights; only then can the agent read content-bearing results, copy text, or request a local TXT download.

For the full privacy handoff demo, click **Sensitive HTML** to load the built-in synthetic HTML document, then try this prompt:

> Please get this document ready to share with an AI assistant, check whether it is safe, and tell me what I need to review. Do not show, copy, download, or share the document until I approve it.

## Use it from the ChatGPT desktop app

MarkDown Stripper uses page-local WebMCP Site tools. You do not install an MCP server or paste a tool configuration into ChatGPT. ChatGPT discovers the tools while the live page is open in its built-in desktop browser. See the [official ChatGPT Site tools guide](https://learn.chatgpt.com/docs/webmcp).

### Before you start

- Use the latest ChatGPT desktop app and its built-in browser.
- Use a model that supports Site tools. The current OpenAI guide lists GPT-5.6 Sol and GPT-5.6 Terra; availability depends on account rollout and workspace settings.
- Site tools are not currently available in Enterprise or Edu workspaces.
- Use only the synthetic values in the built-in demo. Never paste real personal data, credentials, or private documents into a recording.

### Open the app and verify WebMCP

1. Start a new ChatGPT conversation in the desktop app.
2. Open the built-in browser from the ChatGPT toolbar.
3. Navigate to <https://markdown-stripper.site>.
4. Wait for the dark **Human + agent workflow** banner to show **14 tools ready**.
5. In the browser address bar, open **Site tools → Available site tools** to confirm that the tools belong to the MarkDown Stripper page.
6. Click **Sensitive HTML** in the page to load the synthetic document. This is the only setup click needed for the full demo.

Site tools are tied to the page that provides them, so keep the MarkDown Stripper tab open while ChatGPT works. If the tools are not visible, reload the page in the built-in browser and check that Site tools are enabled in the browser permissions.

### Ask ChatGPT to prepare the document

Send this prompt in the same ChatGPT conversation:

```text
Please inspect the document currently open in MarkDown Stripper and prepare it
for a safe handoff.

Set the output up as clear, AI-ready context, keep useful references, and open
the Insights panel. Run the local privacy check and tell me what it finds. For
each finding, include its ID, the kind of issue, its severity, line number, and
suggested placeholder so I can match it to the items in Insights.

Do not show the document's contents, copy anything, or download anything yet.
Only tell me what the human needs to review in the Insights panel. Choose the
page's available capabilities yourself; I do not need to name them.
```

ChatGPT should use the page tools and report structured results. The page should switch to **AI-ready**, open **Insights**, and show a readiness state of **Review**.

### Let the human choose what to redact

When ChatGPT lists the findings, match their type, severity, and line to the findings visible in **Insights**. Do not ask ChatGPT to redact everything automatically. Select only the items you want removed, click **Copy selected IDs**, and paste the copied list into ChatGPT with this request:

```text
I reviewed these exact items in the Insights panel. The IDs I selected are:
PASTE_COPIED_IDS_HERE

Please remove only those selected items from the document, then check the
updated document again and tell me whether anything else needs review. Do not
show, copy, download, or share document contents yet.
```

The button copies only the selected finding IDs, not the sensitive values. The visible editor should contain placeholders such as `[EMAIL_1]` or `[SECRET_1]`. Because the document changed, the previous approval must disappear and the scan must be run again.

### Approve, then allow the agent to read

After the scan is complete and readiness passes, review the visible AI-ready output and click **Approve this version for agent access** in Insights. The human must perform this step; ChatGPT cannot bypass the approval gate.

Then send:

```text
I approved this exact cleaned version in the Insights panel.

Please show me no more than 200 characters of the cleaned document. If there
is more to read, continue only when needed. Also give me the document's links
and other references, using a small default page size. Do not request more
content than necessary.
```

Only after approval should ChatGPT be able to read converted text, list content-bearing assets, copy the output, or start a local TXT download. Before approval, those operations should reject without returning document content.

### One-prompt recording version

For a short demo, load **Sensitive HTML** yourself, then send:

```text
Please inspect the document currently open in MarkDown Stripper, prepare it as
AI-ready context, run the local privacy check, and tell me which findings I
should review. Keep the document contents private. Do not redact, copy,
download, or share anything until I choose specific finding IDs and approve the
exact cleaned version in Insights.
```

Show ChatGPT’s tool activity when available, the changing page state, the blocked pre-approval read, the selected redaction, the fresh scan, and the final bounded read after human approval.

### If ChatGPT does not use the tools

- Confirm the live page is open in the ChatGPT desktop app’s built-in browser, not an ordinary browser tab or the ChatGPT web app.
- Confirm the banner says **14 tools ready** and the address bar lists **Available site tools**.
- Update the ChatGPT desktop app and select a supported model.
- Reload the page after changing models or browser permissions.
- Keep the page open; Site tools are page-scoped.
- If the page still has no Site tools, use the normal editor UI or test the WebMCP registration in Chrome with the WebMCP testing flag enabled.

## WebMCP tools

You can describe the result you want in ordinary language; the agent should choose the page capabilities it needs. The names below are technical reference documentation, not names you need to include in a prompt. All tools are registered imperatively on the top-level page with `document.modelContext.registerTool(...)`. Tool inputs are narrow JSON Schemas, document text is bounded, content-bearing results are marked untrusted, and mutations reuse the same React actions as the human UI.

| Tool | Type | Purpose |
| --- | --- | --- |
| `get_document_state` | Read | Current lengths, mode, imports, assets, and scan status |
| `get_converted_text` | Read | Approved converted output in cursor-based chunks |
| `list_document_assets` | Read | Approved links, images, emails, and references in bounded pages |
| `get_safety_findings` | Read | Bounded pages of content-free privacy finding IDs and severities |
| `get_handoff_readiness` | Read | Content-free readiness checklist before sharing |
| `set_document_content` | Write | Replace the visible editor content |
| `set_conversion_options` | Write | Select Plain, Readable, or AI-ready output |
| `prepare_agent_handoff` | Write | Set AI-ready mode, append references, open Insights |
| `run_deep_privacy_scan` | Write | Run the cancellable on-device PII scan to completion |
| `redact_document_findings` | Write | Replace explicitly reviewed finding IDs with placeholders |
| `copy_converted_text` | Write | Use the visible clipboard action |
| `download_converted_text` | Write | Start a local `.txt` download |
| `insert_sample_document` | Write | Load a judge-friendly demonstration document |
| `clear_document` | Write | Clear the visible document and derived state |

The implementation follows the current WebMCP shape: successful `execute` calls return ordinary JSON values, failures reject, titles label tools for browser UI, and registration is cancelled with `AbortController` when the page unmounts. Registration is atomic, content pages stay within a small response budget, and approval is bound to an exact state fingerprint. See [src/App.tsx](src/App.tsx), [src/lib/webmcp-tools.ts](src/lib/webmcp-tools.ts), and [src/lib/webmcp.ts](src/lib/webmcp.ts).

## Product capabilities

- Structure-aware Plain, Readable, and AI-ready conversion
- Local import for Markdown, TXT, HTML, DOCX, PDF, and common images
- Browser OCR for images and scanned PDF pages
- Local image redaction with OCR/PII suggestions, manual boxes, original-resolution PNG export, metadata stripping, and optional verification OCR
- Unicode-aware deterministic checks (including checksum-validated financial identifiers) plus an optional local PII model
- Snapshot-bound selective redaction with stable finding IDs, deterministic overlap handling, and consistent aliases for repeated values
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

- `src/App.tsx` — editor, Insights drawer, WebMCP runtime adapter, and registration lifecycle
- `src/lib/document/` — conversion, import, OCR, privacy, and handoff logic
- `src/lib/webmcp-tools.ts` — tool contracts, bounded pagination, approval enforcement, and atomic registration
- `src/lib/webmcp.ts` — tool input validation helpers; API declarations come from `webmcp-types`
- `manual-test/` — fixture set and full manual test plan
- `SUBMISSION.md` — Devpost-ready narrative, video storyboard, and final checklist
- `wrangler.jsonc` — Cloudflare Worker/static asset configuration

## Hackathon provenance

The converter, importers, OCR, and local privacy scan pre-date the challenge work. The WebMCP extension was added during the submission period and is the work being presented: page-local tool registration, structured agent/human handoff, bounded untrusted reads, privacy-aware mutations, and the judge-facing workflow documentation. Keep the dated Git history available when submitting so the meaningful WebMCP extension is easy to verify.

At this audit point, the dated WebMCP baseline is commit `c665ddc` (`2026-08-31 18:52 WAT`, `webmcp enabled`). Commit and push the final working-tree changes before submitting so the complete extension is part of the public history.

## License

MIT. See [LICENSE](LICENSE).
