import { createOpenAI } from "@ai-sdk/openai"
import type { LanguageModel } from "ai"

import type { AppEnv } from "~/context"
import { isModelAllowed, MODELS, type ChatModel } from "~/lib/models"
import { isMockModel, MOCK_MODEL } from "~/mock"
import { createMockModel } from "~/mock/mock-model.server"

export function isOpenAIConfigured(env: AppEnv) {
  return Boolean(env.OPENAI_API_KEY)
}

// Models offered to the client. Without an API key only the mock model is
// listed so the app keeps working out of the box.
export function getAvailableModels(env: AppEnv): ChatModel[] {
  return isOpenAIConfigured(env) ? MODELS : [MOCK_MODEL]
}

// Turn a model id from the request into something `streamText` accepts, or
// `undefined` when the id is not offered in this environment.
export function resolveModel(
  env: AppEnv,
  id: string
): LanguageModel | undefined {
  if (isOpenAIConfigured(env)) {
    if (!isModelAllowed(id)) {
      return undefined
    }
    return createOpenAI({ apiKey: env.OPENAI_API_KEY })(id)
  }
  return isMockModel(id) ? createMockModel() : undefined
}
