import { build } from "esbuild";
import type { Page } from "@playwright/test";

// Mock only the already-authenticated Privy boundary; render the actual owner component.
// There is no test login route or authentication bypass in the shipped app.
export async function ownerFixture(page: Page, requestId?: string) {
  const bundle = await build({ stdin: { contents: `import React from 'react';
    import {createRoot} from 'react-dom/client';
    import {OwnerAccess} from './src/components/owner-access';
    createRoot(document.getElementById('root')).render(<OwnerAccess credential="test.privy.jwt"
      email="owner@example.com" requestId={${JSON.stringify(requestId)}} onSession={()=>{}} onLogout={()=>{}} />);`,
    loader: "tsx", resolveDir: process.cwd() }, bundle: true, write: false, platform: "browser",
    jsx: "automatic", define: { "process.env.NODE_ENV": '"test"' } });
  await page.route("**/owner-fixture", route => route.fulfill({ contentType: "text/html", body: '<div id="root"></div><script src="/owner-fixture.js"></script>' }));
  await page.route("**/owner-fixture.js", route => route.fulfill({ contentType: "text/javascript", body: bundle.outputFiles[0].text }));
  await page.goto("http://localhost:3107/owner-fixture");
}
