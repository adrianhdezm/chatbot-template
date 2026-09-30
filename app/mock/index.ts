// Client-safe entry point for the mock model. The implementation lives in
// ./model.server.ts and never reaches the browser bundle.

import type { ChatModel } from "~/lib/models"

// Built-in model used when no OpenAI API key is configured. It streams canned
// responses through the real AI SDK pipeline so the whole chat flow
// (streaming, tools, human-in-the-loop, sources) works offline.
export const MOCK_MODEL: ChatModel = {
  id: "mock/assistant",
  name: "Mock assistant",
}

export function isMockModel(id: string) {
  return id === MOCK_MODEL.id
}
