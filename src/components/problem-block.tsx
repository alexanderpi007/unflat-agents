"use client";

import { useAccountScroll } from "@/browser/use-account-scroll";
import { AccountSculpture } from "./account-sculpture";

export function ProblemBlock({ name }: { name: string }) {
  const ref = useAccountScroll();
  return <section ref={ref} className="problem-block" id="introduction" aria-labelledby="problem-heading">
    <div className="problem-stage">
      <div className="problem-copy">
        <p className="eyebrow"><span className="section-number">00</span> THE PROBLEM</p>
        <h2 id="problem-heading">Your agent has a wallet. It doesn't have a bank.</h2>
        <p className="problem-body">A wallet is a key. A bank is limits, statements, and a way to say no. Every "AI wallet" ships the key and skips the rest.</p>
        <p className="problem-bridge">We built the bank.</p>
        <a className="primary-link" href="#top">See the real runs <span aria-hidden="true">↗</span></a>
        <p className="problem-footnote">Two real accounts. Public receipts. No trust required.</p>
      </div>
      <AccountSculpture name={name} />
    </div>
    <div className="architecture-strip" aria-label="What makes an agent account">
      <span><b>01</b> A name <small>ENS</small></span><span><b>02</b> An ending <small>Arkiv</small></span>
      <span><b>03</b> A savings vault <small>Morpho</small></span><span><b>04</b> Your record <small>Swarm</small></span>
    </div>
  </section>;
}
