import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { type AddressInfo } from "node:net";
import { resolve } from "node:path";
import { type BriefInput, DomainError } from "../../../packages/domain/src/index.js";
import { createControlPlane, type ReviewDecisionInput } from "./control-plane.js";
import {
  createStrictVideoPipelineManifest,
  createVideoPipelineManifest,
  createVideoPipelineQualityPlan,
  createVideoPipelineRuntimePlan,
  executeVideoPipelineLiveRun,
  executeVideoPipelineQualityDryRun,
  executeVideoPipelineRuntimeDryRun,
  writeStrictVideoPipelineArtifacts,
  writeVideoPipelineArtifacts,
  type StrictVideoPipelineInput,
  type VideoPipelineInput
} from "../../../packages/pipeline/src/index.js";
import { createVideoPipelineCockpitPayload } from "./video-cockpit.js";

const MAX_JSON_BODY_BYTES = 128 * 1024;

interface StartServerOptions {
  rootDir?: string;
  host?: string;
  port?: number;
}

export interface OrchestratorServer {
  server: Server;
  host: string;
  port: number;
  rootDir: string;
  close(): Promise<void>;
}

export async function startOrchestratorServer(options: StartServerOptions = {}): Promise<OrchestratorServer> {
  const rootDir = resolve(options.rootDir ?? process.cwd());
  const host = options.host ?? "127.0.0.1";
  const port = options.port ?? 0;
  const controlPlane = createControlPlane(rootDir);

  const server = createServer(async (request, response) => {
    try {
      const method = request.method ?? "GET";
      const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);

      if (method === "GET" && url.pathname === "/health") {
        return sendJson(response, 200, { ok: true });
      }

      if (method === "GET" && url.pathname === "/roadmap-status") {
        return sendJson(response, 200, controlPlane.getRoadmapStatus());
      }

      if (method === "POST" && url.pathname === "/runs") {
        const body = (await readJsonBody(request)) as {
          brief?: BriefInput;
          mode?: "deterministic" | "provider";
          openAiModel?: string | null;
        };

        if (!body.brief) {
          return sendJson(response, 400, { error: "Request body must include `brief`." });
        }

        const submission = await controlPlane.submitRun(body.brief, {
          mode: body.mode,
          openAiModel: body.openAiModel
        });
        return sendJson(response, 201, {
          ...submission,
          run: controlPlane.getRun(submission.runId)?.run ?? null
        });
      }

      if (method === "POST" && url.pathname === "/video-pipeline/runs") {
        const body = (await readJsonBody(request)) as { input?: VideoPipelineInput };
        if (!body.input?.prompt) {
          return sendJson(response, 400, { error: "Request body must include `input.prompt`." });
        }
        const manifest = createVideoPipelineManifest(body.input);
        const artifacts = writeVideoPipelineArtifacts(rootDir, manifest);
        return sendJson(response, 201, { manifest, artifacts });
      }

      if (method === "POST" && url.pathname === "/video-pipeline/strict-runs") {
        const body = (await readJsonBody(request)) as { input?: StrictVideoPipelineInput; liveExecution?: { allowLiveExecution?: boolean; targetHeight?: 720 | 1080; targetFps?: 24 | 30 | 60 } };
        if (!body.input?.prompt) {
          return sendJson(response, 400, { error: "Request body must include `input.prompt`." });
        }
        const manifest = createStrictVideoPipelineManifest(body.input);
        const artifacts = writeStrictVideoPipelineArtifacts(rootDir, manifest);
        const runtimePlan = createVideoPipelineRuntimePlan(manifest);
        const runtime = executeVideoPipelineRuntimeDryRun(rootDir, manifest, runtimePlan);
        const qualityPlan = createVideoPipelineQualityPlan(manifest, runtimePlan);
        const quality = executeVideoPipelineQualityDryRun(rootDir, manifest, runtime, qualityPlan);
        const live = executeVideoPipelineLiveRun(rootDir, manifest, runtime, quality, {
          allowLiveExecution: Boolean(body.liveExecution?.allowLiveExecution),
          targetHeight: body.liveExecution?.targetHeight ?? 720,
          targetFps: body.liveExecution?.targetFps ?? 30
        });
        const cockpit = createVideoPipelineCockpitPayload(manifest, artifacts, runtime.paths, quality.paths, live.paths);
        return sendJson(response, 201, { manifest, artifacts, runtimePlan, runtime, qualityPlan, quality, live, cockpit });
      }

      const runMatch = /^\/runs\/([^/]+)$/.exec(url.pathname);
      if (method === "GET" && runMatch) {
        const details = controlPlane.getRun(runMatch[1]);
        if (!details) {
          return sendJson(response, 404, { error: `Run ${runMatch[1]} was not found.` });
        }
        return sendJson(response, 200, details);
      }

      const reviewMatch = /^\/runs\/([^/]+)\/review-decisions$/.exec(url.pathname);
      if (method === "POST" && reviewMatch) {
        const body = (await readJsonBody(request)) as ReviewDecisionInput;
        if (body.decision !== "approved" && body.decision !== "rejected") {
          return sendJson(response, 400, { error: "Request body must include `decision` as `approved` or `rejected`." });
        }

        const details = controlPlane.recordReviewDecision(reviewMatch[1], body);
        return sendJson(response, 200, details);
      }

      return sendJson(response, 404, { error: "Route not found." });
    } catch (error) {
      return sendError(response, error);
    }
  });

  await new Promise<void>((resolvePromise) => {
    server.listen(port, host, () => resolvePromise());
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Server address was not available after listen.");
  }

  return {
    server,
    host,
    port: (address as AddressInfo).port,
    rootDir,
    close: async () =>
      new Promise<void>((resolvePromise, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolvePromise();
        });
      })
  };
}

async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let totalBytes = 0;
  for await (const chunk of request) {
    const buffer = typeof chunk === "string" ? Buffer.from(chunk) : chunk;
    totalBytes += buffer.byteLength;
    if (totalBytes > MAX_JSON_BODY_BYTES) {
      throw new PayloadTooLargeError(MAX_JSON_BODY_BYTES);
    }
    chunks.push(buffer);
  }

  if (chunks.length === 0) {
    return {};
  }

  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

class PayloadTooLargeError extends Error {
  constructor(readonly maxBytes: number) {
    super(`Request body exceeds ${maxBytes} bytes.`);
  }
}

function sendJson(response: ServerResponse, statusCode: number, payload: unknown): void {
  response.statusCode = statusCode;
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.end(`${JSON.stringify(payload, null, 2)}\n`);
}

function sendError(response: ServerResponse, error: unknown): void {
  if (error instanceof SyntaxError) {
    sendJson(response, 400, { error: "Malformed JSON body." });
    return;
  }

  if (error instanceof PayloadTooLargeError) {
    sendJson(response, 413, { error: error.message });
    return;
  }

  if (error instanceof DomainError) {
    const statusCode = error.failureCode === "RUN_NOT_FOUND" ? 404 : 400;
    sendJson(response, statusCode, {
      error: error.message,
      failureCode: error.failureCode
    });
    return;
  }

  const message = error instanceof Error ? error.message : "Unexpected server error.";
  sendJson(response, 500, { error: message });
}
