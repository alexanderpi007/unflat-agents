import { afterEach, describe, expect, it, vi } from "vitest";
import { swarmCall, swarmErrorDetail } from "./swarm-errors";

afterEach(() => vi.restoreAllMocks());

describe("Swarm diagnostics", () => {
  it("preserves call, message and HTTP status without dumping request secrets", () => {
    const detail = swarmErrorDetail("uploadData", { message: "postage batch not usable", response: { status: 400 }, config: { secret: "never log" } });
    expect(detail).toBe("uploadData — status: 400 — postage batch not usable");
    expect(detail).not.toContain("never log");
  });
  it("redacts references, keys and URL queries while retaining SDK error text", () => {
    const secret = "ab".repeat(64);
    const detail = swarmErrorDetail("uploadData", new Error(`HTTP 503: unavailable https://bee.example/bytes/${secret}?token=private-token Bearer private-token`));
    expect(detail).toContain("status: 503");
    expect(detail).toContain("unavailable");
    expect(detail).not.toContain(secret);
    expect(detail).not.toContain("private-token");
  });
  it("logs and throws the same safe call-specific failure; retry is possible", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(swarmCall("uploadData", async () => { throw new Error("stamp unavailable"); })).rejects.toThrow("uploadData — status: not supplied by SDK — stamp unavailable");
    expect(log).toHaveBeenCalledWith("[Swarm ID] uploadData — status: not supplied by SDK — stamp unavailable");
    await expect(swarmCall("uploadData", async () => "ok")).resolves.toBe("ok");
  });
});
