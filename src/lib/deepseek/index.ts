export {
  completeChatWithRetry,
  createDeepSeekClient,
  DEEPSEEK_BASE_URL,
  DEEPSEEK_MAX_RETRIES,
  DEEPSEEK_REQUEST_TIMEOUT_MS,
  DEFAULT_DEEPSEEK_MODEL,
  getDeepSeekApiKey,
  getDeepSeekModel,
  isDeepSeekConfigured,
  mapDeepSeekError,
  type ChatCompletionOptions,
} from "@/lib/deepseek/client";
export { generateFlashcardsFromText } from "@/lib/deepseek/generate-cards";
