import React from "react";
import { afterEach, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import PrivyOwnerWallet from "./privy-owner-wallet";
import OwnerWalletPage from "@/app/owner-wallet/page";

const state = vi.hoisted(() => ({ authenticated: false, config: {} as Record<string, unknown>,
  login: vi.fn(), logout: vi.fn(), exportWallet: vi.fn(), removeSigners: vi.fn(), sendTransaction: vi.fn() }));
vi.mock("@privy-io/react-auth", () => ({
  PrivyProvider: ({ config, children }: { config: Record<string, unknown>; children: React.ReactNode }) => { state.config = config; return children; },
  usePrivy: () => ({ ready: true, authenticated: state.authenticated, user: { email: { address: "owner@example.com" } }, login: state.login, logout: state.logout }),
  useWallets: () => ({ wallets: [{ walletClientType: "privy", address: `0x${"3".repeat(40)}` }, { walletClientType: "metamask", address: `0x${"4".repeat(40)}` }] }),
  useExportWallet: () => ({ exportWallet: state.exportWallet }),
  useSigners: () => ({ removeSigners: state.removeSigners }),
  useSendTransaction: () => ({ sendTransaction: state.sendTransaction }),
}));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("NEXT_NOT_FOUND"); } }));
vi.mock("@/components/owner-wallet-loader", () => ({ OwnerWalletLoader: () => <div>Owner login loader</div> }));
afterEach(() => { state.authenticated = false; vi.clearAllMocks(); vi.unstubAllEnvs(); });

it("never auto-logs in, creates a wallet, exports, revokes or sends on render", () => {
  const html = renderToStaticMarkup(<PrivyOwnerWallet appId="test-public-app" />);
  expect(html).toContain("Log in with Privy");
  expect(html).not.toContain("Withdraw USDC with my Privy wallet");
  expect(state.config).toMatchObject({ loginMethods: ["email"], embeddedWallets: { ethereum: { createOnLogin: "off" } } });
  for (const action of [state.login, state.exportWallet, state.removeSigners, state.sendTransaction]) expect(action).not.toHaveBeenCalled();
});

it("requires explicit embedded-wallet selection and CONFIRM, even after owner login", () => {
  state.authenticated = true;
  const html = renderToStaticMarkup(<PrivyOwnerWallet appId="test-public-app" />);
  expect(html).toContain("owner@example.com");
  expect(html).toContain(`0x${"3".repeat(40)}`);
  expect(html).not.toContain(`0x${"4".repeat(40)}`);
  expect(html).toContain('value="" selected=""');
  for (const label of ["Withdraw USDC with my Privy wallet", "Revoke all delegated signers", "Export my wallet key in Privy"]) {
    expect(html).toContain(`<button disabled="">${label}</button>`);
  }
  expect(html).toContain("real owner transaction plus gas");
  for (const action of [state.exportWallet, state.removeSigners, state.sendTransaction]) expect(action).not.toHaveBeenCalled();
});

it("does not offer the direct owner screen on Vercel or without the app ID", () => {
  vi.stubEnv("VERCEL", "1");
  expect(() => OwnerWalletPage()).toThrow("NEXT_NOT_FOUND");
  vi.stubEnv("VERCEL", ""); vi.stubEnv("PRIVY_APP_ID", "");
  expect(renderToStaticMarkup(OwnerWalletPage())).toContain("Owner wallet login unavailable");
});
