"use client";

import { useRef, useState } from "react";
import { RetrievedStatement } from "./retrieved-statement";
import { useSwarmId } from "@/browser/use-swarm-id";
import { swarmCall, swarmErrorDetail } from "@/browser/swarm-errors";
import { encryptedReference, plainStatement, statementBytes, type StatementInput } from "@/browser/owner-statement";

export function OwnerRecord({ statement }: { statement?: StatementInput }) {
  const swarm = useSwarmId();
  const busyRef = useRef(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [reference, setReference] = useState("");
  const [input, setInput] = useState("");
  const [retrieved, setRetrieved] = useState("");
  const [uploadDetail, setUploadDetail] = useState("");
  const [deferred, setDeferred] = useState(true);
  const [copied, setCopied] = useState(false);
  const identity = swarm.connection?.identity;
  const canUpload = !!identity && swarm.connection?.canUpload && swarm.connection.uploadMode === "user-stamp";

  async function perform(label: string, work: () => Promise<void>) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(label);
    setError("");
    try { await work(); }
    catch (cause) {
      const detail = swarmErrorDetail(label, cause);
      console.error(`[Swarm ID] ${detail}`);
      setError(`${label} failed: ${detail}`);
    } finally { busyRef.current = false; setBusy(""); }
  }

  function publish() {
    void perform("Publication", async () => {
      const client = swarm.client.current;
      if (!client || !statement || !client.connectionInfo.identity
        || !client.connectionInfo.canUpload || client.connectionInfo.uploadMode !== "user-stamp") {
        throw new Error("Owner drive required.");
      }
      const useDeferred = deferred;
      const bytes = statementBytes(statement);
      const result = await swarmCall("SwarmIdClient.uploadData", () => client.uploadData(bytes, {
        encrypt: true, deferred: useDeferred, useWebSocket: false,
        useWorkers: true, workerCount: navigator.hardwareConcurrency || 4, concurrency: 32,
      }));
      const secretReference = await swarmCall("uploadData reference validation", async () => encryptedReference(result.reference));
      setReference(secretReference);
      setInput(secretReference);
      setCopied(false);
      setUploadDetail(`Uploaded ${bytes.length} bytes · native encryption · ${useDeferred ? "deferred" : "direct"} · ${statement.source}`);
      // Retention metadata is useful but must not discard a successful upload on failure.
      try {
        const batch = await swarmCall("SwarmIdClient.getPostageBatch (optional metadata)", () => client.getPostageBatch());
        const ttl = batch?.batchTTL;
        if (ttl != null) {
          setUploadDetail((text) => `${text} · estimated storage remaining: ${(ttl / 86400).toFixed(2)} days`);
        }
      } catch (cause) {
        setUploadDetail((text) => `${text} · Upload succeeded; retention metadata unavailable: ${swarmErrorDetail("getPostageBatch", cause)}`);
      }
    });
  }

  function retrieve() {
    setRetrieved("");
    let ref: string;
    try { ref = encryptedReference(input); }
    catch { setError("Paste the complete 128-character hex reference."); return; }
    void perform("Retrieval", async () => {
      const client = swarm.client.current;
      if (!client) throw new Error("Swarm ID not ready.");
      setRetrieved(plainStatement(await swarmCall("SwarmIdClient.downloadData", () => client.downloadData(ref))));
    });
  }

  return (
    <article className="statement-card panel owner-record" id="owner-statement">
      <div className="section-head"><div><span>05 / THE OWNER’S STATEMENT</span><h3>The owner keeps the record.</h3></div><b>SWARM ID</b></div>
      <p>Publishing is optional. Save this statement to your funded Swarm ID drive.</p>
      {statement && <details className="statement-preview"><summary>{statement.agent.displayName}’s statement · {statement.events.length} decisions</summary>
        <p>{statement.events.some(event => event.status === "refused") ? "Includes the gateway’s refusal and its reason." : "Actions are being recorded as the demo runs."}</p>
      </details>}
      {/* The click must happen inside the proxy so its popup retains the iframe as opener. */}
      <div id="owner-swarm-proxy" style={{ height: 56 }} />
      <p role="status">{identity ? `Connected: ${identity.name} · ${canUpload ? "owner drive ready" : "uploads unavailable"}`
        : swarm.ready ? "Connect your Swarm ID account to use your drive." : "Loading Swarm ID…"}</p>
      {identity && !canUpload && <p>Choose your funded drive in Swarm ID. Upload status: {swarm.connection?.uploadUnavailableReason ?? "no usable owner stamp"}.</p>}
      {swarm.error && <p role="alert">{swarm.error} <button type="button" onClick={swarm.retry}>Retry Swarm ID</button></p>}
      <label className="deferred-option"><input type="checkbox" checked={deferred} onChange={(event) => setDeferred(event.target.checked)} /> Deferred upload mode</label>
      <details><summary>Upload details</summary>
        <small>Allow the Swarm ID popup, approve this site, and select your funded drive.</small>
        <small>Native encryption is always on. HTTP upload uses the deferred setting above; deferred mode is required for Bee dev mode.</small>
      </details>
      <button type="button" onClick={publish} disabled={!swarm.ready || !canUpload || !statement || !!busy}>Publish statement</button>
      {!statement && <p>Run the demo to prepare a statement. Retrieval is available without a demo run.</p>}
      {statement?.source === "mock-demo" && <p>Statement: mock agent actions. Publishing uses your real Swarm drive.</p>}
      <div hidden={!reference}>
      <label htmlFor="owner-reference">YOUR PRIVATE RETRIEVAL REFERENCE</label>
      <textarea id="owner-reference" readOnly rows={4} value={reference} placeholder="Appears after publishing" autoComplete="off" spellCheck={false} />
      </div>
      {reference && <button type="button" onClick={() => void perform("Copy", async () => {
        await navigator.clipboard.writeText(reference); setCopied(true);
      })}>{copied ? "Copied" : "Copy secret reference"}</button>}
      {uploadDetail && <p role="status">{uploadDetail}</p>}
      {reference && <a className="proof-chip" href="#retrieve-reference" title="Encrypted upload returned a reference; retrieve below to verify">Swarm ↗</a>}
      <p>Keep your reference private: it unlocks your statement.</p>
      <details><summary>What stays yours</summary><p>The reference contains the decryption key. Our browser code sends it to Swarm ID, not the gateway server, and keeps it only in this tab unless you copy it. The gateway already knows the original statement. Anyone with the reference can read the saved copy while storage is available. Keep a private backup; retention depends on your drive and the network.</p></details>
      <label htmlFor="retrieve-reference">RETRIEVE FROM SWARM</label>
      <textarea id="retrieve-reference" rows={4} value={input} onChange={(event) => setInput(event.target.value)} placeholder="Paste a 128-hex reference" autoComplete="off" spellCheck={false} />
      <button type="button" onClick={retrieve} disabled={!swarm.ready || !identity || !!busy || !input.trim()}>Retrieve</button>
      {busy && <p role="status">{busy} in progress…</p>}
      {error && <p className="error" role="alert">{error}</p>}
      {retrieved && <RetrievedStatement text={retrieved} />}
    </article>
  );
}
