/** Minimal local types for the experimental WebMCP API.
 *
 * WebMCP is progressively enhanced: browsers without the API keep using the
 * normal editor, while supporting browsers can discover and invoke these
 * page-local tools.
 */
export interface WebMCPTextContent {
  type: 'text';
  text: string;
}

export interface WebMCPToolResult {
  content: WebMCPTextContent[];
}

export interface WebMCPTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations?: {
    readOnlyHint?: boolean;
    destructiveHint?: boolean;
    idempotentHint?: boolean;
    openWorldHint?: boolean;
    untrustedContentHint?: boolean;
  };
  execute: (input: unknown) => WebMCPToolResult | Promise<WebMCPToolResult>;
}

export interface WebMCPModelContext {
  registerTool: (tool: WebMCPTool, options?: { signal?: AbortSignal }) => Promise<void>;
}

export function webMcpResult(value: unknown): WebMCPToolResult {
  return {
    content: [{
      type: 'text',
      text: typeof value === 'string' ? value : JSON.stringify(value) ?? 'null',
    }],
  };
}

export function webMcpError(message: string): WebMCPToolResult {
  return webMcpResult({ error: message });
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function stringInput(input: unknown, key: string, maxLength: number): string | null {
  if (!isRecord(input)) return null;
  const value = input[key];
  return typeof value === 'string' && value.length <= maxLength ? value : null;
}

export function optionalNumberInput(input: unknown, key: string, min: number, max: number): number | undefined {
  if (!isRecord(input) || input[key] === undefined) return undefined;
  const value = input[key];
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max
    ? value
    : undefined;
}

export function stringArrayInput(input: unknown, key: string, maxItems: number, maxItemLength: number): string[] | null {
  if (!isRecord(input) || !Array.isArray(input[key]) || input[key].length > maxItems) return null;
  const values: unknown[] = input[key];
  return values.every(value => typeof value === 'string' && value.length <= maxItemLength)
    ? values.filter((value): value is string => typeof value === 'string')
    : null;
}
