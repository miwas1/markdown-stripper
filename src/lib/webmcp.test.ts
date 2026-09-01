import assert from 'node:assert/strict';
import test from 'node:test';
import { webMcpError, webMcpResult } from './webmcp';

test('WebMCP helpers return ordinary JSON-serializable tool values', () => {
  const result = webMcpResult({ updated: true, count: 2 });
  assert.deepEqual(result, { updated: true, count: 2 });
  assert.deepEqual(webMcpError('No document'), { error: 'No document' });
  assert.doesNotThrow(() => JSON.stringify(result));
});
