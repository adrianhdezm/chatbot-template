import { execSync, spawn, type ChildProcess } from "node:child_process"
import { createServer } from "node:net"
import type { TestProject } from "vitest/node"

declare module "vitest" {
  export interface ProvidedContext {
    baseUrl: string
    headless: boolean
  }
}

async function freePort() {
  return new Promise<number>((resolve, reject) => {
    const server = createServer()
    server.listen(0, "127.0.0.1", () => {
      const address = server.address()
      if (!address || typeof address === "string") {
        reject(new Error("Could not allocate a port."))
        return
      }
      server.close(() => resolve(address.port))
    })
  })
}

async function waitForServer(url: string, child: ChildProcess) {
  const deadline = Date.now() + 60_000
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Server exited early with code ${child.exitCode}.`)
    }
    try {
      const response = await fetch(url)
      if (response.ok) {
        return
      }
    } catch {
      // Not up yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  throw new Error(`Server at ${url} did not start in time.`)
}

export default async function setup(project: TestProject) {
  // Build once so the tests run against the same output that ships.
  if (!process.env.E2E_SKIP_BUILD) {
    execSync("pnpm build", { stdio: "inherit" })
  }

  const port = await freePort()
  const baseUrl = `http://127.0.0.1:${port}`

  // Force mock mode so the tests never reach OpenAI.
  const env: NodeJS.ProcessEnv = { ...process.env, PORT: String(port) }
  delete env.OPENAI_API_KEY

  const server = spawn(
    "pnpm",
    ["exec", "react-router-serve", "./build/server/index.js"],
    { env, stdio: process.env.E2E_SERVER_LOGS ? "inherit" : "ignore" }
  )

  await waitForServer(baseUrl, server)
  project.provide("baseUrl", baseUrl)

  return () => {
    server.kill()
  }
}
