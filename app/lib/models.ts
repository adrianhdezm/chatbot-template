// OpenAI model ids. See https://platform.openai.com/docs/models.
export const MODELS = [
  { id: "gpt-5.6-terra", name: "GPT 5.6 Terra" },
  { id: "gpt-5.5", name: "GPT 5.5" },
]

export const DEFAULT_MODEL = MODELS[0].id

export interface ChatModel {
  id: string
  name: string
}

export function isModelAllowed(id: string) {
  return MODELS.some((model) => model.id === id)
}
