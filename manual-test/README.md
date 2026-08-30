# MarkDown Stripper manual test pack

This pack exercises the production application end to end. All names, credentials, addresses, and contact details in these fixtures are fictional and intentionally invalid.

## Before testing

1. Open `https://markdown-stripper.site` in a private/incognito window.
2. Open browser DevTools, select **Network**, enable **Preserve log**, and filter for `models.markdown-stripper.site`.
3. Keep this folder open in your file manager so fixtures can be dragged into the page.
4. Record results in [RESULTS.md](RESULTS.md). Use Chrome or Edge first; repeat the mobile section in a phone browser.

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
3. Confirm exact findings appear for the fake email, phone number, IP address, API key, JWT, hidden HTML comment, invisible character, prompt-injection phrases, and encoded-looking value.
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

## 6. Semantic duplicate detection

1. Paste [fixtures/04-semantic-passages.txt](fixtures/04-semantic-passages.txt).
2. Open **Insights → Semantic Insights** and click **Enable semantic insights**.
3. Confirm model requests use `models.markdown-stripper.site`.
4. Wait for completion and confirm at least one likely-similar paragraph pair is displayed with a percentage.
5. Confirm the unrelated weather and accounting paragraphs are not the strongest pair.
6. Edit one duplicate paragraph substantially and rerun. Confirm matches/scores update.

## 7. Text, Markdown, and HTML imports

Drag each file onto the upload area, one at a time:

- [fixtures/05-plain-text.txt](fixtures/05-plain-text.txt): confirm plain lines import unchanged.
- [fixtures/01-comprehensive-markdown.md](fixtures/01-comprehensive-markdown.md): confirm Markdown is loaded and converted.
- [fixtures/06-import.html](fixtures/06-import.html): confirm headings, paragraphs, emphasis, lists, table, blockquote, code, link, and image become usable Markdown before conversion; scripts/styles must not appear.

Also test the **Upload** button instead of drag-and-drop once.

## 8. DOCX and selectable PDF imports

1. Upload [fixtures/07-import.docx](fixtures/07-import.docx). Confirm its headings, paragraphs, list text, email, and link appear. Review any importer warnings.
2. Upload [fixtures/08-selectable-text.pdf](fixtures/08-selectable-text.pdf). Confirm text from both pages appears in page order.
3. Confirm a warning notes that PDF columns/complex tables may not preserve reading order.

## 9. Image OCR

1. Upload [fixtures/09-ocr-english.png](fixtures/09-ocr-english.png).
2. Confirm an OCR-available panel appears, English is selected/defaulted, and the privacy message says processing stays local.
3. Start OCR. Confirm Tesseract worker/core/language requests use `models.markdown-stripper.site`.
4. Confirm progress advances and the output includes `MARKDOWN STRIPPER OCR TEST`, `Invoice QA-2048`, and `Total 127.45` with reasonable accuracy.
5. Upload [fixtures/10-ocr-french.png](fixtures/10-ocr-french.png), manually select French, and run OCR. Confirm it recognizes most of `Bonjour`, `confidentialité`, and `référence FR-731`.
6. Run English OCR again. Confirm cached assets make startup faster.

## 10. Scanned PDF OCR

1. Upload [fixtures/11-scanned-image.pdf](fixtures/11-scanned-image.pdf).
2. Confirm the importer warns that the page has no selectable text and offers OCR.
3. Run English OCR and confirm the same English test phrases are recovered.
4. Cancel once during OCR, verify the UI returns to a usable state, then retry successfully.

## 11. Errors and limits

1. Upload [fixtures/12-unsupported.csv](fixtures/12-unsupported.csv). Confirm a clear unsupported-file error appears.
2. Generate a file over the limit with `node generate-fixtures.mjs --oversized`, then upload `fixtures/13-over-30mb.txt`. Confirm the 30 MB limit error. Delete that large file afterward.
3. Temporarily switch DevTools Network to **Offline**, clear site data, and enable a model feature. Confirm a useful retryable error appears rather than a crash.
4. Restore **Online**, click Retry, and confirm recovery.
5. Paste an empty string or click Clear. Confirm output, findings, semantic matches, OCR state, import name, and warnings reset.

## 12. Mobile and slow-network behavior

1. Use a real phone or DevTools responsive mode at 375 × 812.
2. Throttle to **Slow 4G** for the first model run.
3. Confirm controls remain reachable, progress text does not overflow, and Insights works as a full-width drawer.
4. Cancel a model operation and retry.
5. Reload and confirm cached repeat use is substantially faster.
6. Rotate to landscape and verify editors/drawers remain usable.

## 13. Privacy network check

With fixture 02 loaded, inspect Network requests:

- Document text and fixture contents must not appear in request URLs or request bodies.
- `/api/usage` may receive aggregate event metadata only.
- Model and OCR requests must contain capability files only.
- No request should upload the document to the model asset domain.

## Completion criteria

Testing passes when every section is recorded, all core workflows finish without uncaught errors, model/OCR artifacts load from the custom CDN, repeat model use is cached, exports open correctly, and no document content leaves the browser.
