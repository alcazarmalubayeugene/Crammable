import OpenAI, { APIError } from "openai";
import { EnvKeys } from "@/lib/contracts";

export const DEEPSEEK_BASE_URL = "https://api.deepseek.com";
export const DEFAULT_DEEPSEEK_MODEL = "deepseek-chat";
// Kept under the generate route's maxDuration (60s) so a single attempt aborts
// cleanly before the platform kills the function. Timeouts do NOT retry (see
// completeChatWithRetry), so this is an effective per-request ceiling.
export const DEEPSEEK_REQUEST_TIMEOUT_MS = 45_000;
export const DEEPSEEK_MAX_RETRIES = 3;

export function getDeepSeekApiKey(): string {
  const value = process.env[EnvKeys.deepseekApiKey]?.trim();
  if (!value) {
    throw new Error("DEEPSEEK_NOT_CONFIGURED");
  }
  return value;
}

export function getDeepSeekModel(): string {
  return process.env[EnvKeys.deepseekModel]?.trim() || DEFAULT_DEEPSEEK_MODEL;
}

export function createDeepSeekClient(): OpenAI {
  return new OpenAI({
    apiKey: getDeepSeekApiKey(),
    baseURL: DEEPSEEK_BASE_URL,
    timeout: DEEPSEEK_REQUEST_TIMEOUT_MS,
    maxRetries: 0,
  });
}

export function isDeepSeekConfigured(): boolean {
  return Boolean(process.env[EnvKeys.deepseekApiKey]?.trim());
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableApiError(err: unknown): boolean {
  if (!(err instanceof APIError)) return false;
  if (err.status === 429) return true;
  if (err.status != null && err.status >= 500) return true;
  const code = (err as APIError & { code?: string }).code;
  return code === "ECONNRESET" || code === "ETIMEDOUT" || code === "ENOTFOUND";
}

export function mapDeepSeekError(err: unknown): Error {
  if (err instanceof Error && err.message === "DEEPSEEK_NOT_CONFIGURED") {
    return new Error(
      `Missing ${EnvKeys.deepseekApiKey}. Copy env.example to .env.local and set your DeepSeek key.`,
    );
  }
  if (err instanceof APIError) {
    if (err.status === 401) {
      return new Error(
        "DeepSeek API rejected the API key (401). Check DEEPSEEK_API_KEY in .env.",
      );
    }
    if (err.status === 429) {
      return new Error(
        "DeepSeek rate limit exceeded after retries. Wait and try again, or reduce document size.",
      );
    }
  }
  if (err instanceof Error && err.name === "TimeoutError") {
    return new Error(
      `DeepSeek request timed out after ${DEEPSEEK_REQUEST_TIMEOUT_MS / 1000}s.`,
    );
  }
  const message = err instanceof Error ? err.message : String(err);
  return new Error(`DeepSeek API call failed: ${message}`);
}

export interface ChatCompletionOptions {
  system: string;
  user: string;
  temperature?: number;
  responseFormat?: { type: "json_object" };
  maxRetries?: number;
}

/**
 * DeepSeek chat completion with retries on rate limits and transient failures.
 */
export async function completeChatWithRetry(
  options: ChatCompletionOptions,
  client?: OpenAI,
): Promise<{ content: string; model: string }> {
  const openai = client ?? createDeepSeekClient();
  const model = getDeepSeekModel();
  const maxRetries = options.maxRetries ?? DEEPSEEK_MAX_RETRIES;
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const completion = await openai.chat.completions.create({
        model,
        temperature: options.temperature ?? 0.3,
        ...(options.responseFormat ? { response_format: options.responseFormat } : {}),
        messages: [
          { role: "system", content: options.system },
          { role: "user", content: options.user },
        ],
      });

      const content = completion.choices[0]?.message?.content?.trim();
      if (!content) {
        throw new Error("DeepSeek returned an empty completion.");
      }

      return { content, model };
    } catch (err) {
      lastError = err;

      if (err instanceof APIError) {
        if (err.status === 401) {
          throw mapDeepSeekError(err);
        }
        if (err.status === 429 && attempt < maxRetries) {
          const retryAfterSec = Number(err.headers?.["retry-after"]) || attempt * 5;
          console.warn(
            `[DeepSeek] Rate limited (429). Retrying in ${retryAfterSec}s (${attempt}/${maxRetries})…`,
          );
          await sleep(retryAfterSec * 1000);
          continue;
        }
      }

      if (isRetryableApiError(err) && attempt < maxRetries) {
        const backoffMs = attempt * 2000;
        console.warn(`[DeepSeek] Transient error. Retrying in ${backoffMs}ms…`);
        await sleep(backoffMs);
        continue;
      }

      if (err instanceof Error && err.name === "TimeoutError") {
        throw mapDeepSeekError(err);
      }

      break;
    }
  }

  throw mapDeepSeekError(lastError);
}
