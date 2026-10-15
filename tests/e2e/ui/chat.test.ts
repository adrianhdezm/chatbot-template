import { type Browser, type Page, chromium } from 'playwright';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest';

async function openChat(page: Page) {
  await page.goto(inject('baseUrl'));
  await page.getByText('What can I help with?').waitFor();
}

async function send(page: Page, text: string) {
  await page.getByPlaceholder('Send a message…').fill(text);
  await page.keyboard.press('Enter');
}

const sendButton = (page: Page) => page.getByRole('button', { name: 'Send message' });

const stopButton = (page: Page) => page.getByRole('button', { name: 'Stop generating' });

// Wait for a request to start (stop button or thinking indicator) and then
// for the response to finish (send button back).
async function waitForReply(page: Page) {
  await stopButton(page)
    .or(page.getByText('Thinking', { exact: true }))
    .first()
    .waitFor();
  await sendButton(page).waitFor();
}

const assistantMessages = (page: Page) => page.locator('[data-slot="message"][data-align="start"]');

const lastAssistantMessage = (page: Page) => assistantMessages(page).last();

describe('chat page', () => {
  let browser: Browser;
  let page: Page;

  beforeAll(async () => {
    browser = await chromium.launch({ headless: inject('headless') });
  });

  afterAll(async () => {
    await browser.close();
  });

  beforeEach(async () => {
    page = await browser.newPage();
    await openChat(page);
  });

  afterEach(async () => {
    await page.context().close();
  });

  it('offers the mock model when no API key is configured', async () => {
    await expect(page.getByRole('combobox', { name: 'Model' }).innerText()).resolves.toContain('Mock assistant');
    expect(await page.getByRole('button', { name: 'Tell me a story' }).count()).toBe(1);
  });

  it('streams a markdown reply with a syntax-highlighted code block', async () => {
    await page.getByRole('button', { name: 'Tell me a story' }).click();
    await waitForReply(page);

    const reply = lastAssistantMessage(page);
    await expect(reply.locator('h1').innerText()).resolves.toBe('The Lighthouse Keeper');
    expect(await reply.locator('table').count()).toBe(1);
    expect(await reply.locator('blockquote').count()).toBe(1);

    const codeBlock = reply.locator('[data-slot="code-block"]');
    expect(await codeBlock.count()).toBe(1);
    await expect(codeBlock.locator('[data-slot="code-block-title"]').innerText()).resolves.toBe('ts');
    // Shiki colors tokens through CSS variables once the grammar has loaded.
    await codeBlock.locator('span[style*="--shiki-light"]').first().waitFor();
    expect(await codeBlock.getByRole('button', { name: 'Copy' }).count()).toBe(1);
  });

  it('shows reasoning and a server-executed tool call as steps in a trace', async () => {
    await send(page, 'What are the GitHub stats for vercel/next.js?');
    await waitForReply(page);

    const reply = lastAssistantMessage(page);
    const trace = reply.locator('[data-slot="trace"]').first();
    // The model reasons first, then calls the tool: both are steps in one Trace.
    await expect(trace.innerText()).resolves.toMatch(/^Thought/);
    // The lookup hits the real GitHub API, so accept either outcome.
    const step = trace.getByRole('button', { name: /(Looked up|Failed to look up) vercel\/next\.js/ });
    expect(await step.count()).toBe(1);

    await step.click();
    await reply.locator('[data-slot="code-block"]').waitFor();
    await expect(reply.innerText()).resolves.toMatch(/stats for|couldn't fetch/i);
  });

  it('asks clarifying questions and resumes after they are answered', async () => {
    await send(page, 'Help me plan a dinner, ask me a few clarifying questions first');
    await page.getByText('How many guests are you expecting?').waitFor();

    await page.locator('input[name="q0"][value="5–8"]').check();
    await page.getByRole('button', { name: 'Next' }).click();
    await page.getByText('Any dietary preference?').waitFor();
    await page.getByLabel('Another answer').locator('visible=true').fill('Pescatarian');
    await page.getByRole('button', { name: 'Answer' }).click();

    await waitForReply(page);
    const reply = lastAssistantMessage(page);
    const text = await reply.innerText();
    expect(text).toContain('5–8');
    expect(text).toContain('Pescatarian');
    expect(text).toContain('Suggested plan');
    expect(await page.locator('[data-slot="questionnaire"]').count()).toBe(0);
    // The answered questions collapse into a step of the trace.
    expect(await reply.getByRole('button', { name: 'Asked 2 questions' }).count()).toBe(1);
  });

  it('lists the sources of a web search', async () => {
    await send(page, 'Search the web for the latest React Router release');
    await waitForReply(page);

    const reply = lastAssistantMessage(page);
    await expect(reply.innerText()).resolves.toContain('Searched the web');
    const sources = reply.locator('a[target="_blank"]:has([data-slot="trace-line"])');
    await expect(sources.first().isVisible()).resolves.toBe(false);

    await reply.getByRole('button', { name: 'Used 3 sources' }).click();
    await sources.first().waitFor();
    expect(await sources.count()).toBe(3);
  });

  it('shows reasoning as a timed, collapsible step', async () => {
    await send(page, 'Think about it before answering');
    await waitForReply(page);

    const reply = lastAssistantMessage(page);
    const step = reply.getByRole('button', { name: /^Thought \d+s$/ });
    expect(await step.count()).toBe(1);
    // Open while the model thinks, collapsed once it is done.
    const reasoning = reply.getByText('Let me work through this step by step', { exact: false });
    await expect(reasoning.isVisible()).resolves.toBe(false);

    await step.click();
    await reasoning.waitFor();
    await expect(reply.innerText()).resolves.toContain('the obvious solution holds up');
  });

  it('copies a reply and retries the last one', async () => {
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
    await send(page, 'hello');
    await waitForReply(page);

    const footer = lastAssistantMessage(page).locator('[data-slot="message-footer"]');
    await footer.getByRole('button', { name: 'Copy' }).click();
    await footer.getByRole('button', { name: 'Copied' }).waitFor();
    await expect(page.evaluate(() => navigator.clipboard.readText())).resolves.toContain('You said: “hello”');

    await footer.getByRole('button', { name: 'Retry' }).click();
    await waitForReply(page);
    // Retry replaces the last reply instead of appending a new one.
    expect(await assistantMessages(page).count()).toBe(1);
    await expect(lastAssistantMessage(page).innerText()).resolves.toContain('You said: “hello”');
  });

  it('keeps the newest streamed content in view', async () => {
    await page.getByRole('button', { name: 'Tell me a story' }).click();
    await waitForReply(page);

    // The reply is taller than the viewport, so following the stream means the
    // end of the last message is visible and the "scroll to end" button is idle.
    const viewport = page.getByRole('region', { name: 'Messages' });
    const { messageBottom, viewportBottom } = await viewport.evaluate((element) => {
      const items = element.querySelectorAll('[data-slot="message-scroller-item"]');
      const last = items[items.length - 1];
      return {
        messageBottom: last?.getBoundingClientRect().bottom ?? Number.POSITIVE_INFINITY,
        viewportBottom: element.getBoundingClientRect().bottom
      };
    });
    expect(messageBottom).toBeLessThanOrEqual(viewportBottom + 1);
    await expect(page.getByRole('button', { name: 'Scroll to end' }).getAttribute('data-active')).resolves.toBe('false');
  });

  it('can stop a response while it streams', async () => {
    await send(page, 'tell me a story');
    // Let the reply start streaming, then interrupt it.
    await lastAssistantMessage(page).locator('h1').waitFor();
    await stopButton(page).click();
    await sendButton(page).waitFor();

    const reply = await lastAssistantMessage(page).innerText();
    expect(reply).toContain('The Lighthouse Keeper');
    expect(reply).not.toContain('came home');
    expect(await page.getByText('Request failed').count()).toBe(0);
  });

  it('surfaces stream errors', async () => {
    await send(page, 'error');
    await page.getByText('Request failed').waitFor();
    expect(await page.getByText('Something went wrong. Please try again.').count()).toBe(1);
  });

  it('starts over with New Chat', async () => {
    await send(page, 'hello');
    await waitForReply(page);
    await page.getByRole('button', { name: 'New Chat' }).click();
    await page.getByText('What can I help with?').waitFor();
    expect(await assistantMessages(page).count()).toBe(0);
  });
});
