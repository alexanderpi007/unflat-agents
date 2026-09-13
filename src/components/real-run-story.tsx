import type { DemoSnapshot } from "@/core/types";
import { runStory } from "@/demo/run-story";

export function RealRunStory({ snapshot }: { snapshot: DemoSnapshot }) {
  return <section className="story-section run-story" aria-labelledby="run-story-heading">
    <h2 id="run-story-heading">Story</h2>
    <p>Owner ↔ agent, retold from the statement—not a chat transcript.</p>
    <ol>{runStory(snapshot).map((line, index) => <li key={index} className={line.speaker === "Owner" ? "owner-line" : "agent-line"}>
      <span>{line.speaker}</span><p>{line.text}</p>
    </li>)}</ol>
  </section>;
}
