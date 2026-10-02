// Shiplog: turns merged pull requests or commit messages into customer-facing release notes in your product's voice.
import { useMemo, useState } from "react";
import { download, useCopy, useStored } from "./lib/store";
import { todayISO } from "./lib/time";
import { Section, Stat, Stats } from "./ui/kit";

const T = "shiplog";
type Group = "new" | "improved" | "fixed" | "internal";
const GROUPS: Record<Group, string> = { new: "New", improved: "Improved", fixed: "Fixed", internal: "Behind the scenes" };
const SAMPLE = `feat(export): add CSV export for invoices (#412)
feat: dark mode for the dashboard #418
fix(auth): session expired too early on mobile Safari (#420)
fix: typo on pricing page
perf(search): cache search results, 3x faster on large accounts (#415)
chore(deps): bump react from 18.2.0 to 18.3.1
refactor: move billing code into its own module
feat(team)!: invite teammates by link instead of email (#409)
fix(pdf): invoice totals were rounded wrong for TND (3 decimals) #422
docs: update API readme
ci: run tests on node 20
improve(onboarding): shorter signup form, 2 fields instead of 6 (#417)`;

function classify(line: string): { group: Group; scope: string; text: string; breaking: boolean; ref: string } {
  const m = line.match(/^\s*(?:[0-9a-f]{7,40}\s+)?(\w+)(?:\(([^)]+)\))?(!)?:\s*(.+)$/i);
  const ref = line.match(/#(\d+)/)?.[1] ?? "";
  let type = m?.[1]?.toLowerCase() ?? "", text = (m?.[4] ?? line).replace(/\(?#\d+\)?/g, "").trim();
  if (!m) { type = /^(add|new|introduc)/i.test(text) ? "feat" : /^(fix|resolve|correct)/i.test(text) ? "fix" : /^(improve|speed|faster|better|update)/i.test(text) ? "improve" : "other"; }
  const group: Group = /^(feat|feature|add)$/.test(type) ? "new" : /^(fix|bug|hotfix)$/.test(type) ? "fixed" : /^(perf|improve|ux|ui|style)$/.test(type) ? "improved" : "internal";
  return { group, scope: m?.[2] ?? "", text, breaking: !!m?.[3] || /breaking/i.test(line), ref };
}
/** Turn developer phrasing into something a customer would read. */
function humanise(text: string, group: Group) {
  let t = text.replace(/^(add|adds|added)\s+/i, "").replace(/^(fix|fixes|fixed)\s+/i, "").replace(/\s+/g, " ").trim();
  t = t.charAt(0).toUpperCase() + t.slice(1);
  if (group === "fixed" && !/^(the|a|an)\b/i.test(t) && /\b(was|were|too|wrong|broken|crash|error|not)\b/i.test(t)) t = `${t}. This is now fixed`;
  if (group === "new" && !/^you can/i.test(t)) t = t.replace(/^/, "");
  return t.replace(/\.$/, "") + ".";
}

export default function Shiplog() {
  const [raw, setRaw] = useStored(T, "raw", SAMPLE);
  const [product, setProduct] = useStored(T, "product", "Ledgerly");
  const [version, setVersion] = useStored(T, "version", "2.14");
  const [showInternal, setShowInternal] = useStored(T, "internal", false);
  const [repo, setRepo] = useStored(T, "repo", "https://github.com/acme/ledgerly");
  const [edits, setEdits] = useState<Record<number, string>>({});
  const [hidden, setHidden] = useState<number[]>([]);
  const { copy, copied } = useCopy();
  const items = useMemo(() => raw.split("\n").map(l => l.trim()).filter(l => l && !/^merge (pull request|branch)/i.test(l)).map((l, i) => { const c = classify(l); return { i, ...c, human: humanise(c.text, c.group) }; }).filter(x => !/^(chore|ci|docs|test|build)\b/i.test(raw.split("\n")[x.i] ?? "") || showInternal), [raw, showInternal]);
  const visible = items.filter(x => !hidden.includes(x.i) && (showInternal || x.group !== "internal"));
  const textOf = (x: (typeof items)[number]) => edits[x.i] ?? x.human;
  const md = [`## ${product} ${version} · ${new Date().toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" })}`, "",
    ...visible.filter(x => x.breaking).map(x => `> **Heads up:** ${textOf(x)}`), visible.some(x => x.breaking) ? "" : null,
    ...(Object.keys(GROUPS) as Group[]).flatMap(g => { const list = visible.filter(x => x.group === g && !x.breaking); return list.length ? [`### ${GROUPS[g]}`, ...list.map(x => `- ${textOf(x)}${x.ref && repo ? ` ([#${x.ref}](${repo}/pull/${x.ref}))` : ""}`), ""] : []; })].filter(x => x !== null).join("\n");

  return (
    <div className="stack">
      <Section title="Release notes">
        <Stats><Stat value={items.length} label="Changes read" /><Stat value={visible.filter(x => x.group === "new").length} label="New features" tone="good" /><Stat value={visible.filter(x => x.group === "fixed").length} label="Fixes" /><Stat value={visible.filter(x => x.breaking).length} label="Breaking changes" tone={visible.some(x => x.breaking) ? "bad" : undefined} /></Stats>
      </Section>
      <div className="grid2">
        <Section title="What shipped">
          <div className="row" style={{ marginBottom: 10 }}><label className="field"><span>Product</span><input id="sl-p" className="input" value={product} onChange={e => setProduct(e.target.value)} /></label><label className="field" style={{ flex: "0 0 100px" }}><span>Version</span><input id="sl-v" className="input" value={version} onChange={e => setVersion(e.target.value)} /></label></div>
          <label className="field"><span>Paste PR titles or <code>git log --oneline v2.13..HEAD</code></span><textarea id="sl-raw" className="input" rows={12} value={raw} onChange={e => { setRaw(e.target.value); setEdits({}); setHidden([]); }} style={{ fontFamily: "var(--mono)", fontSize: 12 }} /></label>
          <label className="field" style={{ marginTop: 8 }}><span>Repository link (for PR links)</span><input id="sl-repo" className="input" value={repo} onChange={e => setRepo(e.target.value)} /></label>
          <label className="check" style={{ marginTop: 8 }}><input type="checkbox" checked={showInternal} onChange={e => setShowInternal(e.target.checked)} />Include internal changes (dependencies, refactors, CI)</label>
        </Section>
        <Section title="Edit the wording">
          <div className="stack" style={{ gap: 8 }}>{items.filter(x => showInternal || x.group !== "internal").map(x => (
            <div key={x.i} className="sl-item" style={{ opacity: hidden.includes(x.i) ? 0.4 : 1 }}>
              <div className="row" style={{ gap: 6, alignItems: "center" }}><span className={"pill " + (x.group === "new" ? "good" : x.group === "fixed" ? "" : x.group === "improved" ? "warn" : "")}>{GROUPS[x.group]}</span>{x.breaking && <span className="pill bad">Breaking</span>}{x.scope && <span className="note">{x.scope}</span>}<button className="btn ghost small" style={{ marginLeft: "auto" }} onClick={() => setHidden(hidden.includes(x.i) ? hidden.filter(h => h !== x.i) : [...hidden, x.i])}>{hidden.includes(x.i) ? "Include" : "Leave out"}</button></div>
              <input className="input" aria-label="Customer wording" value={textOf(x)} onChange={e => setEdits({ ...edits, [x.i]: e.target.value })} />
            </div>))}</div>
        </Section>
      </div>
      <Section title="Ready to publish" aside={<><button className="btn small primary" onClick={() => copy(md)}>{copied ? "Copied" : "Copy Markdown"}</button><button className="btn small" onClick={() => download(`release-${version}-${todayISO()}.md`, md, "text/markdown")}>Download</button></>}>
        <div className="sl-preview">{md.split("\n").map((l, i) => l.startsWith("## ") ? <h3 key={i} style={{ fontSize: 24 }}>{l.slice(3)}</h3> : l.startsWith("### ") ? <h4 key={i} style={{ marginTop: 12, fontFamily: "var(--sans)", fontSize: 15, textTransform: "uppercase", letterSpacing: ".08em", color: "var(--muted)" }}>{l.slice(4)}</h4> : l.startsWith("> ") ? <p key={i} className="sl-warn">{l.slice(2).replace(/\*\*/g, "")}</p> : l.startsWith("- ") ? <p key={i} className="sl-li">{l.slice(2).replace(/\s*\(\[#\d+\]\([^)]+\)\)/, "")}</p> : null)}</div>
      </Section>
      <style>{`.sl-item{display:grid;gap:4px;padding-bottom:8px;border-bottom:1px solid var(--line)}.sl-preview{display:grid;gap:4px}.sl-li{padding-left:16px;position:relative}.sl-li::before{content:"";position:absolute;left:2px;top:.65em;width:6px;height:6px;border-radius:50%;background:var(--accent)}.sl-warn{padding:8px 12px;border-left:4px solid var(--bad);background:color-mix(in srgb,var(--bad) 10%,transparent);border-radius:0 8px 8px 0}`}</style>
    </div>
  );
}
