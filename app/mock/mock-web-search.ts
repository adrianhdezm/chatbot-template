import { tool } from 'ai';
import { z } from 'zod';

// Stand-in for the provider-native web search tools. It returns canned
// results so the search UI (status line, sources drawer) can be exercised
// without a provider credential.
export const mockWebSearch = tool({
  description: 'Search the web for up-to-date information.',
  inputSchema: z.object({
    query: z.string().describe('The search query')
  }),
  execute: ({ query }) => ({
    query,
    results: [
      {
        title: 'React Router — Framework mode',
        url: 'https://reactrouter.com/start/framework/installation',
        snippet: 'Routing, data loading, and server rendering built on Vite.'
      },
      {
        title: 'AI SDK — UI Message Stream Protocol',
        url: 'https://ai-sdk.dev/docs/ai-sdk-ui/stream-protocol',
        snippet: 'How useChat and streamText exchange text, tool, and source parts.'
      },
      {
        title: 'shadcn/ui — Message Scroller',
        url: 'https://ui.shadcn.com/docs/react/message-scroller',
        snippet: 'Chat primitives used by this template.'
      }
    ]
  })
});

export type MockWebSearchOutput = {
  query: string;
  results: { title: string; url: string; snippet: string }[];
};
