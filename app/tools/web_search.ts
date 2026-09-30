import { anthropic } from "@ai-sdk/anthropic"
import { openai } from "@ai-sdk/openai"

import { isMockModel } from "~/lib/models"
import { mockWebSearch } from "./mock_web_search"

export function getWebSearch(modelId: string) {
  if (modelId.startsWith("openai/")) {
    return openai.tools.webSearch()
  }
  if (modelId.startsWith("anthropic/")) {
    return anthropic.tools.webSearch_20260209()
  }
  if (isMockModel(modelId)) {
    return mockWebSearch
  }
  return undefined
}
