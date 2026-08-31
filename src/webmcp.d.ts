import type { WebMCPModelContext } from './lib/webmcp';

declare global {
  interface Document {
    modelContext?: WebMCPModelContext;
  }
}

export {};
