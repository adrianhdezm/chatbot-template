import { openai } from "@ai-sdk/openai"
import type { LanguageModel } from "ai"

import { isModelAllowed, MODELS, type ChatModel } from "~/lib/models"
import { isMockModel, MOCK_MODEL } from "~/mock"
import { createMockModel } from "~/mock/mock-model.server"

// The OpenAI provider reads OPENAI_API_KEY from the environment.
export function isOpenAIConfigured() {
  return Boolean(process.env.OPENAI_API_KEY)
}

// Models offered to the client. Without an API key only the mock model is
// listed so the app keeps working out of the box.
export function getAvailableModels(): ChatModel[] {
  return isOpenAIConfigured() ? MODELS : [MOCK_MODEL]
}

// Turn a model id from the request into something `streamText` accepts, or
// `undefined` when the id is not offered in this environment.
export function resolveModel(id: string): LanguageModel | undefined {
  if (isOpenAIConfigured()) {
    return isModelAllowed(id) ? openai(id) : undefined
  }
  return isMockModel(id) ? createMockModel() : undefined
}
