import { type InferToolOutput, type LanguageModel, simulateReadableStream } from 'ai';

import { MOCK_MODEL } from '~/mock';
import type { MockWebSearchOutput } from '~/mock/mock-web-search';
import type { githubRepo } from '~/tools/github_repo';

// A LanguageModelV4 implementation that never calls a provider. It scripts a
// handful of scenarios so every part of the UI message stream protocol can be
// exercised locally: streamed markdown, a server-executed tool (github_repo),
// a client-answered tool (ask_user), a search tool with source citations, and
// a stream error.

// `ai` does not re-export the provider spec types, so derive them from the
// `LanguageModel` union instead of depending on @ai-sdk/provider directly.
type LanguageModelV4 = Extract<LanguageModel, { specificationVersion: 'v4' }>;
type LanguageModelV4CallOptions = Parameters<LanguageModelV4['doStream']>[0];
type LanguageModelV4Prompt = LanguageModelV4CallOptions['prompt'];
type StreamPart = Awaited<ReturnType<LanguageModelV4['doStream']>>['stream'] extends ReadableStream<infer T> ? T : never;
type FinishReason = Extract<StreamPart, { type: 'finish' }>['finishReason'];
type ToolResultPart = Extract<Extract<LanguageModelV4Prompt[number], { role: 'tool' }>['content'][number], { type: 'tool-result' }>;

const usage = {
  inputTokens: { total: 0, noCache: 0, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 0, text: 0, reasoning: 0 }
};

let idCounter = 0;
function nextId(prefix: string) {
  idCounter += 1;
  return `${prefix}_${Date.now().toString(36)}_${idCounter}`;
}

function finish(reason: FinishReason['unified']): StreamPart {
  return {
    type: 'finish',
    finishReason: { unified: reason, raw: undefined },
    usage
  };
}

// Stream text word by word so the UI shows incremental rendering.
function text(content: string): StreamPart[] {
  const id = nextId('txt');
  const chunks = content.match(/\S+\s*|\s+/g) ?? [];
  return [{ type: 'text-start', id }, ...chunks.map((delta): StreamPart => ({ type: 'text-delta', id, delta })), { type: 'text-end', id }];
}

// Emit a tool call the way real providers do: streamed input deltas first,
// then the complete call. The UI moves the part from `input-streaming` to
// `input-available` as these arrive.
function toolCall(toolName: string, input: unknown): StreamPart[] {
  const id = nextId('call');
  const json = JSON.stringify(input);
  const deltas = json.match(/.{1,12}/g) ?? [json];
  return [
    { type: 'tool-input-start', id, toolName },
    ...deltas.map((delta): StreamPart => ({
      type: 'tool-input-delta',
      id,
      delta
    })),
    { type: 'tool-input-end', id },
    { type: 'tool-call', toolCallId: id, toolName, input: json }
  ];
}

function lastUserText(prompt: LanguageModelV4Prompt) {
  const message = [...prompt].reverse().find((m) => m.role === 'user');
  if (!message || message.role !== 'user') {
    return '';
  }
  return message.content
    .filter((part) => part.type === 'text')
    .map((part) => part.text)
    .join('');
}

function toolResultValue(part: ToolResultPart): unknown {
  switch (part.output.type) {
    case 'json':
    case 'text':
    case 'error-json':
    case 'error-text':
      return part.output.value;
    default:
      return part.output;
  }
}

function replyToToolResults(results: ToolResultPart[]): StreamPart[] {
  const parts: StreamPart[] = [];
  let reply = '';

  for (const result of results) {
    const value = toolResultValue(result);

    switch (result.toolName) {
      case 'github_repo': {
        const repo = value as InferToolOutput<typeof githubRepo>;
        if ('error' in repo) {
          reply += `I couldn't fetch that repository: ${repo.error}\n\n`;
          break;
        }
        reply +=
          `Here are the stats for **${repo.repo}**:\n\n` +
          `| Metric | Value |\n| --- | --- |\n` +
          `| Stars | ${repo.stars} |\n| Forks | ${repo.forks} |\n` +
          `| Open issues | ${repo.openIssues} |\n| Language | ${repo.language} |\n\n` +
          `${repo.description}\n\n`;
        break;
      }
      case 'ask_user': {
        const answers = value as { question: string; answer: string }[];
        reply +=
          "Thanks, that helps! Here's what I'll go with:\n\n" +
          answers.map((entry) => `- **${entry.question}** ${entry.answer}`).join('\n') +
          '\n\n' +
          '### Suggested plan\n\n' +
          '1. Start with a light, shareable appetizer.\n' +
          '2. Follow with a main that matches the answers above.\n' +
          '3. Finish with something sweet and a toast.\n\n';
        break;
      }
      case 'web_search': {
        const search = value as MockWebSearchOutput;
        for (const hit of search.results) {
          parts.push({
            type: 'source',
            sourceType: 'url',
            id: nextId('src'),
            url: hit.url,
            title: hit.title
          });
        }
        reply +=
          `Here's what I found for “${search.query}”:\n\n` +
          search.results.map((hit) => `- [${hit.title}](${hit.url}) — ${hit.snippet}`).join('\n') +
          '\n\n> These results are canned. Configure `OPENAI_API_KEY` to run real web searches.\n\n';
        break;
      }
      default:
        reply += `Tool \`${result.toolName}\` returned:\n\n` + '```json\n' + JSON.stringify(value, null, 2) + '\n```\n\n';
    }
  }

  return [...parts, ...text(reply.trimEnd()), finish('stop')];
}

const MARKDOWN_SHOWCASE = `# The Lighthouse Keeper

> "Every light needs someone to tend it," she said, "even the ones that seem to burn on their own."

Mara had kept the lighthouse for **eleven years**. Each night followed the same rhythm:

- Climb the *one hundred and twelve* steps
- Polish the lens until it caught the last of the sunset
- Log the weather in the ledger

| Night | Wind | Ships sighted |
| --- | --- | --- |
| Monday | Calm | 2 |
| Tuesday | Gusty | 0 |
| Wednesday | Storm | 5 |

On the storm night she wrote a small program to time the beam:

\`\`\`ts
const interval = setInterval(() => {
  console.log("flash")
}, 5_000)
\`\`\`

And the ships, all five of them, came home.`;

function replyToUser(userText: string): StreamPart[] {
  const lower = userText.toLowerCase();

  if (/^(fail|error)\b/.test(lower)) {
    return [{ type: 'error', error: new Error('Simulated provider failure') }];
  }

  const repo = /\b([\w.-]+\/[\w.-]+)\b/.exec(userText)?.[1];
  if (repo && /\b(github|repo|repository|stars)\b/.test(lower)) {
    return [...toolCall('github_repo', { repo }), finish('tool-calls')];
  }

  if (/\b(search|latest|news|what'?s new)\b/.test(lower)) {
    const query = userText.replace(/^search the web for\s*/i, '').trim();
    return [...toolCall('web_search', { query }), finish('tool-calls')];
  }

  if (/\b(clarif\w*|ask me|questions?)\b/.test(lower)) {
    return [
      ...text('Happy to help! A couple of quick questions first.'),
      ...toolCall('ask_user', {
        questions: [
          {
            question: 'How many guests are you expecting?',
            choices: ['2–4', '5–8', 'More than 8']
          },
          {
            question: 'Any dietary preference?',
            choices: ['Anything goes', 'Vegetarian', 'Vegan']
          }
        ]
      }),
      finish('tool-calls')
    ];
  }

  if (/\b(story|markdown)\b/.test(lower)) {
    return [...text(MARKDOWN_SHOWCASE), finish('stop')];
  }

  return [
    ...text(
      `You said: “${userText.trim()}”\n\n` +
        "I'm the **mock assistant**, so I can't really answer that, but I can show you what the chat can do:\n\n" +
        '- Ask for a *story* to see rich markdown rendering\n' +
        '- Ask for the GitHub stats of `vercel/next.js` to see a server-executed tool\n' +
        '- Ask me to *search the web* for something to see sources\n' +
        '- Ask me to *ask you clarifying questions* to see the questionnaire\n' +
        '- Type `error` to see how failures are surfaced\n\n' +
        'Set `OPENAI_API_KEY` in `.env.local` to talk to a real model.'
    ),
    finish('stop')
  ];
}

function script(prompt: LanguageModelV4Prompt): StreamPart[] {
  const last = prompt.at(-1);
  if (last?.role === 'tool') {
    const results = last.content.filter((part): part is ToolResultPart => part.type === 'tool-result');
    return replyToToolResults(results);
  }
  return replyToUser(lastUserText(prompt));
}

export function createMockModel(): LanguageModelV4 {
  return {
    specificationVersion: 'v4',
    provider: 'mock',
    modelId: MOCK_MODEL.id,
    supportedUrls: {},

    doGenerate(options: LanguageModelV4CallOptions) {
      const parts = script(options.prompt);
      const content: Array<{ type: 'text'; text: string } | Extract<StreamPart, { type: 'tool-call' | 'source' }>> = [];
      let finishReason: FinishReason = { unified: 'stop', raw: undefined };
      let buffer = '';

      for (const part of parts) {
        if (part.type === 'text-delta') {
          buffer += part.delta;
        }
        if (part.type === 'text-end') {
          content.push({ type: 'text', text: buffer });
          buffer = '';
        }
        if (part.type === 'tool-call' || part.type === 'source') {
          content.push(part);
        }
        if (part.type === 'finish') {
          finishReason = part.finishReason;
        }
        if (part.type === 'error') {
          throw part.error;
        }
      }

      return Promise.resolve({ content, finishReason, usage, warnings: [] });
    },

    doStream(options: LanguageModelV4CallOptions) {
      const parts: StreamPart[] = [
        { type: 'stream-start', warnings: [] },
        {
          type: 'response-metadata',
          modelId: MOCK_MODEL.id,
          timestamp: new Date()
        },
        ...script(options.prompt)
      ];

      return Promise.resolve({
        stream: simulateReadableStream({
          chunks: parts,
          initialDelayInMs: 400,
          chunkDelayInMs: 20
        })
      });
    }
  };
}
