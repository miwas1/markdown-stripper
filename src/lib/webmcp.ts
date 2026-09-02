/** Runtime validation helpers for WebMCP tool callbacks. */

export function toolError(message: string): never {
  throw new Error(message);
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

export function optionalIntegerInput(input: unknown, key: string, min: number, max: number): number | undefined {
  const value = optionalNumberInput(input, key, min, max);
  return value !== undefined && Number.isInteger(value) ? value : undefined;
}

export function stringArrayInput(input: unknown, key: string, maxItems: number, maxItemLength: number): string[] | null {
  if (!isRecord(input) || !Array.isArray(input[key]) || input[key].length > maxItems) return null;
  const values: unknown[] = input[key];
  return values.every(value => typeof value === 'string' && value.length <= maxItemLength)
    ? values.filter((value): value is string => typeof value === 'string')
    : null;
}
