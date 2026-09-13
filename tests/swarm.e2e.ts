import { expect, test, type BrowserContext } from "@playwright/test";
import { ownerFixture } from "./owner-ui-fixture";
import { proxyFixture } from "./swarm-proxy-fixture";
import { runDemo } from "../src/demo/run";
import realRun from "../public/real-run.json" with { type: "json" };
import previousRealRun from "../public/real-runs/atlas-2026-09-12.json" with { type: "json" };

const secret = "ab".repeat(64); // Synthetic test reference; never a live drive reference.

test("account sculpture follows scroll, respects reduced motion and never executes an action", async ({ page }) => {
  const mutations: string[] = [];
  const errors: string[] = [];
  page.on("request", request => {
    if (request.url().includes("/api/") && request.method() === "POST") mutations.push(request.url());
  });
  page.on("pageerror", error => errors.push(error.message));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("http://localhost:3107");
  const introduction = page.locator(".problem-block");
  const progress = () => introduction.evaluate(element => Number(getComputedStyle(element).getPropertyValue("--account-progress")));
  await expect(introduction).toHaveAttribute("data-motion", "scroll");
  expect(await progress()).toBe(0);
  await page.evaluate(() => window.scrollTo(0, 500));
  await expect.poll(progress).toBeGreaterThan(0.4);
  await page.screenshot({ path: "test-results/account-expanded-desktop.png" });
  await page.getByRole("link", { name: "See the real runs", exact: false }).click();
  await expect(page).toHaveURL(/#top$/);
  await page.screenshot({ path: "test-results/account-receipts-desktop.png" });
  await page.screenshot({ path: "test-results/account-page-desktop.png", fullPage: true });
  for (const width of [390, 768]) {
    await page.setViewportSize({ width, height: 900 });
    await introduction.scrollIntoViewIfNeeded();
    await page.evaluate(() => window.scrollTo(0, 620));
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `test-results/account-expanded-${width}.png` });
  }
  await page.setViewportSize({ width: 390, height: 900 });
  await page.locator(".demo-object").scrollIntoViewIfNeeded();
  await page.screenshot({ path: "test-results/account-receipts-mobile.png" });
  await page.screenshot({ path: "test-results/account-page-mobile.png", fullPage: true });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(introduction).toHaveAttribute("data-motion", "reduced");
  const transform = () => page.locator(".account-stack").evaluate(element => getComputedStyle(element).transform);
  const still = await transform();
  await page.evaluate(() => window.scrollTo(0, 0));
  expect(await transform()).toBe(still);
  expect(await progress()).toBe(0.35);
  await expect(page.locator(".scroll-cue")).toBeHidden();
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await expect(introduction).toHaveAttribute("data-motion", "scroll");
  await expect.poll(progress).toBe(0);
  expect(mutations).toEqual([]);
  expect(errors).toEqual([]);
});

test("problem block leads the hero and its full display headline fits five mobile lines", async ({ page }) => {
  await page.goto("http://localhost:3107");
  const problem = page.getByRole("region", { name: "Your agent has a wallet. It doesn't have a bank.", exact: true });
  await expect(problem).toContainText('A wallet is a key. A bank is limits, statements, and a way to say no. Every "AI wallet" ships the key and skips the rest.');
  await expect(problem).toContainText("We built the bank.");
  expect(await problem.evaluate(element => Boolean(element.compareDocumentPosition(document.querySelector(".hero")!) & Node.DOCUMENT_POSITION_FOLLOWING))).toBe(true);
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    const layout = await page.locator("#problem-heading").evaluate(element => {
      const style = getComputedStyle(element);
      return { lines: Math.round(element.getBoundingClientRect().height / parseFloat(style.lineHeight)), fontSize: style.fontSize,
        overflow: document.documentElement.scrollWidth > innerWidth };
    });
    expect(layout.fontSize).toBe("48px");
    expect(layout.lines).toBeLessThanOrEqual(5);
    expect(layout.overflow).toBe(false);
    await page.screenshot({ path: `test-results/problem-${width}.png`, animations: "disabled" });
  }
});

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
  await expect(page.getByRole("heading", { name: `Meet ${realRun.snapshot.agent.displayName}`, exact: true })).toBeVisible();
  await expect(page.locator(".hero-refused")).toContainText(`${realRun.snapshot.agent.displayName} cannot spend again`);
  await expect(page.locator(`#proofs a[title="${realRun.snapshot.agent.ensName}"]`)).toHaveAttribute("href", `https://explorer.ens.dev/${realRun.snapshot.agent.ensName}`);
  await expect(page.getByRole("button", { name: "Owner mode", exact: true })).toBeVisible();
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

test("real-run tabs keep identities, stories and proofs isolated; simulation is secondary", async ({ page }) => {
  let posts = 0;
  page.on("request", request => { if (request.method() === "POST" && request.url().includes("/api/demo")) posts++; });
  await page.goto("http://localhost:3107");
  const summary = page.locator(".run-account-summary");
  const current = page.locator(".story-content > .timeline");
  await expect(summary).toContainText("nova.agents.unflat.eth");
  await expect(summary).toContainText("Owner: Giacomo (email hidden)");
  await expect(summary).toContainText("owner-owned wallet");
  await expect(summary).toContainText("Claude.ai");
  await expect(page.locator(".run-story li")).toHaveCount(6);
  await expect(page.locator(".run-story")).toContainText("not a chat transcript");
  await expect(page.locator(".run-budget-left")).toHaveText("$0.15 left when permission expired.");
  await expect(current).toContainText("nova sends USDC");
  await expect(page.locator(".demo-object .simulation-button")).toHaveCount(0);
  await expect(page.locator(".simulation-section .simulation-button")).toBeVisible();
  await page.getByRole("button", { name: "Previous real runs", exact: true }).click();
  await expect(summary).toContainText("atlas.agents.unflat.eth");
  await expect(summary).toContainText("app-owned (legacy) wallet");
  await expect(summary).toContainText("Claude Code");
  await expect(current).toContainText("Atlas sends USDC");
  await expect(current).not.toContainText("nova");
  await expect(page.locator(".hero-refused")).toContainText("Atlas cannot spend again");
  await expect(page.locator(".demo-stepper .step-done")).toHaveCount(4);
  for (const run of [realRun, previousRealRun]) {
    for (const action of ["usdc.transfer", "earn.approve", "earn.sweep"]) {
      const hash = run.snapshot.events.find(e => e.action === action && e.status === "completed")!.reference;
      await expect(page.locator(`.real-run-proofs a[href="https://basescan.org/tx/${hash}"]`)).toBeVisible();
    }
  }
  await page.getByRole("button", { name: "Latest real run · nova", exact: true }).click();
  await expect(summary).toContainText("nova.agents.unflat.eth");
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: "test-results/real-runs-desktop.png", animations: "disabled" });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator(".demo-stepper li")).toHaveCount(4);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: "test-results/real-runs-mobile.png", animations: "disabled" });
  expect(posts).toBe(0);
});

test("remote Owner mode opens email login without exposing operator controls", async ({ page }) => {
  // Tunnel equivalent: browser sees HTTPS/non-loopback; preserve its Host at the local gateway.
  await page.route("https://owner-demo.example/**", async route => {
    const url = new URL(route.request().url());
    // Login availability must not depend on the ENS/demo-state endpoint succeeding.
    if (url.pathname === "/api/demo") return route.fulfill({ status: 503, json: { error: "Demo state unavailable" } });
    const response = await route.fetch({ url: `http://localhost:3107${url.pathname}${url.search}`,
      headers: { ...route.request().headers(), host: url.host } });
    await route.fulfill({ response });
  });
  await page.goto("https://owner-demo.example");
  const live = page.getByRole("button", { name: "Run LIVE (Base mainnet)", exact: true });
  await expect(live).toHaveCount(0);
  await page.getByRole("button", { name: "Owner mode", exact: true }).click();
  await expect(live).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Log in with email", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Log in with email", exact: true })).toBeInViewport();
  await expect(page.getByLabel("Owner token", { exact: true })).toHaveCount(0);
  expect(page.url()).not.toContain("token");
  await expect(live).toHaveCount(0);
  await page.unrouteAll({ behavior: "ignoreErrors" });
});

test("owner approvals require a separate typed confirmation for each request", async ({ page }) => {
  const id = "a7100000-0000-4000-8000-000000000088";
  const pending = [{ id, agentId: "test-agent", purpose: "Pay five cents and save one dollar." }];
  const actions: unknown[] = [];
  await page.route("**/api/owner/approvals", async route => {
    expect(route.request().headers().authorization).toBe("Bearer test.privy.jwt");
    if (route.request().method() === "POST") {
      actions.push(route.request().postDataJSON()); pending.length = 0;
      return route.fulfill({ json: { status: "approved" } });
    }
    return route.fulfill({ json: { pending, moneyMode: "mock", recipient: "test-recipient", vault: "test-vault" } });
  });
  await ownerFixture(page);
  const approve = page.getByRole("button", { name: "Approve (2 minutes, $1.20 cap)", exact: true });
  await expect(approve).toBeDisabled();
  await page.getByLabel("Type CONFIRM to approve this budget").fill("confirm");
  await expect(approve).toBeDisabled();
  await page.getByLabel("Type CONFIRM to approve this budget").fill("CONFIRM");
  await approve.click();
  await expect(page.getByText("Approved. The agent has two minutes to act.")).toBeVisible();
  expect(actions).toEqual([{ id, action: "approve", confirmation: "CONFIRM" }]);
  await expect(page.getByRole("button", { name: "Run LIVE (Base mainnet)", exact: true })).toHaveCount(0);
});

test("approval deep link shows one request and persists approved state after reload", async ({ page }) => {
  const id = "a7100000-0000-4000-8000-000000000066";
  let status = "pending";
  await page.route("**/api/owner/approvals*", async route => {
    expect(route.request().headers().authorization).toBe("Bearer test.privy.jwt");
    if (route.request().method() === "POST") {
      expect(route.request().postDataJSON()).toEqual({ id, action: "approve", confirmation: "CONFIRM" });
      status = "approved";
      return route.fulfill({ json: { status } });
    }
    expect(new URL(route.request().url()).searchParams.get("request")).toBe(id);
    return route.fulfill({ json: { request: { id, status }, moneyMode: "mock", pending: status === "pending" ? [
      { id, agentId: "selected", purpose: "Only this request" },
      { id: "other", agentId: "other", purpose: "Must not appear" },
    ] : [] } });
  });
  await ownerFixture(page, id);
  await expect(page.getByText("Only this request", { exact: true })).toBeVisible();
  await expect(page.getByText("Must not appear", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Owner accounts" })).toHaveCount(0);
  const approve = page.getByRole("button", { name: "Approve (2 minutes, $1.20 cap)", exact: true });
  await expect(approve).toBeDisabled();
  await page.getByLabel("Type CONFIRM to approve this budget").fill("CONFIRM");
  await approve.click();
  await expect(page.getByText("Approved — your agent can act for 2 minutes", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText("Approved — your agent can act for 2 minutes", { exact: true })).toBeVisible();
  await expect(approve).toHaveCount(0);
});

test("owner lists separate funding addresses and confirms only the selected account", async ({ page }) => {
  const accounts = ["nova", "luna"].map((name, index) => ({
    id: `a7100000-0000-4000-8000-00000000000${index + 1}`, name: `${name}.agents.unflat.eth`,
    fundingAddress: `0x${String(index + 1).repeat(40)}`, status: "ready",
    balance: index === 0 ? { amountUsdcCents: 250 } : null,
    mandate: { allowed: false, reason: "No mandate exists." }, ensExplorerUrl: `https://explorer.ens.dev/${name}.agents.unflat.eth`,
  }));
  const actions: unknown[] = [];
  await page.route("**/api/owner/approvals", route => route.fulfill({ json: { pending: [], moneyMode: "mock" } }));
  await page.route("**/api/owner/accounts", async route => {
    expect(route.request().headers().authorization).toBe("Bearer test.privy.jwt");
    if (route.request().method() === "POST") {
      actions.push(route.request().postDataJSON());
      return route.fulfill({ json: { status: "approved" } });
    }
    return route.fulfill({ json: { accounts, moneyMode: "mock", recipient: "recipient", vault: "vault" } });
  });
  await ownerFixture(page);
  const section = page.getByRole("region", { name: "Owner accounts" });
  await expect(section).toContainText(accounts[0].fundingAddress);
  await expect(section).toContainText(accounts[1].fundingAddress);
  await expect(section).toContainText("$2.50 USDC");
  await expect(section).toContainText("Balance unavailable");
  const nova = section.getByRole("button", { name: "Grant budget to nova.agents.unflat.eth", exact: true });
  const luna = section.getByRole("button", { name: "Grant budget to luna.agents.unflat.eth", exact: true });
  await expect(nova).toBeDisabled(); await expect(luna).toBeDisabled();
  await section.getByLabel("Type CONFIRM for nova.agents.unflat.eth", { exact: true }).fill("confirm");
  await expect(nova).toBeDisabled();
  await section.getByLabel("Type CONFIRM for nova.agents.unflat.eth", { exact: true }).fill("CONFIRM");
  await expect(luna).toBeDisabled(); await nova.click();
  await expect(section.getByRole("status")).toContainText("Budget granted for this account");
  expect(actions).toEqual([{ accountId: accounts[0].id, requestId: expect.any(String), confirmation: "CONFIRM" }]);
  await expect(nova).toBeDisabled(); await expect(luna).toBeDisabled();
});

test("owner-owned recovery is per account, clearly labelled and separately CONFIRM gated", async ({ page }) => {
  const id = "a7100000-0000-4000-8000-000000000033";
  const vault = `0x${"2".repeat(40)}`;
  const actions: unknown[] = [];
  await page.route("**/api/owner/approvals", route => route.fulfill({ json: { pending: [], moneyMode: "mock" } }));
  await page.route("**/api/owner/accounts", route => route.fulfill({ json: { moneyMode: "mock", vault, accounts: [{
    id, name: "nova.agents.unflat.eth", ownerEmail: "owner@example.com", ownership: "privy-user", ownerPortalUrl: "/owner-wallet",
    fundingAddress: `0x${"3".repeat(40)}`, balance: null, status: "ready", mandate: { allowed: false, reason: "Expired" }, ensExplorerUrl: "https://explorer.ens.dev",
  }] } }));
  await page.route("**/api/owner/recovery", async route => {
    expect(route.request().headers().authorization).toBe("Bearer test.privy.jwt");
    actions.push(route.request().postDataJSON());
    return route.fulfill({ json: { transactionHash: `0x${"6".repeat(64)}`, sharesRedeemedRaw: "123", assetsReceivedRaw: "1000000" } });
  });
  await ownerFixture(page);
  const section = page.getByRole("region", { name: "Owner accounts" });
  await expect(section).toContainText("Owner-owned · owner@example.com");
  await expect(section.getByRole("link", { name: "Log in on Privy to withdraw or revoke ↗" })).toHaveAttribute("href", "/owner-wallet");
  await section.getByText("Owner recovery through the gateway", { exact: true }).click();
  const execute = section.getByRole("button", { name: "Execute owner recovery" });
  await expect(execute).toBeDisabled();
  await section.getByLabel("Raw vault shares (from deposit receipt)").fill("123");
  await section.getByLabel("Type CONFIRM for this recovery").fill("confirm");
  await expect(execute).toBeDisabled();
  await section.getByLabel("Type CONFIRM for this recovery").fill("CONFIRM");
  await section.getByLabel("Recovery action").selectOption("owner.transfer");
  await expect(execute).toBeDisabled();
  await section.getByLabel("Recovery action").selectOption("earn.recall");
  await section.getByLabel("Type CONFIRM for this recovery").fill("CONFIRM");
  await execute.click();
  await expect(section).toContainText("Recalled 123 raw shares");
  await expect(execute).toBeDisabled();
  expect(actions).toEqual([{ accountId: id, action: "earn.recall", sharesRaw: "123", vaultAddress: vault, confirmation: "CONFIRM", requestId: expect.any(String) }]);
  await expect(section.getByRole("button", { name: "Grant budget to nova.agents.unflat.eth" })).toBeDisabled();
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
