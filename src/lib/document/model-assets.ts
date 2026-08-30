/** Public, cacheable capability files. Document content is never sent here. */
export const MODEL_ASSET_ORIGIN = (
  import.meta.env.VITE_MODEL_ASSET_ORIGIN || 'https://models.markdown-stripper.site'
).replace(/\/$/, '');

export const TRANSFORMERS_REMOTE_HOST = `${MODEL_ASSET_ORIGIN}/huggingface/`;
export const TESSERACT_WORKER_PATH = `${MODEL_ASSET_ORIGIN}/tesseract/6.0.1/worker.min.js`;
export const TESSERACT_CORE_PATH = `${MODEL_ASSET_ORIGIN}/tesseract-core/6.1.2`;
export const TESSERACT_LANGUAGE_PATH = `${MODEL_ASSET_ORIGIN}/tessdata/4.0.0_best_int`;
