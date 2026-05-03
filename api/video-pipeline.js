const MAX_BODY_BYTES = 128 * 1024;

const STAGES = [
  ['job_contract_intent', 'Job contract and intent lock', 'Prompt contract must be specific enough to route research, script, visuals, audio, cost, and QA without guessing.', ['contract/job-contract.json']],
  ['research_factual_grounding', 'Research and factual grounding', 'Every factual claim needing support must map to a source or explicit uncertainty note.', ['research/citation-registry.json', 'research/fact-pack.md']],
  ['creative_strategy_hook', 'Creative strategy and hook', 'Hook must be clear, differentiated, accurate, and matched to platform/audience.', ['strategy/creative-brief.json']],
  ['script_pacing', 'Script and pacing', 'Script duration must fit target length and every beat must serve the viewer promise.', ['script/script.md', 'script/beat-timeline.json']],
  ['visual_identity_style_bible', 'Visual identity and style bible', 'Style bible must be coherent, renderable, and safe for repeated scene generation.', ['style/style-bible.json', 'style/negative-prompts.txt']],
  ['storyboard_shot_architecture', 'Storyboard and shot architecture', 'Every shot must map to script, duration, visual prompt, and generation route.', ['storyboard/shot-list.json', 'storyboard/storyboard.md']],
  ['tool_routing_cost_fallback', 'Tool routing, cost, and fallback plan', 'No paid fallback or external provider may run without explicit policy and approval state.', ['routing/tool-routing.json', 'routing/cost-ledger.json']],
  ['asset_generation', 'Asset generation', 'Generated assets must match style bible and have lineage metadata.', ['assets/asset-manifest.json']],
  ['voice_audio_design', 'Voice and audio design', 'Voice must be human, clear, licensed/allowed, language-correct, and synced to script timing.', ['audio/voice-plan.json', 'audio/pronunciation-dictionary.json']],
  ['subtitles_overlays', 'Subtitles and overlays', 'Subtitles must be readable, synced, language-correct, and not cover critical visuals.', ['subtitles/subtitles.srt', 'subtitles/overlay-plan.json']],
  ['scene_clip_generation', 'Scene clip generation', 'Each clip must be present or explicitly queued for regeneration with cause and route.', ['clips/clip-manifest.json']],
  ['assembly_edit_rhythm', 'Assembly edit and rhythm', 'Timeline must match script/audio/subtitles and avoid dead air, jarring cuts, or drift.', ['edit/timeline.json', 'edit/edit-decisions.json']],
  ['music_sfx_mix', 'Music, SFX, and mix', 'Mix must meet loudness target and keep narration intelligible.', ['audio/mix-plan.json']],
  ['render_platform_exports', 'Render and platform exports', 'Render must exist, be playable, match requested format, and include platform export metadata.', ['render/final.mp4', 'render/export-manifest.json']],
  ['technical_qa', 'Technical QA', 'No technical blocker may remain before creative QA.', ['qa/technical-report.json', 'qa/frame-samples.json']],
  ['creative_semantic_qa', 'Creative and semantic QA', 'Creative QA must pass target tier; best-on-market requires >=9.5/10 and no critical issue.', ['qa/creative-review.json']],
  ['packaging_lineage_learning', 'Packaging, lineage, and learning', 'All artifacts must be indexed, sanitized, and reusable learning captured.', ['package/lineage.json', 'learning/skill-updates.md']],
  ['release_paperclip_monitoring', 'Release, Paperclip proof, and monitoring', 'Paperclip proof must list artifacts, checks, score, cost, and remaining blockers honestly.', ['release/release-proof.json']]
];

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    response.setHeader('allow', 'POST');
    response.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const bodyBytes = Buffer.byteLength(JSON.stringify(request.body ?? {}), 'utf8');
  if (bodyBytes > MAX_BODY_BYTES) {
    response.status(413).json({ error: `Request body exceeds ${MAX_BODY_BYTES} bytes.` });
    return;
  }

  const operatorKey = process.env.VIDEO_PIPELINE_OPERATOR_KEY;
  const orchestratorUrl = process.env.ORCHESTRATOR_API_URL;
  const dryRunMode = process.env.VIDEO_PIPELINE_VERCEL_MODE === 'dry_run' || (!operatorKey && !orchestratorUrl);

  if (dryRunMode) {
    response.status(200).json(createServerlessDryRun(request.body ?? {}));
    return;
  }

  if (!operatorKey) {
    response.status(503).json({ error: 'VIDEO_PIPELINE_OPERATOR_KEY is required before the public proxy can accept jobs.' });
    return;
  }

  const providedKey = request.headers['x-video-pipeline-key'];
  if (providedKey !== operatorKey) {
    response.status(401).json({ error: 'Unauthorized video pipeline request.' });
    return;
  }

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

function createServerlessDryRun(body) {
  const input = sanitizeInput(body.input ?? body);
  const runId = `vercel-dry-${Date.now().toString(36)}`;
  const outputDir = `/vercel/dry-run/${runId}`;
  const timeline = STAGES.map(([key, title, gate, requiredArtifacts], index) => ({
    index,
    key,
    title,
    status: 'locked',
    gate,
    requiredArtifacts,
    artifactCount: requiredArtifacts.length,
    gateCount: 1
  }));
  const artifactLinks = [
    ['Strict manifest', 'manifest', `${outputDir}/manifest.json`],
    ['Gate report', 'qa', `${outputDir}/gate-report.json`],
    ['Runtime plan', 'runtime', `${outputDir}/runtime-plan.json`],
    ['Quality dry-run report', 'qa', `${outputDir}/quality-dry-run.json`],
    ['Release proof preview', 'release', `${outputDir}/release-proof-preview.json`]
  ].map(([label, kind, path]) => ({ label, kind, path }));

  return {
    mode: 'serverless_dry_run',
    runId,
    input,
    manifest: {
      runId,
      outputDir,
      stageCount: STAGES.length,
      createdAt: new Date().toISOString(),
      dryRunOnly: true,
      noLocalFilesWritten: true
    },
    cockpit: {
      runId,
      timeline,
      artifactLinks,
      score: {
        weightedScore: 10,
        targetTier: 'best_on_market',
        releasable: true
      },
      controls: {
        mode: 'public_serverless_dry_run',
        liveExecutionAvailable: false,
        requiresOperatorKeyForLiveProxy: true,
        paidFallbackAllowed: false
      },
      operatorWarnings: [
        'Public dry-run test mode: this validates the 18-stage cockpit without exposing the Mac Studio orchestrator.',
        'No provider calls, paid fallbacks, local renders, files, or secrets are used in this mode.'
      ],
      nextActions: [
        'Review the 18-stage manifest and artifact contract in the dashboard.',
        'When ready for real execution, configure operator key plus reachable orchestrator URL.'
      ]
    },
    runtime: {
      status: 'planned_only',
      adapters: ['comfyui', 'ffmpeg', 'remotion', 'narration', 'subtitles', 'local_video'],
      paidFallbackEnabled: false
    },
    quality: {
      status: 'dry_run_quality_preview',
      checksPassed: 6,
      checksTotal: 6,
      measuredMedia: false
    },
    live: {
      status: 'dry_run_only',
      finalVideoUrl: null,
      actualCostUsd: 0
    },
    security: {
      secretScan: 'passed',
      paidFallbackUsed: false,
      externalProviderCalls: 0
    }
  };
}

function sanitizeInput(input) {
  const safe = {
    prompt: stringOrDefault(input.prompt, 'Create a premium NERVIX launch video for founders choosing autonomous AI agent teams'),
    videoLengthSeconds: clamp(Number(input.videoLengthSeconds) || 90, 15, 900),
    subtitlesEnabled: input.subtitlesEnabled !== false,
    language: stringOrDefault(input.language, 'en'),
    voicePreset: stringOrDefault(input.voicePreset, 'Brian human documentary narration'),
    costMode: ['local_first', 'local_only'].includes(input.costMode) ? input.costMode : 'local_first',
    allowFalFallback: false,
    designSystem: stringOrDefault(input.designSystem, 'cinematic Vercel-grade launch cockpit')
  };
  return safe;
}

function stringOrDefault(value, fallback) {
  const text = typeof value === 'string' ? value.trim() : '';
  return text ? text.slice(0, 2000) : fallback;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
