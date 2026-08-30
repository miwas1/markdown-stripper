import assert from 'node:assert/strict';
import test from 'node:test';
import { handleUsageRequest } from './worker';

function makeRequest(body: string, origin = 'https://markdown-stripper.site'): Request {
  return new Request('https://markdown-stripper.site/api/usage', {
    method: 'POST',
    headers: { origin, 'content-type': 'application/json' },
    body,
  });
}

function makeEnv(points: AnalyticsEngineDataPoint[]): Env {
  return {
    USAGE_ANALYTICS: {
      writeDataPoint: point => points.push(point ?? {}),
    },
  };
}

test('records only allowlisted aggregate dimensions', async () => {
  const points: AnalyticsEngineDataPoint[] = [];
  const request = makeRequest(JSON.stringify({
    event: 'document_import',
    feature: 'import',
    variant: 'pdf',
    sizeBucket: 'small',
    outcome: 'success',
    filename: 'private.pdf',
  }));

  const response = await handleUsageRequest(request, makeEnv(points));
  assert.equal(response.status, 204);
  assert.deepEqual(points, [{
    indexes: ['document_import'],
    blobs: ['document_import', 'import', 'pdf', 'small', 'success', 'none'],
    doubles: [1],
  }]);
});

test('records an allowlisted button click without visible button text', async () => {
  const points: AnalyticsEngineDataPoint[] = [];
  const request = makeRequest(JSON.stringify({
    event: 'button_click',
    button: 'export_docx',
  }));

  const response = await handleUsageRequest(request, makeEnv(points));
  assert.equal(response.status, 204);
  assert.deepEqual(points[0], {
    indexes: ['button_click'],
    blobs: ['button_click', 'none', 'none', 'none', 'none', 'export_docx'],
    doubles: [1],
  });
});

test('rejects unknown dimensions and cross-origin submissions', async () => {
  const points: AnalyticsEngineDataPoint[] = [];
  const env = makeEnv(points);

  const unknown = makeRequest(JSON.stringify({ event: 'page_view', variant: 'private-value' }));
  assert.equal((await handleUsageRequest(unknown, env)).status, 400);
  assert.equal(points.length, 0);

  const unknownButton = makeRequest(JSON.stringify({ event: 'button_click', button: 'Delete my document' }));
  assert.equal((await handleUsageRequest(unknownButton, env)).status, 400);
  assert.equal(points.length, 0);

  const missingButton = makeRequest(JSON.stringify({ event: 'button_click' }));
  assert.equal((await handleUsageRequest(missingButton, env)).status, 400);
  assert.equal(points.length, 0);

  const crossOrigin = makeRequest(JSON.stringify({ event: 'page_view' }), 'https://example.com');
  assert.equal((await handleUsageRequest(crossOrigin, env)).status, 403);
  assert.equal(points.length, 0);
});
