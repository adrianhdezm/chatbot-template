import type { ChatMessagePart, ChatUIMessage } from "~/tools"
import { AskUserPart } from "~/components/parts/ask-user-part"
import { GithubRepoPart } from "~/components/parts/github-repo-part"
import { SourcesPart } from "~/components/parts/sources-part"
import { TextPart } from "~/components/parts/text-part"
import { WebSearchPart } from "~/components/parts/web-search-part"
import { Bubble, BubbleContent } from "~/components/ui/bubble"
import { Message, MessageContent } from "~/components/ui/message"

export function ChatMessage({
  message,
  isStreaming = false,
}: {
  message: ChatUIMessage
  isStreaming?: boolean
}) {
  if (message.role === "user") {
    return (
      <Message align="end">
        <MessageContent>
          <Bubble align="end" variant="muted">
            <BubbleContent>
              {message.parts
                .filter((part) => part.type === "text")
                .map((part) => part.text)
                .join("")}
            </BubbleContent>
          </Bubble>
        </MessageContent>
      </Message>
    )
  }

  return (
    <Message align="start">
      <MessageContent>
        {mergeTextParts(message.parts).map((part, index) => {
          switch (part.type) {
            case "text":
              return <TextPart key={index} part={part} />
            case "tool-github_repo":
              return <GithubRepoPart key={part.toolCallId} part={part} />
            case "tool-ask_user":
              return <AskUserPart key={part.toolCallId} part={part} />
            case "tool-web_search":
              return <WebSearchPart key={part.toolCallId} part={part} />
            default:
              return null
          }
        })}
        {!isStreaming && <SourcesPart parts={message.parts} />}
      </MessageContent>
    </Message>
  )
}

// Web search replies stream one text part per citation, so join them back
// into one markdown document.
function mergeTextParts(parts: ChatMessagePart[]) {
  return parts
    .filter((part) => part.type !== "source-url")
    .reduce<ChatMessagePart[]>((merged, part) => {
      const last = merged.at(-1)
      if (part.type === "text" && last?.type === "text") {
        merged[merged.length - 1] = { ...part, text: last.text + part.text }
        return merged
      }
      merged.push(part)
      return merged
    }, [])
}
