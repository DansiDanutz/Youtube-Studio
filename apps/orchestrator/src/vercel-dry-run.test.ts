import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { test } from 'node:test';

type MockResponse = {
  statusCode: number;
  headers: Record<string, string>;
  payload: unknown;
  status(code: number): MockResponse;
  setHeader(name: string, value: string): void;
  json(value: unknown): void;
  send(value: unknown): void;
};

function createResponse(): MockResponse {
  return {
    statusCode: 200,
    headers: {},
    payload: undefined,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    setHeader(name: string, value: string) {
      this.headers[name.toLowerCase()] = value;
    },
    json(value: unknown) {
      this.payload = value;
    },
    send(value: unknown) {
      this.payload = value;
    }
  };
}

async function loadHandler(): Promise<(request: unknown, response: MockResponse) => Promise<void>> {
  const moduleUrl = pathToFileURL(`${process.cwd()}/api/video-pipeline.js`).href;
  const mod = await import(`${moduleUrl}?test=${Date.now()}-${Math.random()}`);
  return mod.default;
}

test('Vercel API supports safe serverless dry-run without operator key or orchestrator URL', async () => {
  const previousOperatorKey = process.env.VIDEO_PIPELINE_OPERATOR_KEY;
  const previousOrchestratorUrl = process.env.ORCHESTRATOR_API_URL;
  const previousMode = process.env.VIDEO_PIPELINE_VERCEL_MODE;
  delete process.env.VIDEO_PIPELINE_OPERATOR_KEY;
  delete process.env.ORCHESTRATOR_API_URL;
  process.env.VIDEO_PIPELINE_VERCEL_MODE = 'dry_run';

  try {
    const handler = await loadHandler();
    const response = createResponse();
    await handler({
      method: 'POST',
      headers: {},
      body: {
        input: {
          prompt: 'Create a premium NERVIX launch video',
          videoLengthSeconds: 45,
          subtitlesEnabled: true,
          language: 'en',
          voicePreset: 'Brian human documentary narration',
          costMode: 'local_first',
          allowFalFallback: false,
          designSystem: 'cinematic Vercel-grade launch cockpit'
        }
      }
    }, response);

    assert.equal(response.statusCode, 200);
    const payload = response.payload as any;
    assert.equal(payload.mode, 'serverless_dry_run');
    assert.equal(payload.manifest.stageCount, 18);
    assert.equal(payload.cockpit.timeline.length, 18);
    assert.equal(payload.cockpit.score.weightedScore, 10);
    assert.equal(payload.cockpit.score.releasable, true);
    assert.equal(payload.live.status, 'dry_run_only');
    assert.equal(payload.security.paidFallbackUsed, false);
    assert.equal(payload.security.secretScan, 'passed');
  } finally {
    if (previousOperatorKey === undefined) delete process.env.VIDEO_PIPELINE_OPERATOR_KEY;
    else process.env.VIDEO_PIPELINE_OPERATOR_KEY = previousOperatorKey;
    if (previousOrchestratorUrl === undefined) delete process.env.ORCHESTRATOR_API_URL;
    else process.env.ORCHESTRATOR_API_URL = previousOrchestratorUrl;
    if (previousMode === undefined) delete process.env.VIDEO_PIPELINE_VERCEL_MODE;
    else process.env.VIDEO_PIPELINE_VERCEL_MODE = previousMode;
  }
});

test('dashboard labels default public test mode in English', async () => {
  const { readFile } = await import('node:fs/promises');
  const html = await readFile(`${process.cwd()}/apps/dashboard/index.html`, 'utf8');
  assert.match(html, /Public dry-run test mode/i);
  assert.match(html, /No operator key required for dry-run preview/i);
});
