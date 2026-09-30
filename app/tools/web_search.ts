import { openai } from "@ai-sdk/openai"

import { isMockModel } from "~/lib/models"
import { mockWebSearch } from "./mock_web_search"

// OpenAI runs web search itself; the mock model gets a canned stand-in.
export function getWebSearch(modelId: string) {
  return isMockModel(modelId) ? mockWebSearch : openai.tools.webSearch()
}
