import process from "node:process";
import { DomainError } from "../../../packages/domain/src/index.js";

interface StructuredOutputRequest {
  model?: string;
  name: string;
  schema: Record<string, unknown>;
  instructions: string;
  input: unknown;
}

export type StructuredOutputRequester = <T>(request: StructuredOutputRequest) => Promise<T>;

export const defaultOpenAiModel = "gpt-5.4-mini";

export function resolveOpenAiModel(cliValue?: string | null): string {
  return cliValue?.trim() || process.env.OPENAI_MODEL?.trim() || defaultOpenAiModel;
}

export const requestOpenAiStructuredOutput: StructuredOutputRequester = async <T>(
  request: StructuredOutputRequest
): Promise<T> => {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new DomainError("PROVIDER_CONFIG_MISSING", "OPENAI_API_KEY is required for provider mode.");
  }

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: request.model ?? defaultOpenAiModel,
      store: false,
      input: [
        {
          role: "system",
          content: request.instructions
        },
        {
          role: "user",
          content: typeof request.input === "string" ? request.input : JSON.stringify(request.input, null, 2)
        }
      ],
      text: {
        format: {
          type: "json_schema",
          name: request.name,
          strict: true,
          schema: request.schema
        }
      }
    })
  });

  const payload = (await response.json()) as Record<string, unknown>;

  if (!response.ok) {
    const message = extractErrorMessage(payload);
    throw new DomainError("PROVIDER_REQUEST_FAILED", `OpenAI request failed: ${message}`);
  }

  const structured = extractStructuredPayload(payload);
  if (structured === null) {
    throw new DomainError("PROVIDER_SCHEMA_INVALID", "OpenAI response did not contain structured JSON output.");
  }

  return structured as T;
};

function extractErrorMessage(payload: Record<string, unknown>): string {
  const error = payload.error;
  if (typeof error === "object" && error !== null && "message" in error && typeof error.message === "string") {
    return error.message;
  }

  return "unknown provider error";
}

function extractStructuredPayload(payload: Record<string, unknown>): unknown | null {
  const outputText = payload.output_text;
  if (typeof outputText === "string" && outputText.trim()) {
    return parseJson(outputText);
  }

  const output = payload.output;
  if (!Array.isArray(output)) {
    return null;
  }

  for (const item of output) {
    if (!isRecord(item)) {
      continue;
    }

    const content = item.content;
    if (!Array.isArray(content)) {
      continue;
    }

    for (const part of content) {
      if (!isRecord(part)) {
        continue;
      }

      const parsed = part.parsed;
      if (typeof parsed === "object" && parsed !== null) {
        return parsed;
      }

      const text = part.text;
      if (typeof text === "string" && text.trim()) {
        return parseJson(text);
      }
    }
  }

  return null;
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch (error) {
    throw new DomainError(
      "PROVIDER_SCHEMA_INVALID",
      error instanceof Error ? `Structured output was not valid JSON: ${error.message}` : "Structured output was not valid JSON."
    );
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
