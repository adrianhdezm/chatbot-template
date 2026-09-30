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
  await stopButton(page).or(page.getByText('Thinking…')).first().waitFor();
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

  it('streams a markdown reply with syntax-highlighted code', async () => {
    await page.getByRole('button', { name: 'Tell me a story' }).click();
    await waitForReply(page);

    const reply = lastAssistantMessage(page);
    await expect(reply.locator('h1').innerText()).resolves.toBe('The Lighthouse Keeper');
    expect(await reply.locator('table').count()).toBe(1);
    expect(await reply.locator('blockquote').count()).toBe(1);
    expect(await reply.locator('.shiki').count()).toBe(1);
    expect(await reply.getByRole('button', { name: 'Copy code' }).count()).toBe(1);
  });

  it('shows a server-executed tool call and the follow-up answer', async () => {
    await send(page, 'What are the GitHub stats for vercel/next.js?');
    await waitForReply(page);

    const reply = await lastAssistantMessage(page).innerText();
    // The lookup hits the real GitHub API, so accept either outcome.
    expect(reply).toMatch(/vercel\/next\.js/);
    expect(reply).toMatch(/stats for|couldn't fetch/i);
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
    const reply = await lastAssistantMessage(page).innerText();
    expect(reply).toContain('5–8');
    expect(reply).toContain('Pescatarian');
    expect(reply).toContain('Suggested plan');
    expect(await page.locator('[data-slot="questionnaire"]').count()).toBe(0);
  });

  it('lists the sources of a web search in a drawer', async () => {
    await send(page, 'Search the web for the latest React Router release');
    await waitForReply(page);

    await expect(lastAssistantMessage(page).innerText()).resolves.toContain('Searched the web');
    await page.getByRole('button', { name: 'Searched 3 websites' }).click();
    const drawer = page.getByRole('dialog');
    await drawer.waitFor();
    expect(await drawer.locator('a[href^="https://"]').count()).toBe(3);
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
