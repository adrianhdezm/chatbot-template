import type { LanguageModel } from "ai"

import { createMockModel } from "@/lib/mock-model.server"
import {
  isMockModel,
  isModelAllowed,
  MOCK_MODEL,
  MODELS,
  type GatewayModel,
} from "@/lib/models"

// The AI Gateway authenticates with an API key locally or with OIDC on Vercel.
export function isGatewayConfigured() {
  return Boolean(
    process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN
  )
}

// Models offered to the client. Without a gateway credential only the mock
// model is listed so the app keeps working out of the box.
export function getAvailableModels(): GatewayModel[] {
  return isGatewayConfigured() ? MODELS : [MOCK_MODEL]
}

// Turn a model id from the request into something `streamText` accepts, or
// `undefined` when the id is not offered in this environment.
export function resolveModel(id: string): LanguageModel | undefined {
  if (isGatewayConfigured()) {
    return isModelAllowed(id) ? id : undefined
  }
  return isMockModel(id) ? createMockModel() : undefined
}
