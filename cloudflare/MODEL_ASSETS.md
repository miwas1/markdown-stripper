# Model asset CDN

The browser downloads public capability files from `models.markdown-stripper.site`. Documents and extracted text are never sent to this hostname.

## Provisioning

1. Authenticate Wrangler with the Cloudflare account that owns `markdown-stripper.site`.
2. Run `npm run r2:create` once (skip this if the bucket already exists).
3. Run `npm run r2:cors`.
4. Run `npm run r2:sync`. This downloads pinned, quantized browser artifacts into a temporary directory, uploads them with immutable cache metadata, and deletes the temporary copies.
5. In **R2 > markdown-stripper-models > Settings > Custom Domains**, connect `models.markdown-stripper.site`.
6. In **Caching > Cache Rules**, create a rule for hostname `models.markdown-stripper.site`: mark responses eligible for cache, respect the origin's one-year TTL, and do not cache 4xx/5xx responses.
7. Purge the hostname cache after changing its CORS policy. Do not overwrite pinned paths; update the revision in both the source and sync script instead.

Before publishing a new artifact, retain its upstream license/notice requirements and verify that redistribution is permitted. The currently selected Hugging Face models advertise Apache-2.0 licenses.

To use a different hostname in a preview build, set `VITE_MODEL_ASSET_ORIGIN` before running Vite.

When local bandwidth is constrained, deploy the temporary authenticated importer Worker described in the operations runbook, export `SYNC_WORKER_URL` and `SYNC_TOKEN`, then run `npm run r2:sync:edge`. The laptop submits only small transfer jobs; the Worker streams each upstream artifact directly into R2.
