import { tool } from "ai"
import { z } from "zod"

// The subset of the GitHub REST repository payload the tool uses.
const githubRepoResponse = z.object({
  full_name: z.string().optional(),
  description: z.string().nullish(),
  stargazers_count: z.number().optional(),
  forks_count: z.number().optional(),
  open_issues_count: z.number().optional(),
  language: z.string().nullish(),
  html_url: z.string().optional(),
})

export const githubRepo = tool({
  description:
    "Get public stats for a GitHub repository: stars, forks, open issues, language, and description.",
  inputSchema: z.object({
    repo: z
      .string()
      .regex(/^[\w.-]+\/[\w.-]+$/, 'Must be in "owner/name" format.')
      .describe('The repository in "owner/name" format, e.g. "vercel/next.js"'),
  }),
  outputSchema: z.union([
    z.object({ error: z.string() }),
    z.object({
      repo: z.string(),
      description: z.string(),
      stars: z.number(),
      forks: z.number(),
      openIssues: z.number(),
      language: z.string(),
      url: z.string(),
    }),
  ]),
  execute: async ({ repo }, { abortSignal }) => {
    const timeout = AbortSignal.timeout(5000)
    const signal = abortSignal
      ? AbortSignal.any([abortSignal, timeout])
      : timeout

    try {
      const res = await fetch(`https://api.github.com/repos/${repo}`, {
        headers: { accept: "application/vnd.github+json" },
        signal,
      })
      if (!res.ok) {
        return { error: `Could not find repository ${repo}.` }
      }
      const parsed = githubRepoResponse.safeParse(await res.json())
      if (!parsed.success) {
        return { error: `Unexpected response from GitHub for ${repo}.` }
      }
      const data = parsed.data
      return {
        repo: data.full_name ?? repo,
        description: data.description ?? "",
        stars: data.stargazers_count ?? 0,
        forks: data.forks_count ?? 0,
        openIssues: data.open_issues_count ?? 0,
        language: data.language ?? "Unknown",
        url: data.html_url ?? `https://github.com/${repo}`,
      }
    } catch {
      return { error: `Could not reach GitHub for ${repo}.` }
    }
  },
})
