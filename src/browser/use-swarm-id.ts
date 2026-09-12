"use client";

import { useEffect, useRef, useState } from "react";
import type { ConnectionInfo, SwarmIdClient } from "@snaha/swarm-id";

export function useSwarmId() {
  const client = useRef<SwarmIdClient | null>(null);
  const [connection, setConnection] = useState<ConnectionInfo>();
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    let instance: SwarmIdClient | undefined;
    setReady(false);
    setError("");
    setConnection(undefined);
    void import("@snaha/swarm-id").then(async ({ SwarmIdClient }) => {
      if (!active) return;
      instance = new SwarmIdClient({
        iframeOrigin: "https://swarm-id.snaha.net",
        metadata: { name: "unflat agents", description: "Owner-controlled encrypted agent statements" },
        containerId: "owner-swarm-proxy",
        popupMode: "popup",
        buttonConfig: { connectText: "Owner: connect Swarm ID" },
        timeout: 600_000,
        onConnectionChange: (info) => { if (active) setConnection(info); },
      });
      await instance.initialize();
      if (!active) return;
      const iframe = instance.getAuthIframe();
      if (iframe) iframe.title = "Swarm ID owner connection";
      client.current = instance;
      setConnection(instance.connectionInfo);
      setReady(true);
    }).catch(() => {
      instance?.destroy();
      if (active) setError("Swarm ID could not initialize. Check connectivity and retry.");
    });
    return () => {
      active = false;
      client.current = null;
      instance?.destroy();
    };
  }, [attempt]);

  return { client, connection, ready, error, retry: () => setAttempt((value) => value + 1) };
}
