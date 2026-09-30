# chatbot-template

A minimal chatbot template built with [React Router](https://reactrouter.com) (v8, framework mode), the [AI SDK](https://ai-sdk.dev), [shadcn/ui](https://ui.shadcn.com), [shadcn/react](https://ui.shadcn.com/docs/react/message-scroller), [shadcn/typeset](https://ui.shadcn.com/docs/typeset) and [OpenAI](https://platform.openai.com/docs/models).

It is a port of [shadcn-ui/chatbot-template](https://github.com/shadcn-ui/chatbot-template) from Next.js to React Router. The components, tools, styling and tooling (Tailwind, ESLint, Prettier, TypeScript) are the same; only the framework layer changed.

## Features

- Streaming chat with markdown rendering and shadcn/typeset
- Tool calling example
- Web search via OpenAI's built-in search tool
- Human-in-the-loop questionnaire. The model can ask clarifying questions, answered with the shadcn questionnaire component
- **Works offline.** Without an OpenAI API key the app runs against a built-in mock model that streams scripted answers through the real AI SDK pipeline, so the whole chat protocol (streaming text, tool calls, tool results, sources, errors) can be developed and tested without spending credits.

## Local development

```bash
pnpm install
pnpm dev
```

That's it. With no credentials configured the model picker offers **Mock assistant**. Try the suggestion chips on the empty screen, or:

| Say…                                   | To see…                                                   |
| -------------------------------------- | --------------------------------------------------------- |
| "Tell me a story"                      | Rich markdown streaming (headings, table, code block)     |
| "GitHub stats for vercel/next.js"      | A server-executed tool call and the follow-up answer      |
| "Search the web for React Router news" | A search tool with a "Searched N websites" sources drawer |
| "Ask me a few clarifying questions"    | The human-in-the-loop questionnaire and the resumed reply |
| "error"                                | How a stream error is surfaced in the UI                  |

To talk to real models, create an API key in the [OpenAI dashboard](https://platform.openai.com/api-keys) and add it to `.env.local`:

```bash
cp .env.example .env.local
# then set OPENAI_API_KEY=...
```

The React Router dev server loads `.env` files into `process.env`. When a key is present the OpenAI models from [app/lib/models.ts](app/lib/models.ts) replace the mock in the picker.

## Production

```bash
pnpm build
pnpm start
```

`pnpm start` runs `react-router-serve`, a small Node server. Set `OPENAI_API_KEY` in the environment (production builds do not read `.env` files). Any Node host works; see the [React Router deployment docs](https://reactrouter.com/start/framework/deploying) for other targets.

## Configuration

| Env var          | Required | Description                                        |
| ---------------- | -------- | -------------------------------------------------- |
| `OPENAI_API_KEY` | No       | OpenAI API key. When unset the mock model is used. |

The model list lives in [app/lib/models.ts](app/lib/models.ts) — the first entry is the default model. [app/lib/models.server.ts](app/lib/models.server.ts) decides which models are offered and resolves the mock model. Everything mock-related lives in [app/mock/](app/mock).

## Security

The `/api/chat` route is **public and unauthenticated** — every request spends your OpenAI credits. That's fine for a personal demo, but before putting it in front of real traffic you should:

- **Rate limit it.** Add a rate limiter in front of the route (a reverse proxy, or a package like [`@upstash/ratelimit`](https://github.com/upstash/ratelimit-js) called from the action) so a single client can't drain your credits (denial-of-wallet).
- **Cap spend.** Set a [usage limit](https://platform.openai.com/settings/organization/limits) on your OpenAI organization as a backstop.
- **Add auth** if the chatbot isn't meant to be public. React Router [middleware](https://reactrouter.com/how-to/middleware) is a good place for it.

The route already validates the request body, restricts models to the ones offered in [app/lib/models.server.ts](app/lib/models.server.ts), caps output tokens and step count, and aborts generation on client disconnect — but those bound a single request, not overall volume.

## How it works

- [app/routes.ts](app/routes.ts) declares the two routes: the chat page and the `/api/chat` resource route.
- [app/context.ts](app/context.ts) defines the request context (`appContext`). The root middleware in [app/root.tsx](app/root.tsx) fills it from the environment once per request, and loaders and actions read it with `context.get(appContext)`, so no route or lib code touches `process.env`. Moving to a custom server (Hono, Cloudflare Workers) only means populating the same context there.
- [app/routes/api.chat.ts](app/routes/api.chat.ts) is a resource route whose `action` streams responses with `streamText` and returns the AI SDK UI message stream.
- [app/routes/home.tsx](app/routes/home.tsx) is the chat page: it loads the available models on the server, owns the `useChat` session and composes the conversation from the components below.
- [app/root.tsx](app/root.tsx) is the document shell: fonts, global CSS, theme provider and site header.
- [app/mock/mock-model.server.ts](app/mock/mock-model.server.ts) implements the AI SDK `LanguageModelV4` interface with scripted responses. It is only used when no OpenAI API key is configured.
- [app/tools/](tools) defines the tools — one file per tool (the filename is the model-facing tool name), composed in [app/tools/index.ts](app/tools/index.ts): a server-executed GitHub repo lookup, the interactive `ask_user` questionnaire, and OpenAI's native web search (the mock model gets a canned stand-in from [app/mock/mock-web-search.ts](app/mock/mock-web-search.ts)).

Modules ending in `.server.ts` never reach the client bundle.

## Tool parts

Assistant messages are a list of typed parts. [app/components/chat-message.tsx](app/components/chat-message.tsx) switches on `part.type` and delegates each one to a component in [app/components/parts/](app/components/parts):

| Part type          | Component                                                         | Renders                                                                                                                                          |
| ------------------ | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `text`             | [text-part.tsx](app/components/parts/text-part.tsx)               | Markdown via react-markdown and shadcn/typeset.                                                                                                  |
| `tool-github_repo` | [github-repo-part.tsx](app/components/parts/github-repo-part.tsx) | A spinner while the lookup runs, then a linked stat line (stars, forks, language).                                                               |
| `tool-web_search`  | [web-search-part.tsx](app/components/parts/web-search-part.tsx)   | A "Searching the web…" status while the search runs, then a persistent "Searched the web" line per search.                                       |
| `tool-ask_user`    | [ask-user-part.tsx](app/components/parts/ask-user-part.tsx)       | The answered questions inline. Pending questions render in [question-card.tsx](app/components/question-card.tsx), pinned to the scroller bottom. |
| `source-url`       | [sources-part.tsx](app/components/parts/sources-part.tsx)         | Web search citations, deduped into a "Searched N websites" drawer once the message finishes streaming.                                           |

Tool parts move through states as the stream progresses — `input-streaming` → `input-available` → `output-available` (or `output-error`) — and each component switches on `part.state` to show progress, results, and failures.

### Adding your own tool

1. Create `app/tools/<name>.ts` (the filename is the model-facing tool name) exporting a `tool()` with a `description`, an `inputSchema`, and an `execute` function (omit `execute` for tools the user answers in the UI, like `ask_user`), then register it in [app/tools/index.ts](app/tools/index.ts).
2. Add a part component in [app/components/parts/](app/components/parts) and a `case "tool-<name>"` in [chat-message.tsx](app/components/chat-message.tsx).
3. Optionally teach the mock model about it in [app/mock/mock-model.server.ts](app/mock/mock-model.server.ts) so it can be exercised offline.

Message types are inferred from the tool definitions via `InferUITools`, so `part.input` and `part.output` are fully typed in your part component — renaming a tool field is a build error, not a silent `undefined`.

## Adding components

```bash
npx shadcn@latest add button
```

## Testing

End-to-end tests live in [tests/e2e](tests/e2e) and run with [Vitest](https://vitest.dev) and [Playwright](https://playwright.dev). The global setup builds the app and serves it in mock mode (no `OPENAI_API_KEY`), so the suite never calls OpenAI:

```bash
pnpm exec playwright install chromium   # once
pnpm test:e2e
```

- `api/chat.test.ts` checks the `/api/chat` stream against the AI SDK UI message protocol: text deltas, the two-step tool call, the client-side `ask_user` stop and resume, source citations, errors and request validation.
- `ui/chat.test.ts` drives the page in a browser: markdown rendering, tool parts, the questionnaire round trip, the sources drawer, stop, error display and New Chat.
- `ui/theme.test.ts` covers the OS preference, the `d` hotkey, persistence and the pre-hydration theme script.

Each test file is self-contained: it launches its own browser and keeps its own page actions and request helpers. The build-and-serve step is in `e2e-setup.ts`, which provides `baseUrl` to the tests (read with `inject("baseUrl")`).

The browser runs headless by default. Set `E2E_HEADED=1` to watch it, `E2E_SKIP_BUILD=1` to reuse an existing `build/` and `E2E_SERVER_LOGS=1` to see the server output.

## Scripts

| Script           | What it does                                           |
| ---------------- | ------------------------------------------------------ |
| `pnpm dev`       | Start the dev server with HMR                          |
| `pnpm build`     | Build client and server bundles into `build/`          |
| `pnpm start`     | Serve the production build                             |
| `pnpm typecheck` | Generate route types and run `tsc`                     |
| `pnpm lint`      | ESLint (type-aware, with jsx-a11y and Prettier)        |
| `pnpm format`    | Prettier (with the Tailwind class sorter)              |
| `pnpm test:e2e`  | Build, serve in mock mode and run the Playwright tests |

## License

MIT — see [LICENSE](LICENSE).
