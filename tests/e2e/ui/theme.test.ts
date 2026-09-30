import { chromium, type Browser, type Page } from "playwright"
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest"

async function openChat(page: Page) {
  await page.goto(inject("baseUrl"))
  await page.getByText("What can I help with?").waitFor()
}

describe("theme", () => {
  let browser: Browser

  beforeAll(async () => {
    browser = await chromium.launch({ headless: inject("headless") })
  })

  afterAll(async () => {
    await browser.close()
  })

  const isDark = (page: Page) =>
    page.evaluate(() => ({
      dark: document.documentElement.classList.contains("dark"),
      colorScheme: document.documentElement.style.colorScheme,
    }))

  it("follows the OS preference by default", async () => {
    const context = await browser.newContext({ colorScheme: "dark" })
    const page = await context.newPage()
    await openChat(page)
    expect(await isDark(page)).toEqual({ dark: true, colorScheme: "dark" })
    await context.close()
  })

  it("toggles with the d hotkey and persists across reloads", async () => {
    const context = await browser.newContext({ colorScheme: "dark" })
    const page = await context.newPage()
    await openChat(page)

    await page.locator("body").click()
    await page.keyboard.press("d")
    await page.waitForFunction(
      () => !document.documentElement.classList.contains("dark")
    )
    expect(await page.evaluate(() => localStorage.getItem("theme"))).toBe(
      "light"
    )

    await page.reload()
    await openChat(page)
    expect((await isDark(page)).dark).toBe(false)
    await context.close()
  })

  it("follows a live OS preference change while set to system", async () => {
    const context = await browser.newContext({ colorScheme: "light" })
    const page = await context.newPage()
    await openChat(page)
    expect((await isDark(page)).dark).toBe(false)

    await page.emulateMedia({ colorScheme: "dark" })
    await page.waitForFunction(() =>
      document.documentElement.classList.contains("dark")
    )
    await context.close()
  })

  it("applies the stored theme before hydration", async () => {
    const context = await browser.newContext({ colorScheme: "light" })
    const page = await context.newPage()
    await openChat(page)
    await page.evaluate(() => localStorage.setItem("theme", "dark"))

    // Block every script bundle: only the inline theme script can run.
    await page.route("**/*", (route) =>
      route.request().resourceType() === "script"
        ? route.abort()
        : route.continue()
    )
    await page.goto(inject("baseUrl"), { waitUntil: "domcontentloaded" })
    expect((await isDark(page)).dark).toBe(true)
    await context.close()
  })
})
