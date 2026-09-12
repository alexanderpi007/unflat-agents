import { describe, expect, it } from "vitest";
import { encryptedReference, plainStatement } from "./owner-statement";
import { POST } from "@/app/api/statements/route";
import { OwnerBrowserStatementStorage } from "@/adapters/live/swarm";

describe("owner-held Swarm boundary", () => {
  it("rejects plaintext, partial, and non-hex references", () => {
    for (const value of ["a".repeat(64), "g".repeat(128), "https://example.com/" + "a".repeat(128)]) {
      expect(() => encryptedReference(value)).toThrow("128-character");
    }
    expect(encryptedReference("  " + "ab".repeat(64) + "\n")).toBe("ab".repeat(64));
  });

  it("decodes retrieved bytes without an agent record", () => {
    expect(plainStatement(new TextEncoder().encode('{"reason":"REFUSED"}'))).toContain('"reason": "REFUSED"');
  });

  it("refuses server publication and returns JSON browser instructions", async () => {
    await expect(new OwnerBrowserStatementStorage().upload()).rejects.toThrow("OWNER RECORD");
    const response = await POST();
    expect(response.status).toBe(409);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toMatchObject({ error: "Owner browser required.", detail: expect.stringContaining("never send a reference") });
  });
});
