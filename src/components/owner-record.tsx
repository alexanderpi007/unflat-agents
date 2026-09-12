"use client";

import { useRef, useState } from "react";
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
          setUploadDetail((text) => `${text} · drive TTL ${(ttl / 86400).toFixed(2)} days`);
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
    <article className="statement-card panel owner-record">
      <div className="section-head"><div><span>OWNER RECORD</span><h3>Encrypted on Swarm.</h3></div><b>SWARM ID</b></div>
      {/* The click must happen inside the proxy so its popup retains the iframe as opener. */}
      <div id="owner-swarm-proxy" style={{ height: 56 }} />
      <small>Connect using the Swarm ID button above. Allow its popup, then approve this site's origin and select your funded drive.</small>
      <p role="status">{identity ? `Connected: ${identity.name} · ${canUpload ? "owner drive ready" : "uploads unavailable"}`
        : swarm.ready ? "Connect your Swarm ID account to use your drive." : "Loading Swarm ID…"}</p>
      {identity && !canUpload && <p>Choose your funded drive in Swarm ID. Upload status: {swarm.connection?.uploadUnavailableReason ?? "no usable owner stamp"}.</p>}
      {swarm.error && <p role="alert">{swarm.error} <button type="button" onClick={swarm.retry}>Retry Swarm ID</button></p>}
      <label className="deferred-option"><input type="checkbox" checked={deferred} onChange={(event) => setDeferred(event.target.checked)} /> Deferred upload mode</label>
      <small>On by default to match the working Swarm demo: native encryption + deferred upload over HTTP. Required for Bee dev mode.</small>
      <button type="button" onClick={publish} disabled={!swarm.ready || !canUpload || !statement || !!busy}>Publish statement</button>
      {!statement && <p>Run the demo to prepare a statement. Retrieval is available without a demo run.</p>}
      {statement?.source === "mock-demo" && <p>Statement: mock agent actions. Publishing uses your real Swarm drive.</p>}
      <label htmlFor="owner-reference">SECRET SWARM REFERENCE · 128 HEX</label>
      <textarea id="owner-reference" readOnly rows={4} value={reference} placeholder="Appears after publishing" autoComplete="off" spellCheck={false} />
      {reference && <button type="button" onClick={() => void perform("Copy", async () => {
        await navigator.clipboard.writeText(reference); setCopied(true);
      })}>{copied ? "Copied" : "Copy secret reference"}</button>}
      {uploadDetail && <p role="status">{uploadDetail}</p>}
      <p>Save the full reference privately: it contains the decryption key. It stays in this tab and is never sent to our gateway.</p>
      <label htmlFor="retrieve-reference">RETRIEVE FROM SWARM</label>
      <textarea id="retrieve-reference" rows={4} value={input} onChange={(event) => setInput(event.target.value)} placeholder="Paste a 128-hex reference" autoComplete="off" spellCheck={false} />
      <button type="button" onClick={retrieve} disabled={!swarm.ready || !identity || !!busy || !input.trim()}>Retrieve</button>
      {busy && <p role="status">{busy} in progress…</p>}
      {error && <p className="error" role="alert">{error}</p>}
      {retrieved && <><label>PLAIN STATEMENT · RETRIEVED FROM SWARM</label><pre className="retrieved-statement">{retrieved}</pre></>}
    </article>
  );
}
