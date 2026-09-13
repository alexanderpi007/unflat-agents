import type { CSSProperties } from "react";

const layers = [
  { title: "The owner keeps the record.", label: "04 / STATEMENT", rail: "Swarm", mark: "↗" },
  { title: "Idle funds, put to work.", label: "03 / SAVINGS", rail: "Morpho", mark: "+" },
  { title: "Permission has an ending.", label: "02 / BUDGET", rail: "Arkiv", mark: "02:00" },
  { title: "A name. Not just a key.", label: "01 / IDENTITY", rail: "ENS", mark: "u" },
];

export function AccountSculpture({ name }: { name: string }) {
  return <figure className="account-sculpture" aria-label="Account architecture: ENS identity, expiring Arkiv permission, Morpho savings and an owner-held Swarm statement">
    <div className="sculpture-index" aria-hidden="true"><span>FIG. 01</span><span>THE AGENT ACCOUNT</span></div>
    <div className="sculpture-stage" aria-hidden="true">
      <div className="sculpture-orbit" /><div className="sculpture-orbit orbit-inner" />
      <div className="account-stack">{layers.map((layer, index) => <div key={layer.rail} className={`account-layer layer-${index}`} style={{ "--layer": index } as CSSProperties}>
        <div className="layer-heading"><span>{layer.label}</span><span>{layer.rail}</span></div>
        <div className="layer-symbol">{layer.mark}</div>
        <strong>{index === 3 ? name : layer.title}</strong>
        <div className="layer-bottom"><span>{index === 3 ? "unflat × agents" : layer.label}</span><span>{index === 3 ? "↗" : layer.rail}</span></div>
      </div>)}</div>
    </div>
    <figcaption><span className="scroll-cue">↓ Scroll to unpack</span><span>Architecture illustration, not a live transaction.</span></figcaption>
  </figure>;
}
