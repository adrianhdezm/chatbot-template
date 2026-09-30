# Agent notes

This app uses React Router v8 in framework mode (Vite), not Next.js. Routes are
declared in `app/routes.ts`; route modules live in `app/routes/`. The chat API
is a resource route (`app/routes/api.chat.ts`) that exports an `action`, and
server-only modules use the `.server.ts` suffix. Run `pnpm typecheck` after
adding routes so the generated `+types` files stay in sync.
