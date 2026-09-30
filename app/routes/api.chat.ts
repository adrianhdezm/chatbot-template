import {
  convertToModelMessages,
  createUIMessageStreamResponse,
  isStepCount,
  streamText,
  toUIMessageStream,
  validateUIMessages,
} from "ai"

import type { Route } from "./+types/api.chat"
import { DEFAULT_MODEL } from "~/lib/models"
import { resolveModel } from "~/lib/models.server"
import { getTools, type ChatUIMessage } from "~/tools"

const MAX_OUTPUT_TOKENS = 8192

export function loader() {
  return Response.json({ error: "Method not allowed." }, { status: 405 })
}

// This endpoint is public and spends your OpenAI credits on every request.
// Before exposing it to real traffic, add a rate limit, authentication, and a
// spend limit on your OpenAI account. See the README "Security" section.
export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed." }, { status: 405 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 })
  }

  const model = (body as { model?: unknown })?.model
  const modelId = typeof model === "string" ? model : DEFAULT_MODEL

  // Only models listed for this deployment are accepted. Without an API key
  // credential that is the built-in mock model, which never leaves the server.
  const languageModel = resolveModel(modelId)
  if (!languageModel) {
    return Response.json(
      { error: `Model ${modelId} is not available.` },
      { status: 400 }
    )
  }

  const tools = getTools(modelId)

  // Validate the shape of every message and tool part before trusting it.
  let messages: ChatUIMessage[]
  try {
    const validated = await validateUIMessages<ChatUIMessage>({
      messages: (body as { messages?: unknown })?.messages,
      tools: tools as Parameters<typeof validateUIMessages>[0]["tools"],
    })
    messages = validated
  } catch {
    return Response.json({ error: "Invalid messages." }, { status: 400 })
  }

  const result = streamText({
    model: languageModel,
    messages: await convertToModelMessages(messages),
    tools,
    stopWhen: isStepCount(5),
    maxOutputTokens: MAX_OUTPUT_TOKENS,
    abortSignal: request.signal,
  })

  return createUIMessageStreamResponse({
    stream: toUIMessageStream({
      stream: result.stream,
      sendSources: true,
      onError: () => "Something went wrong. Please try again.",
    }),
  })
}
