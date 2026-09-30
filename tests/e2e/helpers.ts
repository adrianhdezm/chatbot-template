import { chromium, type Browser, type Page } from "playwright"
import { inject } from "vitest"

export const baseUrl = () => inject("baseUrl")

export async function launchBrowser(): Promise<Browser> {
  return chromium.launch()
}

export async function openChat(page: Page) {
  await page.goto(baseUrl())
  await page.getByText("What can I help with?").waitFor()
}

export async function send(page: Page, text: string) {
  await page.getByPlaceholder("Send a message…").fill(text)
  await page.keyboard.press("Enter")
}

export const sendButton = (page: Page) =>
  page.getByRole("button", { name: "Send message" })

export const stopButton = (page: Page) =>
  page.getByRole("button", { name: "Stop generating" })

// Wait for a request to start (stop button or thinking indicator) and then
// for the response to finish (send button back).
export async function waitForReply(page: Page) {
  await stopButton(page).or(page.getByText("Thinking…")).first().waitFor()
  await sendButton(page).waitFor()
}

export const assistantMessages = (page: Page) =>
  page.locator('[data-slot="message"][data-align="start"]')

export const lastAssistantMessage = (page: Page) =>
  assistantMessages(page).last()

// Collect the UI message stream events of a POST to /api/chat.
export async function postChat(body: unknown) {
  const response = await fetch(`${baseUrl()}/api/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  })
  const text = await response.text()
  const events = text
    .split("\n")
    .filter((line) => line.startsWith("data: ") && !line.includes("[DONE]"))
    .map(
      (line) =>
        JSON.parse(line.slice(6)) as { type: string } & Record<string, unknown>
    )
  return { response, text, events }
}

export const userMessage = (text: string) => ({
  id: "user-1",
  role: "user",
  parts: [{ type: "text", text }],
})
