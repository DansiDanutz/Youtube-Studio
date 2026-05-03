const MAX_BODY_BYTES = 128 * 1024;

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    response.setHeader('allow', 'POST');
    response.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const operatorKey = process.env.VIDEO_PIPELINE_OPERATOR_KEY;
  if (!operatorKey) {
    response.status(503).json({ error: 'VIDEO_PIPELINE_OPERATOR_KEY is required before the public proxy can accept jobs.' });
    return;
  }

  const providedKey = request.headers['x-video-pipeline-key'];
  if (providedKey !== operatorKey) {
    response.status(401).json({ error: 'Unauthorized video pipeline request.' });
    return;
  }

  const bodyBytes = Buffer.byteLength(JSON.stringify(request.body ?? {}), 'utf8');
  if (bodyBytes > MAX_BODY_BYTES) {
    response.status(413).json({ error: `Request body exceeds ${MAX_BODY_BYTES} bytes.` });
    return;
  }

  const orchestratorUrl = process.env.ORCHESTRATOR_API_URL;
  if (!orchestratorUrl) {
    response.status(503).json({
      error: 'ORCHESTRATOR_API_URL is not configured. Point it to the Hermes/OpenClaw orchestrator /video-pipeline/runs endpoint host.'
    });
    return;
  }

  const upstream = await fetch(`${orchestratorUrl.replace(/\/$/, '')}/video-pipeline/strict-runs`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(request.body)
  });
  const text = await upstream.text();
  response.status(upstream.status);
  response.setHeader('content-type', upstream.headers.get('content-type') || 'application/json; charset=utf-8');
  response.send(text);
}
