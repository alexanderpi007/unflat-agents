"use client";

import { useRef, useState } from "react";
import { PrivyProvider, usePrivy, useWallets, useExportWallet, useSigners, useSendTransaction } from "@privy-io/react-auth";
import { base } from "viem/chains";
import { encodeFunctionData, erc20Abi, isAddress, zeroAddress, parseUnits } from "viem";

const usdc = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
export default function PrivyOwnerWallet({ appId }: { appId: string }) {
  return <PrivyProvider appId={appId} config={{ loginMethods: ["email"], supportedChains: [base], defaultChain: base,
    embeddedWallets: { ethereum: { createOnLogin: "off" } } }}><OwnerControls /></PrivyProvider>;
}
function OwnerControls() {
  const { ready, authenticated, user, login, logout } = usePrivy();
  const { wallets } = useWallets();
  const { exportWallet } = useExportWallet();
  const { removeSigners } = useSigners();
  const { sendTransaction } = useSendTransaction();
  const [address, setAddress] = useState("");
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("1.00");
  const [confirmation, setConfirmation] = useState("");
  const [notice, setNotice] = useState("");
  const [hash, setHash] = useState("");
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const owned = wallets.filter(wallet => wallet.walletClientType === "privy");
  const selected = owned.find(wallet => wallet.address === address);
  async function act(action: "withdraw" | "export" | "revoke") {
    if (!authenticated || !selected || confirmation !== "CONFIRM" || lock.current) return;
    lock.current = true; setBusy(true); setNotice(""); setHash("");
    try {
      if (action === "export") {
        await exportWallet({ address: selected.address });
        setNotice("Privy export dialog opened. Save the key privately; never send it to this gateway or an agent.");
      } else if (action === "revoke") {
        await removeSigners({ address: selected.address });
        setNotice("All delegated signers removed from this wallet. Only the owner can now act through Privy.");
      } else {
        if (!isAddress(recipient) || recipient.toLowerCase() === zeroAddress || !/^(0|[1-9][0-9]*)\.[0-9]{2}$/.test(amount) || parseUnits(amount, 6) <= 0n) throw new Error("Enter a valid Base address and positive USDC amount with two decimal places.");
        const result = await sendTransaction({ chainId: base.id, to: usdc, value: 0,
          data: encodeFunctionData({ abi: erc20Abi, functionName: "transfer", args: [recipient, parseUnits(amount, 6)] }),
        }, { address: selected.address });
        setHash(result.hash); setNotice("Owner transaction submitted to Base. Check its receipt before retrying.");
      }
    } catch { setNotice("Privy action did not complete. Check the Privy dialog and wallet history before retrying. No automatic retry."); }
    finally { setConfirmation(""); setBusy(false); lock.current = false; }
  }
  return <main style={{ maxWidth: 720, margin: "64px auto", padding: 24 }}>
    <h1>Your wallet. Your control.</h1><p>Sign in with the email used to open the account. This screen uses your Privy identity directly, not the gateway signer or OWNER_TOKEN.</p>
    {!authenticated ? <button disabled={!ready} onClick={() => login()}>Log in with Privy</button> : <>
      <p>Signed in: {user?.email?.address}</p><button disabled={busy} onClick={() => { setAddress(""); setConfirmation(""); void logout(); }}>Log out</button>
      <label htmlFor="owned-wallet">Choose your wallet</label><select id="owned-wallet" disabled={busy} value={address} onChange={e => { setAddress(e.target.value); setConfirmation(""); }}>
        <option value="">Select a wallet</option>{owned.map(wallet => <option key={wallet.address} value={wallet.address}>{wallet.address}</option>)}
      </select>
      {owned.length === 0 && <p>No embedded wallets available for this login. This page never creates a wallet automatically.</p>}
      <h2>Withdraw USDC on Base</h2><p>This is a real owner transaction plus gas, even if the gateway demo uses mock money. It is not an agent action and does not require an Arkiv mandate.</p>
      <label htmlFor="owner-destination">Destination Base address</label><input id="owner-destination" disabled={busy} value={recipient} onChange={e => { setRecipient(e.target.value); setConfirmation(""); }} />
      <label htmlFor="owner-usdc">USDC amount</label><input id="owner-usdc" disabled={busy} inputMode="decimal" maxLength={24} value={amount} onChange={e => { setAmount(e.target.value); setConfirmation(""); }} />
      <p>Vault shares must first be redeemed into USDC. Use gateway recall under a new budget, or export and manage the vault from your own wallet client.</p>
      <label htmlFor="privy-owner-confirm">Type CONFIRM for the next owner action</label><input id="privy-owner-confirm" disabled={busy} autoComplete="off" value={confirmation} onChange={e => setConfirmation(e.target.value)} />
      <button disabled={busy || !selected || confirmation !== "CONFIRM"} onClick={() => void act("withdraw")}>Withdraw USDC with my Privy wallet</button>
      <button disabled={busy || !selected || confirmation !== "CONFIRM"} onClick={() => void act("revoke")}>Revoke all delegated signers</button>
      <button disabled={busy || !selected || confirmation !== "CONFIRM"} onClick={() => void act("export")}>Export my wallet key in Privy</button>
    </>}
    {notice && <p role="status">{notice}</p>}{hash && <a href={`https://basescan.org/tx/${hash}`} target="_blank" rel="noreferrer">Base ↗ {hash}</a>}
    <p>Key export happens on Privy's isolated origin. Keep a private backup before relying on access after the bank disappears. This page still needs a running host and Privy availability.</p>
  </main>;
}
