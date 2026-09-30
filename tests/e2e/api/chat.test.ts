import { describe, expect, inject, it } from 'vitest';

const MODEL = 'mock/assistant';

// Collect the UI message stream events of a POST to /api/chat.
async function postChat(body: unknown) {
  const response = await fetch(`${inject('baseUrl')}/api/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  });
  const text = await response.text();
  const events = text
    .split('\n')
    .filter((line) => line.startsWith('data: ') && !line.includes('[DONE]'))
    .map((line) => JSON.parse(line.slice(6)) as { type: string } & Record<string, unknown>);
  return { response, text, events };
}

const userMessage = (text: string) => ({
  id: 'user-1',
  role: 'user',
  parts: [{ type: 'text', text }]
});

describe('POST /api/chat (UI message stream protocol)', () => {
  it('streams a text reply as server-sent events', async () => {
    const { response, events } = await postChat({
      model: MODEL,
      messages: [userMessage('hello')]
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/event-stream');
    expect(response.headers.get('x-vercel-ai-ui-message-stream')).toBe('v1');

    const types = events.map((event) => event.type);
    expect(types[0]).toBe('start');
    expect(types).toContain('text-start');
    expect(types.filter((type) => type === 'text-delta').length).toBeGreaterThan(5);
    expect(types).toContain('text-end');
    expect(types.at(-1)).toBe('finish');

    const text = events
      .filter((event) => event.type === 'text-delta')
      .map((event) => event.delta)
      .join('');
    expect(text).toContain('You said: “hello”');
  });

  it('runs a server-executed tool and continues in a second step', async () => {
    const { events } = await postChat({
      model: MODEL,
      messages: [userMessage('What are the GitHub stats for vercel/next.js?')]
    });
    const types = events.map((event) => event.type);

    // Step 1: streamed tool input, then the tool output produced on the server.
    expect(types).toContain('tool-input-start');
    expect(types).toContain('tool-input-delta');
    expect(types).toContain('tool-input-available');
    expect(types).toContain('tool-output-available');

    // Step 2: the model answers using the tool result.
    expect(types.filter((type) => type === 'start-step')).toHaveLength(2);
    expect(types.indexOf('text-start')).toBeGreaterThan(types.indexOf('tool-output-available'));

    const call = events.find((event) => event.type === 'tool-input-available');
    expect(call).toMatchObject({
      toolName: 'github_repo',
      input: { repo: 'vercel/next.js' }
    });
  });

  it("stops after a client-side tool call and waits for the user's answer", async () => {
    const { events } = await postChat({
      model: MODEL,
      messages: [userMessage('Ask me a few clarifying questions first')]
    });
    const types = events.map((event) => event.type);

    const call = events.find((event) => event.type === 'tool-input-available');
    expect(call).toMatchObject({ toolName: 'ask_user' });
    // ask_user has no execute function, so there is no output and no second step.
    expect(types).not.toContain('tool-output-available');
    expect(types.filter((type) => type === 'start-step')).toHaveLength(1);
  });

  it('resumes the conversation once the tool output is supplied', async () => {
    const { events } = await postChat({
      model: MODEL,
      messages: [
        userMessage('Ask me a few clarifying questions first'),
        {
          id: 'assistant-1',
          role: 'assistant',
          parts: [
            {
              type: 'tool-ask_user',
              toolCallId: 'call-1',
              state: 'output-available',
              input: {
                questions: [{ question: 'How many guests?', choices: ['2', '4', '6'] }]
              },
              output: [{ question: 'How many guests?', answer: '4' }]
            }
          ]
        }
      ]
    });

    const text = events
      .filter((event) => event.type === 'text-delta')
      .map((event) => event.delta)
      .join('');
    expect(text).toContain('How many guests?');
    expect(text).toContain('Suggested plan');
  });

  it('sends source citations for a web search', async () => {
    const { events } = await postChat({
      model: MODEL,
      messages: [userMessage('Search the web for React Router news')]
    });

    const sources = events.filter((event) => event.type === 'source-url');
    expect(sources).toHaveLength(3);
    expect(sources[0]).toMatchObject({
      url: expect.stringMatching(/^https:\/\//)
    });
  });

  it('forwards stream errors with a generic message', async () => {
    const { events } = await postChat({
      model: MODEL,
      messages: [userMessage('error')]
    });

    expect(events.find((event) => event.type === 'error')).toMatchObject({
      errorText: 'Something went wrong. Please try again.'
    });
  });

  it('rejects models that are not offered', async () => {
    const { response, text } = await postChat({
      model: 'gpt-5.5',
      messages: []
    });
    expect(response.status).toBe(400);
    expect(JSON.parse(text)).toEqual({
      error: 'Model gpt-5.5 is not available.'
    });
  });

  it('rejects malformed bodies and non-POST requests', async () => {
    const badJson = await fetch(`${inject('baseUrl')}/api/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: 'not json'
    });
    expect(badJson.status).toBe(400);

    const badMessages = await postChat({ model: MODEL, messages: 'nope' });
    expect(badMessages.response.status).toBe(400);

    const get = await fetch(`${inject('baseUrl')}/api/chat`);
    expect(get.status).toBe(405);
  });
});
