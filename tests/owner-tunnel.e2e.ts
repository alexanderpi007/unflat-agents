import { expect, test } from "@playwright/test";

test("actual HTTPS tunnel: one click opens the inline owner token form", async ({ page }, testInfo) => {
  const errors: string[] = [];
  const writes: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  page.on("request", request => { if (request.method() === "POST") writes.push(request.url()); });
  // Effects start only after hydration; a static HTML button alone is not a passing test.
  const hydrated = page.waitForRequest(request => new URL(request.url()).pathname === "/api/health");
  await page.goto("/");
  await hydrated;
  expect(new URL(page.url()).protocol).toBe("https:");
  expect(new URL(page.url()).hostname).not.toMatch(/^(localhost|127\.0\.0\.1)$/);
  const owner = page.getByRole("button", { name: "Owner mode", exact: true });
  await owner.click();
  await expect(owner).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByLabel("Owner token", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Unlock Owner mode", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Run LIVE (Base mainnet)", exact: true })).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath("owner-inline.png") });
  expect(errors).toEqual([]);
  expect(writes).toEqual([]);
});
