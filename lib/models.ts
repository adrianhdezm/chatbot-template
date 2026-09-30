// See https://vercel.com/ai-gateway/models.
export const MODELS = [
  { id: "anthropic/claude-sonnet-5", name: "Claude Sonnet 5" },
  { id: "openai/gpt-5.6-terra", name: "GPT 5.6 Terra" },
]

export const DEFAULT_MODEL = MODELS[0].id

// Built-in model used when no AI Gateway credential is configured. It streams
// canned responses through the real AI SDK pipeline so the whole chat flow
// (streaming, tools, human-in-the-loop, sources) works offline.
export const MOCK_MODEL = { id: "mock/assistant", name: "Mock assistant" }

export interface GatewayModel {
  id: string
  name: string
}

export function isModelAllowed(id: string) {
  return MODELS.some((model) => model.id === id)
}

export function isMockModel(id: string) {
  return id === MOCK_MODEL.id
}
