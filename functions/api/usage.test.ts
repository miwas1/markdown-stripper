import assert from 'node:assert/strict';
import test from 'node:test';
import { onRequestPost } from './usage';

function makeContext(body: string, origin = 'https://markdown-stripper.site') {
  const points: AnalyticsEngineDataPoint[] = [];
  const context = {
    request: new Request('https://markdown-stripper.site/api/usage', {
      method: 'POST',
      headers: { origin, 'content-type': 'application/json' },
      body,
    }),
    functionPath: '/api/usage',
    waitUntil: () => undefined,
    passThroughOnException: () => undefined,
    next: async () => new Response(null, { status: 404 }),
    env: {
      USAGE_ANALYTICS: { writeDataPoint: point => points.push(point ?? {}) },
      ASSETS: { fetch },
    },
    params: {},
    data: {},
  };
  return { context, points };
}

test('records only allowlisted aggregate dimensions', async () => {
  const { context, points } = makeContext(JSON.stringify({
    event: 'document_import',
    feature: 'import',
    variant: 'pdf',
    sizeBucket: 'small',
    outcome: 'success',
    filename: 'private.pdf',
  }));

  const response = await onRequestPost(context as never);
  assert.equal(response.status, 204);
  assert.deepEqual(points, [{
    indexes: ['document_import'],
    blobs: ['document_import', 'import', 'pdf', 'small', 'success'],
    doubles: [1],
  }]);
});

test('rejects unknown dimensions and cross-origin submissions', async () => {
  const unknown = makeContext(JSON.stringify({ event: 'page_view', variant: 'private-value' }));
  assert.equal((await onRequestPost(unknown.context as never)).status, 400);
  assert.equal(unknown.points.length, 0);

  const crossOrigin = makeContext(JSON.stringify({ event: 'page_view' }), 'https://example.com');
  assert.equal((await onRequestPost(crossOrigin.context as never)).status, 403);
  assert.equal(crossOrigin.points.length, 0);
});
