import { expect, test, type BrowserContext } from "@playwright/test";
import { proxyFixture } from "./swarm-proxy-fixture";
import { runDemo } from "../src/demo/run";
import realRun from "../public/real-run.json" with { type: "json" };

const secret = "ab".repeat(64); // Synthetic test reference; never a live drive reference.

test("opens on read-only real proofs, replaces them with a simulation, and returns", async ({ page }) => {
  let posts = 0;
  await page.route("**/api/demo", async route => {
    if (route.request().method() === "GET") return route.fulfill({ json: { state: null, localLiveAvailable: false } });
    posts++;
    const demo = await runDemo();
    return route.fulfill({ contentType: "application/x-ndjson", body: JSON.stringify({ snapshot: demo.snapshot, moneyMode: "mock", phase: "EXPIRED", expired: true }) + "\n" });
  });
  await page.goto("http://localhost:3107");
  await expect(page.getByText(realRun.label, { exact: true })).toBeVisible();
  await expect(page.locator(".demo-stepper .step-done")).toHaveCount(4);
  const current = page.locator(".story-content > .timeline");
  await expect(current).not.toContainText("Simulated:");
  const deposit = realRun.snapshot.events.find(event => event.action === "earn.sweep")!.reference;
  await expect(current.locator(`a[href="https://basescan.org/tx/${deposit}"]`)).toBeVisible();
  expect(posts).toBe(0);
  await page.getByRole("button", { name: "Run a simulation →", exact: true }).click();
  await expect(current).toContainText("Simulated:");
  await page.getByRole("button", { name: "Back to the real run", exact: true }).click();
  await expect(current).not.toContainText("Simulated:");
  await expect(page.getByText(realRun.label, { exact: true })).toBeVisible();
  expect(posts).toBe(1);
});

test("localhost shows exact LIVE plan but cannot run without typed confirmation", async ({ page }) => {
  await page.goto("http://localhost:3107");
  const live = page.getByRole("button", { name: "Run LIVE (Base mainnet)", exact: true });
  await expect(live).toHaveCount(0);
  await page.getByRole("button", { name: "Owner mode", exact: true }).click();
  await expect(live).toBeVisible();
  await expect(live).toBeDisabled();
  await expect(page.getByText(/Total 1.05 USDC plus gas/)).toBeVisible();
  await page.locator("#live-confirm").fill("confirm");
  await expect(live).toBeDisabled();
  // Never click LIVE in browser tests. Real chain writes belong to the separate Arkiv test only.
});

test("native encryption request, dev deferred mode, fresh-context retrieval and no gateway reference leak", async ({ browser }) => {
  let stored: { data: number[]; options: { encrypt: boolean; deferred: boolean } } | undefined;
  const gatewayRequests: string[] = [];
  let downloads = 0;
  let simulateError = false;
  let uploadFails = true;
  const consoleMessages: string[] = [];
  async function prepare(context: BrowserContext) {
    // UI-only fixture; real Arkiv is tested separately, never spend testnet gas in this test.
    await context.route("http://localhost:3107/api/demo", async route => {
      if (route.request().method() === "GET") return route.fulfill({ json: { state: null, localLiveAvailable: false } });
      const demo = await runDemo();
      return route.fulfill({ contentType: "application/x-ndjson", body: JSON.stringify({ snapshot: demo.snapshot, moneyMode: "mock", phase: "EXPIRED — gateway refused", expired: true }) + "\n" });
    });
    context.on("console", (message) => consoleMessages.push(message.text()));
    context.on("request", (request) => {
      if (request.url().startsWith("http://localhost:3107")) {
        gatewayRequests.push(request.url() + (request.postData() ?? ""));
      }
    });
    await context.route("https://swarm-id.snaha.net/**", async (route) => {
      if (new URL(route.request().url()).pathname === "/proxy") {
        return route.fulfill({ contentType: "text/html", body: proxyFixture });
      }
      if (route.request().method() === "POST") {
        if (uploadFails) return route.fulfill({ json: { error: `HTTP 400: stamp unavailable ${secret}` } });
        stored = route.request().postDataJSON();
        return route.fulfill({ json: { reference: secret } });
      }
      downloads++;
      return route.fulfill({ json: simulateError ? { error: `Unavailable ${secret}` } : { bytes: stored?.data } });
    });
  }

  const first = await browser.newContext();
  await prepare(first);
  const page = await first.newPage();
  await page.goto("http://localhost:3107");
  await expect(page.getByRole("button", { name: "Publish statement", exact: true })).toBeDisabled();
  await expect(page.locator('#owner-swarm-proxy iframe')).toBeVisible();
  await page.evaluate(() => window.postMessage({ type: "connectionInfoChanged", canUpload: true,
    uploadMode: "user-stamp", identity: { id: "spoof", name: "Spoof", address: "11".repeat(20),
      avatar: { source: "generated", url: "" } } }, window.location.origin));
  await expect(page.getByText("Connected: Spoof · owner drive ready", { exact: true })).toHaveCount(0);
  await page.frameLocator('#owner-swarm-proxy iframe').getByRole("button", { name: "Owner: connect Swarm ID", exact: true }).click();
  await expect(page.getByText("Connected: Test owner · owner drive ready", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Run LIVE (Base mainnet)", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Run a simulation →", exact: true }).click();
  await expect(page.getByText("EXPIRED", { exact: true })).toBeVisible();
  await expect(page.getByText("Action refused", { exact: true })).toBeVisible();
  await expect(page.getByRole("checkbox", { name: "Deferred upload mode", exact: true })).toBeChecked();
  await page.getByRole("button", { name: "Publish statement", exact: true }).click();
  const publicationError = page.locator(".owner-record").getByRole("alert");
  await expect(publicationError).toContainText("SwarmIdClient.uploadData");
  await expect(publicationError).toContainText("status: 400");
  await expect(publicationError).toContainText("stamp unavailable");
  await expect(publicationError).not.toContainText(secret);
  await expect(page.locator("#owner-reference")).toHaveValue("");
  expect(consoleMessages.some((message) => message.includes("SwarmIdClient.uploadData") && message.includes("status: 400"))).toBe(true);
  uploadFails = false;
  await page.getByRole("button", { name: "Publish statement", exact: true }).click();
  await expect(page.locator("#owner-reference")).toHaveValue(secret);
  await expect(page.getByText(/Upload succeeded; retention metadata unavailable/)).toBeVisible();
  expect(stored?.options).toMatchObject({ encrypt: true, deferred: true, useWebSocket: false, useWorkers: true, concurrency: 32 });
  const statement = JSON.parse(new TextDecoder().decode(new Uint8Array(stored!.data)));
  expect(statement.source).toBe("mock-demo");
  expect(statement.events.some((event: { status: string }) => event.status === "refused")).toBe(true);
  expect(statement).not.toHaveProperty("ownerStatementKey");
  expect(statement).not.toHaveProperty("statementReference");
  const storage = await page.evaluate(() => ({ local: { ...localStorage }, session: { ...sessionStorage } }));
  expect(JSON.stringify(storage)).not.toContain(secret);
  await first.close();

  const fresh = await browser.newContext();
  await prepare(fresh);
  const retrievedPage = await fresh.newPage();
  await retrievedPage.goto("http://localhost:3107");
  await expect(retrievedPage.locator("#owner-reference")).toHaveValue("");
  await retrievedPage.frameLocator('#owner-swarm-proxy iframe').getByRole("button", { name: "Owner: connect Swarm ID", exact: true }).click();
  await retrievedPage.locator("#retrieve-reference").fill("not-a-reference");
  await retrievedPage.getByRole("button", { name: "Retrieve", exact: true }).click();
  await expect(retrievedPage.locator(".owner-record").getByRole("alert")).toContainText("128-character");
  expect(downloads).toBe(0);
  await retrievedPage.locator("#retrieve-reference").fill(secret);
  await retrievedPage.getByRole("button", { name: "Retrieve", exact: true }).click();
  await expect(retrievedPage.locator(".retrieved-statement")).toContainText(statement.agent.id);
  expect(downloads).toBe(1);

  simulateError = true;
  await retrievedPage.getByRole("button", { name: "Retrieve", exact: true }).click();
  await expect(retrievedPage.locator(".owner-record").getByRole("alert")).toContainText("Retrieval failed");
  await expect(retrievedPage.locator(".owner-record").getByRole("alert")).not.toContainText(secret);
  await expect(retrievedPage.locator(".retrieved-statement")).toHaveCount(0);
  expect(gatewayRequests.join("\n")).not.toContain(secret);
  expect(gatewayRequests.some((request) => request.includes("/api/statements"))).toBe(false);
  expect(consoleMessages.join("\n")).not.toContain(secret);
  await fresh.close();
});
