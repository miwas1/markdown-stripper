# WebMCP Challenge submission kit

This file is a working submission sheet. Replace the demo-video `TODO`, verify the live deployment, and freeze the submitted version before the deadline.

## Submission fields

- Project name: `MarkDown Stripper`
- Live URL: <https://markdown-stripper.site>
- Public code repository: <https://github.com/miwas1/markdown-stripper>
- Demo video: `TODO — publish a public YouTube video under 3:00 with narration`
- Authentication: none required
- Language: English
- License: MIT; keep `LICENSE` visible in the repository root and select MIT in GitHub’s repository settings/About area

## Devpost description — paste-ready draft

### What we built

MarkDown Stripper is a local-first document handoff workspace for the moment before a document is shared with an AI agent. It imports Markdown and common document formats, cleans the structure, extracts references, runs optional OCR, and surfaces privacy findings without uploading the document. The person stays in the loop while an agent works with the same live page.

### Why WebMCP is a strong fit

Normal browser automation makes an agent guess which controls to click and how to interpret a document editor. WebMCP gives the agent narrow, typed operations that match the app’s real capabilities: read bounded document state, choose an output mode, inspect references, check handoff readiness, start a local privacy scan, and redact only reviewed finding IDs. The page registers 14 imperative tools on `document.modelContext` and keeps the ordinary editor fully usable when WebMCP is unavailable.

### What people and agents can do together

The person imports or pastes a document and can see every change. The agent can call `prepare_agent_handoff` to switch the visible output to AI-ready context and open Insights, then run the local privacy scan and call `get_handoff_readiness` to report what still needs human review. The person reviews findings, OCR warnings, references, and the output in the UI; after any redaction, the agent reruns the scan for the new version. The person then explicitly approves that exact version. Only after that checkpoint can the agent read paginated document content, request a copy, or start a local `.txt` download. This shared state and review-first workflow is difficult to achieve reliably with coordinate-based UI automation.

### Implementation

The app is a React/Vite SPA served by a Cloudflare Worker. The top-level React page registers a separately tested tool set and reuses the same state and actions as the human UI. Tool inputs use narrow JSON Schemas with application validation. Successful results are ordinary JSON values, failures reject, sensitive reads require an exact-state approval fingerprint, and content is cursor-paginated and marked untrusted. Conversion, OCR, deterministic safety rules, optional cancellable PII inference, and redaction run in the browser. Aggregate telemetry contains only allowlisted dimensions and never document text.

### Try it

Open the live URL in ChatGPT’s in-app browser, click **Sensitive HTML**, and ask:

> Prepare this document for an agent handoff, check readiness, and tell me what I should review. Do not share or export anything until I approve it.

## Demo video storyboard — target 2:30

Use a clean browser profile, show the live URL, record narration, and keep background music out of the video. The video must be public on YouTube and shorter than three minutes.

| Time | Screen action | Narration |
| --- | --- | --- |
| 0:00–0:15 | Open the live app and show the WebMCP workflow banner | “This is MarkDown Stripper: a private document handoff workspace. People keep control of the document while agents get precise tools for the same live page.” |
| 0:15–0:35 | Click Sensitive HTML; point to the converted output and extracted assets | “The human starts with a messy HTML export containing synthetic contact, billing, credential, and hidden-content examples. The app converts it locally, preserves useful structure, and extracts the reviewable signals.” |
| 0:35–0:55 | Open site-tools/inspector and show the registered tools | “WebMCP exposes typed operations instead of making an agent guess at buttons. There are read tools for state, output, assets, privacy findings, and handoff readiness.” |
| 0:55–1:15 | Ask the agent to prepare the handoff | “I ask the agent to prepare an agent handoff. It calls the page tool, switches the visible output to AI-ready context, appends references, and opens Insights.” |
| 1:15–1:35 | Start the local deep scan and call readiness | “The agent checks readiness without pulling the whole document first. The result reports whether the local privacy scan is complete and what the person should review.” |
| 1:35–1:55 | Show findings, redact one reviewed email or credential, and start the new-version scan | “The person reviews a stable finding ID. The agent can redact only that reviewed finding, and the page requires a fresh local scan for the changed document.” |
| 1:55–2:10 | Show clean readiness, then click the human approval button | “Once the new scan is clear, the person approves this exact visible version. Export remains blocked until that human checkpoint.” |
| 2:10–2:22 | Call `get_converted_text` with a bounded limit; show output | “Now the agent can request a bounded, clearly marked untrusted output for summarization or a next step.” |
| 2:22–2:30 | Show copy/download controls and privacy note | “The document never goes to telemetry or the model asset host. Humans and agents share the workflow, but the human keeps the final say.” |

## Judge test script

1. Open the live URL in ChatGPT’s in-app browser. If using Chrome, use version 149+ and enable `chrome://flags/#enable-webmcp-testing`.
2. Click `Sensitive HTML` for the full privacy demo, or click `Sample` / call `insert_sample_document` for the smaller baseline document.
3. Ask the agent to call `get_document_state`. Expected: structured lengths, mode, references, and scan status; no full document dump.
4. Ask the agent to call `prepare_agent_handoff`. Expected: visible mode becomes `AI-ready`, references are enabled, and Insights opens.
5. Ask the agent to call `get_handoff_readiness`. Expected: a checklist with `readiness`, `checks`, privacy counts, and next steps; no document text in the result.
6. Ask the agent to call `get_safety_findings`. Expected: stable IDs, severities, line numbers, and placeholders.
7. Ask the agent to redact one reviewed finding by ID. Expected: the visible editor changes and the document’s deep-scan status returns to review-needed.
8. Ask the agent to call `run_deep_privacy_scan`; the call remains pending until it completes or is cancelled. Call `get_safety_findings` again afterward.
9. Before approval, ask for `get_converted_text`. Expected: the execution rejects without returning content.
10. In Insights, click `Approve this version for agent access`; confirm the approval banner names this exact document version.
11. Ask for `get_converted_text` with `maxCharacters: 200`, then continue from `nextCursor` if present. Ask the agent to copy or download. Expected: bounded content and visible actions succeed only after approval.

## Rules and eligibility checklist

### Must complete manually before submitting

- [ ] Join/register for the hackathon on Devpost.
- [ ] Confirm the entrant is eligible: age of majority, supported country/territory, and no sponsor/judge/conflict restriction.
- [ ] Confirm any team has an authorized representative.
- [ ] Confirm all submission materials are in English.
- [ ] Confirm the current project is either new during the submission period or has a clearly documented, meaningful WebMCP extension after August 25, 2026.
- [ ] Commit and push the current WebMCP changes with dated history before submitting.
- [ ] Confirm the GitHub repository is public and the MIT license is visible/detectable at the top of the repository page.
- [ ] Confirm the live URL loads without credentials, paywall, or a temporary maintenance page.
- [ ] Test the exact live build in ChatGPT’s in-app browser and Chrome with WebMCP enabled.
- [ ] Record and publish the narrated YouTube demo under 3:00.
- [ ] Confirm the video contains no copyrighted music, unlicensed assets, or third-party trademarks.
- [ ] Paste the description, live URL, repository URL, and YouTube URL into Devpost.
- [ ] Save/submit before **September 3, 2026 at 1:00 PM PDT**.
- [ ] After submission, do not change the Devpost submission; freeze the submitted repo and live deployment through judging.

### Technical evidence in this repository

- [x] The top-level page passes `document.modelContext` to atomic imperative registration in `src/lib/webmcp-tools.ts`.
- [x] WebMCP is top-level imperative registration, which is discoverable by ChatGPT’s built-in browser.
- [x] Inputs use JSON Schemas and application-level validation.
- [x] Approved text/assets are cursor-paginated; untrusted content is marked in tool annotations.
- [x] Mutations reuse visible application actions and return verification metadata.
- [x] Local safety review precedes redaction and export in the documented workflow.
- [x] `LICENSE` is present and the project is intended to be open source.
- [x] Source, fixtures, model-asset instructions, tests, and build instructions are included.
- [x] `npm run check` covers TypeScript, unit tests, and the production build.

## Winning angle by judging criterion

| Criterion | Evidence to emphasize |
| --- | --- |
| WebMCP leverage | 14 useful tools, shared live React state, typed inputs, bounded/untrusted reads, a purpose-built handoff workflow, and visible mutations |
| Execution | One coherent path from import → clean output → local privacy review → human approval → export, with no account setup |
| Potential impact | Writers, researchers, support teams, students, and developers regularly need to clean and sanitize documents before using AI |
| Creativity & ambition | A privacy checkpoint and readiness contract for the agent-native web, not just a button wrapper around a converter |

## Final freeze checklist

- [ ] `npm run check` passes on the exact commit being submitted.
- [ ] `npm run build` output is deployed and the live URL shows the current WebMCP banner.
- [ ] The model asset CDN and OCR paths work from a clean browser profile.
- [ ] The demo script fits comfortably under 3:00 when spoken aloud.
- [ ] The final Devpost page is saved before the deadline.
- [ ] Record the final commit hash, deployment URL, video URL, and submission timestamp here or in the Devpost draft.
