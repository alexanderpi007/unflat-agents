import { afterEach, expect, it, vi } from "vitest";
import { verifyPrivyOwner } from "./privy-owner";
const sdk = vi.hoisted(() => ({ verify: vi.fn(), get: vi.fn() }));
vi.mock("@privy-io/node", () => ({ PrivyClient: class {
  utils() { return { auth: () => ({ verifyAccessToken: sdk.verify }) }; }
  users() { return { _get: sdk.get }; }
} }));
afterEach(() => { vi.unstubAllEnvs(); vi.resetAllMocks(); });
it("verifies the access token before looking up its subject and accepts only verified emails", async () => {
  vi.stubEnv("PRIVY_APP_ID", "test-app"); vi.stubEnv("PRIVY_APP_SECRET", "test-secret");
  sdk.verify.mockResolvedValue({ user_id: "did:privy:owner" });
  sdk.get.mockResolvedValue({ id: "did:privy:owner", linked_accounts: [
    { type: "email", address: " Owner@Example.com ", verified_at: 1 },
    { type: "email", address: "unverified@example.com" },
  ] });
  expect(await verifyPrivyOwner("signed-access-token")).toEqual({ userId: "did:privy:owner", emails: ["owner@example.com"] });
  expect(sdk.verify).toHaveBeenCalledWith("signed-access-token");
  expect(sdk.get).toHaveBeenCalledWith("did:privy:owner");
  sdk.get.mockResolvedValueOnce({ id: "did:privy:other", linked_accounts: [] });
  await expect(verifyPrivyOwner("wrong-subject")).rejects.toThrow("mismatch");
  sdk.get.mockResolvedValueOnce({ id: "did:privy:owner", linked_accounts: [{ type: "email", address: "owner@example.com" }] });
  await expect(verifyPrivyOwner("unverified")).rejects.toThrow("Verified");
  sdk.get.mockClear(); sdk.verify.mockRejectedValueOnce(new Error("Invalid signature"));
  await expect(verifyPrivyOwner("forged-token")).rejects.toThrow("Invalid signature");
  expect(sdk.get).not.toHaveBeenCalled();
});
