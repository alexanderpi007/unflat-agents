import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import Home, { dynamic } from "./page";

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

it("renders Owner mode in the initial local HTML, without a demo API response", () => {
  vi.stubGlobal("React", React);
  vi.stubEnv("VERCEL", "");
  expect(dynamic).toBe("force-dynamic");
  expect(renderToStaticMarkup(Home())).toContain('class="owner-mode-toggle"');
});

it("omits Owner mode from Vercel HTML even when owner credentials exist", () => {
  vi.stubGlobal("React", React);
  vi.stubEnv("VERCEL", "1");
  vi.stubEnv("OWNER_TOKEN", "synthetic-owner-token-not-a-secret");
  expect(renderToStaticMarkup(Home())).not.toContain('class="owner-mode-toggle"');
});
