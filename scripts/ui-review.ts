import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { runDemo } from "../src/demo/run";
import { proxyFixture } from "../tests/swarm-proxy-fixture";

// Isolated presentation fixtures only: no live API POST, wallet, or storage calls.
const directory = process.argv[2];
if (!directory) throw new Error("Pass an output directory for screenshots.");
await mkdir(directory, { recursive: true });
const demo = await runDemo({ publishMockStatement: false });
const browser = await chromium.launch();
for (const width of [1440, 390]) {
  const context = await browser.newContext({ viewport: { width, height: width === 1440 ? 900 : 844 } });
  await context.route("https://swarm-id.snaha.net/**", route => route.fulfill({ contentType: "text/html", body: proxyFixture }));
  await context.route("**/api/demo", route => route.fulfill({ json: { state: null, localLiveAvailable: false } }));
  await context.route("**/api/vault", route => route.fulfill({ json: { apyBasisPoints: null, source: "mock-unavailable", vault: { label: "Steakhouse Prime USDC", address: "0xbeef0e0834849aCC03f0089F01f4F1Eeb06873C9" } } }));
  await context.route("**/api/health", route => route.fulfill({ json: demo.health }));
  await context.addInitScript(({ snapshot }) => {
    const realFetch = window.fetch;
    window.fetch = async (input, init) => {
      if (input === "/api/demo" && init?.method === "POST") {
        const encoder = new TextEncoder();
        const start = Date.now();
        snapshot.mandate.expiresAt = new Date(start + 120_000).toISOString();
        const active = { ...snapshot, events: snapshot.events.filter(event => event.status !== "refused") };
        return new Response(new ReadableStream({ start(controller) {
          controller.enqueue(encoder.encode(JSON.stringify({ snapshot: active, moneyMode: "mock", phase: "Waiting for expiry" }) + "\n"));
          setTimeout(() => {
            controller.enqueue(encoder.encode(JSON.stringify({ snapshot, moneyMode: "mock", phase: "EXPIRED", expired: true }) + "\n"));
            controller.close();
          }, 6000);
        } }), { headers: { "Content-Type": "application/x-ndjson" } });
      }
      return realFetch(input, init);
    };
  }, { snapshot: demo.snapshot });
  const page = await context.newPage();
  await page.goto("http://localhost:3107");
  await page.getByText("Press run. Two minutes. Watch it stop.").waitFor();
  await page.screenshot({ path: `${directory}/${width}-before.png` });
  console.log(JSON.stringify({ width, state: "before", overflow: await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), heroBottom: await page.locator(".hero").evaluate(el => el.getBoundingClientRect().bottom) }));
  await page.getByRole("button", { name: "Run the demo →", exact: true }).click();
  await page.locator(".hero-clock").waitFor();
  await page.screenshot({ path: `${directory}/${width}-during.png`, animations: "disabled" });
  await page.locator(".hero-refused").waitFor();
  await page.screenshot({ path: `${directory}/${width}-after.png`, animations: "disabled" });
  if (width === 390) {
    await page.getByRole("button", { name: "Dismiss refusal banner" }).click();
    await page.screenshot({ path: `${directory}/${width}-dismissed.png` });
  }
  console.log(JSON.stringify({ width, state: "after", overflow: await page.evaluate(() => document.documentElement.scrollWidth > innerWidth) }));
  await context.close();
}
await browser.close();
