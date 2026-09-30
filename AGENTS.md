# Agent notes

This app uses React Router v8 in framework mode (Vite), not Next.js. Routes are
declared in `app/routes.ts`; route modules live in `app/routes/`, and shared code (components, lib, tools, mock) lives under `app/` behind the `~/*` alias. The chat API
is a resource route (`app/routes/api.chat.ts`) that exports an `action`, and
server-only modules use the `.server.ts` suffix. Request-scoped server values
(environment) come from the middleware context: `app/context.ts` defines
`appContext`, the root middleware fills it, loaders and actions read it with
`context.get(appContext)`; never read `process.env` outside `app/root.tsx`.
Linting is type-aware (`eslint.config.js`): run `pnpm lint` before committing. Run `pnpm typecheck` after
adding routes so the generated `+types` files stay in sync. End-to-end tests
live in `tests/e2e` (Vitest + Playwright against a mock-mode build); run
`pnpm test:e2e` after changing the chat flow or the API route.
