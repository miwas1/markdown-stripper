# MarkDown Stripper manual test pack

This pack exercises the production application end to end. All names, credentials, addresses, and contact details in these fixtures are fictional and intentionally invalid.

## Before testing

1. Open `https://markdown-stripper.site` in a private/incognito window.
2. Open browser DevTools, select **Network**, enable **Preserve log**, and filter for `models.markdown-stripper.site`.
3. Keep this folder open in your file manager so fixtures can be dragged into the page.
4. Record results in [RESULTS.md](RESULTS.md). Use Chrome or Edge first; repeat the mobile section in a phone browser.

For the WebMCP tests, use ChatGPT’s in-app browser, or Google Chrome 149+ with `chrome://flags/#enable-webmcp-testing` enabled and Chrome relaunched. Use the deployed URL for the final challenge check so the production headers and model-asset paths are included. A normal browser without WebMCP must still pass the human-editor sections.

## 0. WebMCP agent workflow and challenge smoke test

This is the priority test for the newly added challenge work. It verifies tool discovery, shared page state, bounded results, local privacy review, human approval, and the progressive-enhancement fallback.

### 0.1 Verify WebMCP discovery and progressive enhancement

1. Open the deployed app in ChatGPT’s in-app browser. In Chrome, enable the WebMCP flag, relaunch, and reload the deployed URL.
2. Confirm the dark **Human + agent workflow** banner appears near the top of the page. In a compatible browser it should say **14 tools ready**; the footer should say **Agent tools: ready**.
3. Confirm the visible **Connect your agent** section explains that no MCP JSON/server configuration is required, shows the current browser discovery status, distinguishes page-local WebMCP from a remote MCP server, and links to the official Site tools guide.
4. Open the Model Context Tool Inspector or the browser’s WebMCP tool inspector. Confirm these 14 tools are registered once:

   - Read tools: `get_document_state`, `get_converted_text`, `list_document_assets`, `get_safety_findings`, `get_handoff_readiness`.
   - Write tools: `set_document_content`, `set_conversion_options`, `prepare_agent_handoff`, `run_deep_privacy_scan`, `redact_document_findings`, `copy_converted_text`, `download_converted_text`, `insert_sample_document`, `clear_document`.

5. Inspect at least one tool definition. Confirm it has a useful `title`, description, JSON Schema, and only current WebMCP annotations (`readOnlyHint` and, for content-bearing reads, `untrustedContentHint`).
6. In DevTools → Network, inspect the document response headers. Confirm `Origin-Agent-Cluster: ?1` and `Permissions-Policy: ... tools=(self)` are present.
7. Open the same URL in a browser with WebMCP disabled or unavailable. Confirm the footer reports **Agent tools: browser unavailable**, the editor remains usable, and conversion/copy/import still work.

Expected: the page registers imperative tools on the top-level `document.modelContext`; WebMCP is an enhancement, not a requirement for human use.

### 0.2 Test read tools, bounds, and ordinary JSON results

1. In the compatible browser, call `get_document_state` with `{}`. Confirm it returns structured lengths, counts, conversion mode, import state, and scan statuses. It must not return the full Markdown document.
2. Click **Sample** or call `insert_sample_document` with `{}`. Immediately call `get_document_state` again and confirm the state reflects the sample, including reference/asset and safety-finding counts.
3. Before approval, call `list_document_assets` and `get_converted_text`. Confirm both executions reject without returning document-bearing content.
4. Call `get_safety_findings` with `{}`. Confirm it returns at most two content-free findings with stable IDs, types, severities, lines, placeholders, and a `nextCursor` when another page exists.
5. Continue `get_safety_findings` with its `nextCursor` and confirm pages do not repeat or skip findings.
6. Call `get_handoff_readiness` with `{}`. Confirm it returns a content-free checklist with `readiness`, `checks`, `privacy`, `document`, and `nextSteps`; it must not contain a `text` field.
7. Confirm successful tool results are ordinary JSON objects such as `{ "updated": true }`, not an MCP server envelope such as `{ "content": [...] }`; invalid calls must reject rather than resolve to `{ "error": ... }`.

Expected: reads are bounded and easy for an agent to verify without dumping the document into the conversation.

### 0.3 Test the complete human + agent handoff

Use the sample document or [fixtures/02-safety-and-pii.txt](fixtures/02-safety-and-pii.txt) so the privacy review is visible. Do not use real personal information or credentials.

1. Start from **Clear**. Call `set_document_content` with a short Markdown document containing a fictional email and link. Immediately call `get_document_state`; confirm the new content and derived counts are visible while detailed content remains approval-gated.
2. Call `prepare_agent_handoff` with `{ "appendReferences": true }`. Confirm the visible mode changes to **AI-ready**, references are enabled, Insights opens, and the result tells the agent to call `get_handoff_readiness`.
3. Call `get_handoff_readiness`. Confirm it reports **review**, explains that the local scan or privacy review is still needed, and reports `humanApprovalGranted: false`.
4. Call `run_deep_privacy_scan` with `{}`. Confirm the invocation remains pending while the visible scan runs and resolves with `status: "complete"`, a local-model finding count, and runtime. Call `get_safety_findings` after completion.
5. Review the finding IDs with the human. Call `redact_document_findings` with one explicit reviewed ID, for example `{ "findingIds": ["<id-from-get_safety_findings>"] }`.
6. Confirm the visible editor changes, the selected value becomes a placeholder, approval is reset, and the document’s deep-scan status requires a fresh scan. The schema must reject `redactAll` and unknown IDs.
7. Run `run_deep_privacy_scan` again for the changed document. Wait for the invocation to resolve, then call `get_safety_findings` and confirm no unintended findings remain.
8. When the output is AI-ready, the current scan is complete, there are no remaining findings, and there are no broken references, call `get_handoff_readiness`. Confirm `contentChecksPass: true` but `humanApprovalGranted: false`; the UI should offer **Approve this version for agent access**.
9. Before clicking the approval button, call `get_converted_text`, `list_document_assets`, `copy_converted_text`, and `download_converted_text`. Confirm each rejects with a clear human-approval error and returns or exports no document-bearing content.
10. Have the human review the visible output and click **Approve this version for agent access** in Insights. Confirm the UI says **Approved for this exact document version** and the readiness result becomes `readiness: "ready"` / `agentHandoffReady: true`.
11. Call `get_converted_text` with `{"maxCharacters": 40}`. Confirm the chunk is at most 40 characters, then continue from `nextCursor`. Call `list_document_assets` and follow its `nextCursor`; confirm each page has at most two items and long fields are explicitly truncated. Then call `copy_converted_text` or `download_converted_text` and confirm the visible action succeeds.
12. Change the document, conversion mode, references option, or privacy findings. Confirm approval disappears immediately and content reads, copy, and download are blocked until the new fingerprint is reviewed.

Expected: the agent can inspect and prepare the page, while a human reviews and explicitly approves the exact version before export.

### 0.4 Test WebMCP input validation and cancellation

1. Call `set_document_content` without `text`, with a non-string, or with more than 200,000 characters. Confirm a clear validation error and no partial update.
2. Call `set_conversion_options` with an invalid mode, a non-boolean `appendReferences`, or an empty object. Confirm a validation error.
3. Call `prepare_agent_handoff` with a non-object or non-boolean `appendReferences`. Confirm a validation error.
4. Call `redact_document_findings` with missing/empty `findingIds`, an unknown ID, or the removed `redactAll` property. Confirm the call is rejected without changing the editor.
5. Start a deep scan, then cancel the still-pending tool execution from the inspector. Confirm it rejects with cancellation, the worker stops, the page returns to a usable state, and a later retry works. Repeat with the visible **Cancel** action.
6. Simulate or observe any registration failure and confirm the UI never claims “14 tools ready” for a partial tool set. Reload and confirm all tools register once without duplicate-name errors.

## 1. Basic live conversion and counters

1. Click **Clear** if the editor is not empty.
2. Open [fixtures/01-comprehensive-markdown.md](fixtures/01-comprehensive-markdown.md), select all, and paste it into the input editor.
3. Confirm output appears without pressing a Convert button.
4. Confirm the word and character counters are non-zero and change when you type another word.
5. In **Readable** mode, confirm headings, emphasis markers, blockquote markers, list markers, and inline link syntax are removed while readable text remains.
6. Confirm the table becomes tab-separated readable rows.
7. Confirm inline and reference-style links retain their labels.
8. Switch to **Plain**. Confirm maximum formatting cleanup and no Markdown fence markers.
9. Switch to **AI-ready**. Confirm useful structured context, including code fences/table structure, is retained.
10. Toggle **References** off and on. Confirm the References and Media sections disappear and return.

Expected: conversion is immediate; no text is uploaded to the model asset hostname.

## 2. Insights: links, images, email, and broken references

1. Keep fixture 01 loaded and open **Insights**.
2. Confirm the drawer lists links, the image URL, and `qa.person@example.test`.
3. Confirm duplicate links are deduplicated.
4. Confirm `missing-doc` is reported as a broken reference.
5. Close and reopen the drawer. On a narrow viewport, confirm the backdrop closes it and the page does not scroll horizontally.

## 3. Clipboard and exports

1. Click **Copy** and paste into a temporary text editor. Confirm it exactly matches visible converted output.
2. Click the TXT export button. Open `converted-text.txt` and compare it with visible output.
3. Click the DOCX export button. Open `converted-document.docx`; confirm every output line appears and no Markdown markers were reintroduced.
4. Repeat after switching conversion mode to ensure exports follow the currently visible result.

## 4. Quick safety scan and redaction

1. Replace the editor contents with [fixtures/02-safety-and-pii.txt](fixtures/02-safety-and-pii.txt).
2. Open **Insights → Safety & Privacy**.
3. Confirm exact findings appear for the fake email, phone numbers, IPv4/IPv6 and MAC addresses, checksum-valid card and IBAN test values, SSN-shaped value, assigned/connection-string secrets, API key, JWT, hidden HTML comment, invisible character, prompt-injection phrases, and encoded-looking value.
4. Select only the fake email and phone findings, then click **Redact**.
5. Confirm they become numbered placeholders such as `[EMAIL_1]` and `[PHONE_1]`; unrelated text remains unchanged.
6. Click **Select all**, redact, and confirm invisible characters are removed while other categories receive placeholders.

Expected: this fixture contains no real credentials. Never test with genuine secrets or personal information.

## 5. Deep local PII model and CDN

1. Reload the page in a private window so the browser model cache starts empty.
2. Paste [fixtures/03-deep-pii.txt](fixtures/03-deep-pii.txt).
3. After the page becomes idle, confirm the compact model begins downloading in the background, then open Insights and click **Run deep scan**.
4. In DevTools Network, confirm requests go to `models.markdown-stripper.site`, not `huggingface.co`.
5. Confirm the background model request completes before the scan is started.
6. Confirm the UI reports compatibility/WASM mode.
7. Review contextual findings for fictional names/address/identity details. Exact results can vary; the feature must finish without an error.
8. Click **Scan again**; confirm it starts much faster and model files come from browser cache or return `304`/memory cache/disk cache.
9. Select one Local AI finding and redact it.
10. Confirm the redaction invalidates the previous deep-scan result. Run **Scan again**, wait for **Deep scan complete**, and confirm the handoff readiness card reflects the changed document.

## 6. Text, Markdown, and HTML imports

Drag each file onto the upload area, one at a time:

- [fixtures/05-plain-text.txt](fixtures/05-plain-text.txt): confirm plain lines import unchanged.
- [fixtures/01-comprehensive-markdown.md](fixtures/01-comprehensive-markdown.md): confirm Markdown is loaded and converted.
- [fixtures/06-import.html](fixtures/06-import.html): confirm headings, paragraphs, emphasis, lists, table, blockquote, code, link, and image become usable Markdown before conversion; scripts/styles must not appear.

Also test the **Upload** button instead of drag-and-drop once.

## 7. DOCX and selectable PDF imports

1. Upload [fixtures/07-import.docx](fixtures/07-import.docx). Confirm its headings, paragraphs, list text, email, and link appear. Review any importer warnings.
2. Upload [fixtures/08-selectable-text.pdf](fixtures/08-selectable-text.pdf). Confirm text from both pages appears in page order.
3. Confirm a warning notes that PDF columns/complex tables may not preserve reading order.

## 8. Image OCR

1. Upload [fixtures/09-ocr-english.png](fixtures/09-ocr-english.png).
2. Confirm the image-redaction preview appears immediately, before OCR, and the privacy message says processing stays local.
3. Enable **Draw manually**, drag over `Invoice QA-2048`, disable drawing, and toggle **Preview result**. Confirm the selected region becomes a solid black preview and can be removed/re-added without changing the source image.
4. Confirm an OCR-available panel appears and English is selected/defaulted. Start OCR and confirm Tesseract worker/core/language requests use `models.markdown-stripper.site`.
5. Confirm progress advances and the output includes `MARKDOWN STRIPPER OCR TEST`, `Invoice QA-2048`, and `Total 127.45` with reasonable accuracy. The redaction workspace should now report its mapped privacy-suggestion state without moving the manual box.
6. Export the redacted PNG. Confirm it uses the source basename with `-redacted.png`, opens at the original pixel dimensions, contains opaque black pixels over the selected region, and has no EXIF/GPS metadata.
7. Click **Verify exported image locally**. Confirm a second OCR pass finishes and reports whether any privacy findings or selected values remain readable.
8. Edit the extracted OCR text. Confirm automatic coordinate boxes are hidden as stale while manual boxes remain; click **Run OCR again** to refresh the mapping.
9. Upload [fixtures/10-ocr-french.png](fixtures/10-ocr-french.png), manually select French, and run OCR. Confirm it recognizes most of `Bonjour`, `confidentialité`, and `référence FR-731`.
10. Run English OCR again. Confirm cached assets make startup faster.

## 9. Scanned PDF OCR

1. Upload [fixtures/11-scanned-image.pdf](fixtures/11-scanned-image.pdf).
2. Confirm the importer warns that the page has no selectable text and offers OCR.
3. Run English OCR and confirm the same English test phrases are recovered.
4. Cancel once during OCR, verify the UI returns to a usable state, then retry successfully.

## 10. Errors and limits

1. Upload [fixtures/12-unsupported.csv](fixtures/12-unsupported.csv). Confirm a clear unsupported-file error appears.
2. Generate a file over the limit with `node generate-fixtures.mjs --oversized`, then upload `fixtures/13-over-30mb.txt`. Confirm the 30 MB limit error. Delete that large file afterward.
3. Temporarily switch DevTools Network to **Offline**, clear site data, and enable a model feature. Confirm a useful retryable error appears rather than a crash.
4. Restore **Online**, click Retry, and confirm recovery.
5. Paste an empty string or click Clear. Confirm output, findings, OCR state, import name, and warnings reset.

## 11. Mobile and slow-network behavior

1. Use a real phone or DevTools responsive mode at 375 × 812.
2. Throttle to **Slow 4G** for the first model run.
3. Confirm controls remain reachable, progress text does not overflow, and Insights works as a full-width drawer.
4. Cancel a model operation and retry.
5. Reload and confirm cached repeat use is substantially faster.
6. Rotate to landscape and verify editors/drawers remain usable.

## 12. Privacy network check

With fixture 02 loaded, inspect Network requests:

- Document text and fixture contents must not appear in request URLs or request bodies.
- `/api/usage` may receive aggregate event metadata only.
- Model and OCR requests must contain capability files only.
- No request should upload the document to the model asset domain.
- WebMCP tool calls must not create a direct document-upload request from the page. After explicit approval, `get_converted_text` hands bounded page-produced text to the browser agent as the requested tool result.

## Completion criteria

Testing passes when every section is recorded, all 14 WebMCP tools are discoverable and callable in a compatible browser, the exact-fingerprint approval gate blocks premature content reads and export, cancellation stops a pending deep scan, response pages stay bounded, the post-redaction scan is rerun, all core workflows finish without uncaught errors, model/OCR artifacts load from the custom CDN, repeat model use is cached, exports open correctly, and the page sends no document content to telemetry or model-asset endpoints.
