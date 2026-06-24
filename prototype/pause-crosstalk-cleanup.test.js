"use strict";

// Minimal, dependency-free verification for the pause and cross-talk cleanup
// prototype. Run with: `node prototype/pause-crosstalk-cleanup.test.js`
// (Node built-ins only — no install, no build step.)
//
// It loads the prototype's embedded <script>, which exports its pure logic when
// `module` is present, and asserts the behavior the moment preview promises: each
// decision is judgeable (the strip shows the detected issue and what the cleanup
// changes), and the batch "Apply to similar" control never lies about its reach.

const fs = require("fs");
const vm = require("vm");
const path = require("path");
const assert = require("assert");

function load(options) {
  const opts = options || {};
  const html = fs.readFileSync(path.join(__dirname, "pause-crosstalk-cleanup.html"), "utf8");
  const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
  const sandbox = { module: { exports: {} } };
  if (!opts.withStructuredClone) {
    sandbox.structuredClone = undefined;
  }
  vm.createContext(sandbox);
  vm.runInContext(script, sandbox);
  return sandbox.module.exports;
}

const M = load({ withStructuredClone: true });

function preview(item) {
  const evaluation = M.evaluate([item]);
  return M.momentPreview(item, evaluation.moments[0]);
}

// 1. A long pause is judgeable: the preview names the detected gap and, once the
//    creator shortens it, shows the shorter target — a real, visible before/after.
const deadAir = { id: "a", speaker: "Guest 1", kind: "dead-air", seconds: 4.0 };
let m = preview(Object.assign({}, deadAir, { disp: "suggested" }));
assert.strictEqual(m.viz, "gap");
assert.strictEqual(m.before, "4.0s pause", "names the detected pause length");
assert.strictEqual(m.changed, false, "an undecided moment has changed nothing yet");
assert.ok(/suggested:/.test(m.after), "undecided moment hints the suggested action");

m = preview(Object.assign({}, deadAir, { disp: "shorten" }));
assert.strictEqual(m.changed, true, "shorten changes the moment");
assert.strictEqual(m.after, M.shortenTo(4.0).toFixed(1) + "s gap", "shows the shortened target");
const fullGap = preview(Object.assign({}, deadAir, { disp: "keep" })).gapPercent;
assert.ok(m.gapPercent < fullGap, "the gap visibly narrows when shortened");

// 2. keep is honest: nothing changes, the moment stays natural.
m = preview(Object.assign({}, deadAir, { disp: "keep" }));
assert.strictEqual(m.changed, false);
assert.strictEqual(m.tone, "natural");
assert.strictEqual(m.after, "kept natural");

// 3. Cross-talk is judgeable as an overlap of two voices; reducing drops the second
//    voice rather than deleting the exchange, and caption review reads as blocking.
const crossTalk = { id: "b", speaker: "Host", other: "Guest 1", kind: "cross-talk" };
m = preview(Object.assign({}, crossTalk, { disp: "suggested" }));
assert.strictEqual(m.viz, "overlap");
assert.strictEqual(m.secondary, "Guest 1", "the overlapping second speaker is named");
m = preview(Object.assign({}, crossTalk, { disp: "reduce" }));
assert.strictEqual(m.reducedSecondary, true, "reduce fades the second voice");
assert.strictEqual(m.after, "background reduced");
m = preview(Object.assign({}, crossTalk, { disp: "caption" }));
assert.strictEqual(m.captionMark, true);
assert.strictEqual(m.tone, "block", "caption review is the blocking decision");

// 4. A cough/bump is a spike that flattens when reduced.
m = preview({ id: "c", speaker: "Guest 2", kind: "bump", disp: "reduce" });
assert.strictEqual(m.viz, "spike");
assert.strictEqual(m.flatSpike, true);

// 5. ignore sets the moment aside (dimmed), off export.
m = preview(Object.assign({}, deadAir, { disp: "ignore" }));
assert.strictEqual(m.dim, true);
assert.strictEqual(m.after, "left as-is, off export");

// 6. Only valid choices per kind: a stale choice falls back to "suggested".
assert.strictEqual(M.evaluate([{ id: "x", kind: "dead-air", disp: "caption" }]).moments[0].state, "suggested",
  "caption is not a valid dead-air choice and is dropped");

// 7. Default sample: the batch control is exact, never a no-op, never overstating.
const sample = [
  { id: "m1", at: 185, speaker: "Guest 1", kind: "dead-air", seconds: 4.0, disp: "suggested" },
  { id: "m2", at: 642, speaker: "Host", other: "Guest 1", kind: "cross-talk", disp: "reduce" },
  { id: "m3", at: 1377, speaker: "Guest 1", other: "Host", kind: "interruption", disp: "suggested" },
  { id: "m4", at: 2010, speaker: "Guest 2", kind: "bump", disp: "suggested" },
  { id: "m5", at: 2890, speaker: "Host", kind: "false-start", disp: "suggested" },
  { id: "m6", at: 3245, speaker: "Guest 2", other: "Host", kind: "cross-talk", disp: "keep" },
];
assert.strictEqual(M.canApplySimilar(1, sample), true, "cross-talk moment offers the batch control");
assert.strictEqual(M.countSimilar(1, sample), 1, "exactly one other cross-talk moment differs");
assert.strictEqual(M.canApplySimilar(0, sample), false, "a unique-kind moment offers no batch control");
const evalSample = M.evaluate(sample);
assert.strictEqual(sample.length - (evalSample.counts.suggested || 0), 2, "2 of 6 decided on load");
assert.strictEqual(evalSample.overall, "review");

const applied = M.applySimilar(1, sample);
assert.strictEqual(M.evaluate(applied).moments[5].state, "softened", "applying propagates a real change");
assert.strictEqual(M.canApplySimilar(1, applied), false, "control disappears once all match (no no-op)");

// Count never overstates: 2 already match, 1 differs => count is 1.
const three = [
  { id: "a", kind: "cross-talk", disp: "reduce" },
  { id: "b", kind: "cross-talk", disp: "reduce" },
  { id: "c", kind: "cross-talk", disp: "keep" },
];
assert.strictEqual(M.countSimilar(0, three), 1, "count excludes already-matching moments");

// 8. clone() works without a global structuredClone (the fallback path).
const Mfb = load({ withStructuredClone: false });
const original = [{ id: "a", nested: { disp: "keep" } }];
const copy = Mfb.clone(original);
copy[0].nested.disp = "changed";
assert.strictEqual(original[0].nested.disp, "keep", "clone deep-copies via the fallback");

console.log("pause-crosstalk-cleanup: all assertions passed");
