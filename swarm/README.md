# Owner statements on Swarm ID

The owner controls their Swarm ID identity, funded drive, and the secret reference to each saved statement. Swarm stores encrypted chunks paid for by the owner's drive. Retention depends on that drive's postage lifetime and network availability; a reported four-day TTL is not permanent storage or a guarantee for subsequent uploads.

The OWNER RECORD card initializes `@snaha/swarm-id@0.4.1` against `https://swarm-id.snaha.net`. Connect opens the trusted identity popup, which authenticates the owner and supplies the proxy iframe with the app session. Uploads require both an identity and `canUpload`, with `uploadMode === "user-stamp"`; we do not configure subsidised storage.

### Localhost connection

The trusted identity origin (`iframeOrigin`) remains `https://swarm-id.snaha.net`; the iframe loads `https://swarm-id.snaha.net/proxy`. `http://localhost:3000` is the dApp origin, not a trusted identity origin. Do not substitute localhost or the Vercel dApp URL for `iframeOrigin`. There is no `trustedOrigin` client option, localhost allowlist variable, or required HTTPS/dev flag for this hosted-identity setup. The local Bee cluster described in the [local-development guide](https://swarm.snaha.net/docs/local-development/) is not needed for your existing funded drive.

Use the visible SDK-owned **Owner: connect Swarm ID** button inside the iframe. Unlike a parent-page button relayed through `postMessage`, this puts the user click and popup opener inside the proxy, preserving the popup handover when browser storage is partitioned. Allow popups for the identity service. Approve the actual localhost origin shown by Swarm ID; approval for the hosted demo is a separate connection.

SDK 0.4.1 listens to all window messages and warns whenever their origin differs from its identity origin, including unrelated same-page messages from browser tooling/extensions. Our application does not send itself messages, and a clean Chromium session against the Next dev server produced no localhost messages: initialization and the real `/connect` popup both worked. The reported message stream's exact producer has not been identified in the affected browser; it is not evidence that localhost should be trusted as Swarm ID. If it persists, try a new browser profile with extensions disabled (incognito can still have explicitly enabled extensions). Do not disable origin validation or clear your Swarm ID account data. Successful authentication requires a connection snapshot with an identity and usable owner drive, not merely an opened popup.

After the iframe-button change, a clean Chromium check on `http://localhost:3000` confirmed: visible identity button, real `https://swarm-id.snaha.net/connect` popup, `window.opener` belonging to the proxy iframe, and zero localhost-origin warnings. Owner authentication/funded-drive readiness still requires the owner's interactive check. The browser regression also injects a spoofed localhost connection message and verifies it cannot authorize an identity.

`uploadData(statementBytes, { encrypt: true, deferred })` uploads through the iframe. Swarm's native encrypted reference is 128 hex characters: 64 for the content address and 64 for the key. Anyone holding the whole reference can decrypt the statement. The OWNER RECORD card displays the full value and offers Copy; keep that copy privately. It is not stored in localStorage, cookies, URLs, analytics or the gateway store. Errors are shown in the UI and console only after redacting long hex values (including references/keys), URL query values and authorization tokens; raw error objects and request bodies are never logged by our code.

The gateway never sees the reference: it supplies the original statement data to the dashboard, but receives no publication request or callback. The frontend sends upload/download messages only to the Swarm ID iframe. `/api/statements` now returns JSON 409 directing the owner to the browser, without reading submitted bodies. The server no longer assumes `SWARM_UPLOAD_URL` or `SWARM_POSTAGE_BATCH_ID`; old values may be removed from your environment. The CLI mock still simulates encrypted publication and produces a clearly mocked reference.

The exported JSON contains the displayed agent, mandate and readable decisions, including transaction hashes/refusal text, plus source mode and export time. A dashboard mock run is labelled `mock-demo` even when its statement is uploaded to a real drive. Private gateway commitment openings and credentials are not exported. Swarm encryption protects the saved copy; the gateway already knows the original events it produced.

## Deferred upload mode

Deferred mode queues chunks at the Bee node for later forwarding rather than waiting for direct network delivery. It is required for Bee dev mode. The checkbox now defaults ON to reproduce the owner's working encrypted + deferred upload on the official demo. Publication no longer calls `getNodeInfo()` as a prerequisite: that metadata endpoint can fail independently of uploads, and the official demo treats its failure as nonfatal. Running Next.js with `npm run dev` alone does not mean the remote Bee is in dev mode. A queued upload's returned reference alone does not prove cross-session retrieval, especially on an isolated dev node.

### Upload comparison and diagnostics

The official Upload Data component calls `uploadData(new TextEncoder().encode(text), options)`, not `uploadFile`. We use the same method with JSON encoded as UTF-8 bytes; neither sets a content-type or passes a postage batch ID. Options now match the working demo configuration: `encrypt: true`, `deferred: true` by default, `useWebSocket: false`, `useWorkers: true`, `workerCount: navigator.hardwareConcurrency || 4`, and `concurrency: 32`. The SDK request timeout is now 600,000 ms, matching the demo's client setup, instead of 60,000 ms. HTTP carries the upload chunks; account-bus WebSockets are separate from the upload transport.

Swarm ID resolves the app's drive override first, then the account's default drive (SDK `resolveStampForApp` in `lib/src/utils/postage-stamp-association.ts`). The demo does not perform a separate drive-selection call before upload. `owner drive ready` means the proxy advertises a usable owner-stamp path; it does not guarantee a later network write. If the wrong drive is associated, change the account default or the localhost app's drive in Swarm ID, rather than adding a server postage ID.

Failures now name the SDK call, report the status if available, and preserve the sanitized error message in both UI and console. SDK 0.4.1 forwards proxy failures as `new Error(message.error)`, so a structured HTTP status can be lost; diagnostics say `not supplied by SDK` rather than inventing one. Optional `getPostageBatch` failure displays a retention warning without discarding a successful upload/reference. The earlier generic failure was not reproduced against the owner's authenticated session (browser-control connection unavailable); the removed metadata gate and changed defaults address verified differences, not a claimed observed live error.

## Test locally

1. Run `npm install`, then `npm run dev`. Open `http://localhost:3000` (use the port printed by Next if 3000 is occupied).
2. In OWNER RECORD, wait for the embedded **Owner: connect Swarm ID** button, then click it. Allow the identity popup. Sign into the existing account, select the funded drive/identity, and approve the actual localhost origin. Wait for **Connected: [your name] · owner drive ready**. If the warning stream persists, use an extension-free browser profile as described above.
3. Click **Run MOCK money · real Arkiv**. This dashboard sequence uses mocked financial actions and a real Arkiv mandate; wait for natural expiry and refusal. The separate Publish button uses real owner storage even if `MOCK_MODE=true`.
4. Leave **Deferred upload mode** checked and click **Publish statement**. Native encryption is always enabled; uploads use HTTP, with workers enabled as in the demo. Wait for the uploaded byte count and 128-hex reference. If it fails, copy the new call/status/message diagnostic from the card or console, not a raw HAR or secret reference.
5. Save the complete **SECRET SWARM REFERENCE · 128 HEX** using **Copy secret reference**. Record the byte count, source label, and drive TTL if available. Save the reference outside this browser session.
6. Click **Retrieve**. Check that the plain statement includes the same agent ID, mandate and final refusal. This establishes the initial round trip only.
7. Close the original tab. Open a new private/incognito window or a separate browser profile and open the same localhost URL. Connect the same Swarm ID account; restore/unlock it through Swarm ID if required. Do not run the demo or publish again.
8. Paste the saved reference into **RETRIEVE FROM SWARM**, then click **Retrieve**. The original JSON must appear without the old dashboard state or an agent lookup. Compare the agent ID, export timestamp, events and refusal with step 6.
9. In DevTools Network, verify there is no request containing the secret to `/api/statements` or any unflat endpoint. Retrieval is handled by the Swarm ID iframe. Avoid sharing an unredacted HAR: Swarm requests and browser messages may contain secrets.

## Verified live proof — owner-reported, 2026-09-12

The owner verified dashboard publication and retrieval using the funded Swarm ID drive: **5,582 bytes**, native encryption, deferred upload, and reported TTL **4.09 days** (approximately four days). The uploaded JSON was version 1, source `mock-demo`, exported at `2026-09-12T11:45:37.539Z`, with agent ID `e4d6d46a-6a67-4deb-8832-d0bf5c2449e7`, mandate terms and seven readable events ending in refusal. The financial events in this saved proof are mocked; the Swarm storage and retrieval are real.

The dashboard returned a 128-hex encrypted reference and `downloadData(reference)` through the identity iframe returned the plaintext JSON matching that export. The owner subsequently confirmed Swarm as verified live. The pasted evidence establishes dashboard round-trip retrieval; it does not independently document a fresh-profile run. The steps above explain that reproducible additional check.

The gateway supplies source events but never receives the Swarm publication reference: neither upload nor retrieval calls a gateway endpoint. The complete reference includes a decryption key and is intentionally omitted from this file, screenshots committed to the repository, and all public proof links. Retention is finite and reported at upload time, not a permanent availability claim.

## Sources and observed differences

- [Introduction](https://swarm.snaha.net/docs/), [Quick Start](https://swarm.snaha.net/docs/getting-started/), [Architecture](https://swarm.snaha.net/docs/architecture/), [Subsidised Gateway](https://swarm.snaha.net/docs/subsidised-gateway/), [API reference](https://swarm.snaha.net/docs/api/).
- [Repository](https://github.com/snaha/swarm-id), [demo client setup](https://github.com/snaha/swarm-id/blob/main/demo/src/lib/stores/client.svelte.ts), [upload controls](https://github.com/snaha/swarm-id/blob/main/demo/src/lib/components/upload-section.svelte), [retrieval](https://github.com/snaha/swarm-id/blob/main/demo/src/lib/components/download-section.svelte).
- The replaced adapter posted from the server with operator postage, `swarm-encrypt: false`, and an AES envelope, then persisted the returned reference. That was incompatible with native owner-held encrypted references.
- Quick Start's progress example places a callback in the third argument; the API and installed types put `onProgress` inside upload options and reserve the third argument for request options. Our integration follows installed types.
- Older Introduction text attributes isolation entirely to browser storage partitioning; current Architecture/repository explain same-site shared storage and cross-site popup handover. We use the SDK's connection state instead of assuming that iframe storage is shared.
- Installing 0.4.1 reports three dependency audit findings (two moderate, one high), including axios through bee-js. No automatic fix is offered by npm; this is an upstream dependency limitation, not a successful audit.
