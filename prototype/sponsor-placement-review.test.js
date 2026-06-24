"use strict";

// Minimal, dependency-free verification for the sponsor placement review
// prototype. Run with: `node prototype/sponsor-placement-review.test.js`
// (Node built-ins only — no install, no build step.)
//
// It loads the prototype's embedded <script>, which exports its pure logic when
// `module` is present, and asserts the behavior the in-context preview promises:
// approving a soft overlap stays visually honest, and only a real fix moves the
// element clear.

const fs = require("fs");
const vm = require("vm");
const path = require("path");
const assert = require("assert");

function load(options) {
  const opts = options || {};
  const html = fs.readFileSync(path.join(__dirname, "sponsor-placement-review.html"), "utf8");
  const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
  const sandbox = { module: { exports: {} } };
  // structuredClone exists in modern engines; drop it to exercise the JSON
  // fallback the prototype ships for older embedded/webview contexts.
  if (!opts.withStructuredClone) {
    sandbox.structuredClone = undefined;
  }
  vm.createContext(sandbox);
  vm.runInContext(script, sandbox);
  return sandbox.module.exports;
}

const M = load({ withStructuredClone: true });

// Build the reconciled preview model for a single placement.
function preview(item) {
  const evaluation = M.evaluate([item]);
  return M.previewModel(item, evaluation.placements[0]);
}

const lowerThird = { id: "x", sponsor: "Lumen", type: "host-read", strength: "standard", at: 100, condition: "lower-third" };

// 1. lower-third + approve-as-is stays HONEST: element does not move off the
//    captions, the overlap stays marked, and it is an amber exception (not green).
let m = preview(Object.assign({}, lowerThird, { disp: "approve" }));
assert.deepStrictEqual(m.box, M.OVER_CAPTIONS_BOX, "approve keeps the element on the captions");
assert.strictEqual(m.captionsObscured, true, "approve keeps the caption overlap marked");
assert.strictEqual(m.variant, "exception", "approve is an exception treatment, not approved/green");
assert.strictEqual(m.tagTone, "review", "approve uses the amber tone, never clean green");

// 2. Only applying the suggested fix actually moves it clear and clears the overlap.
m = preview(Object.assign({}, lowerThird, { disp: "fix" }));
assert.deepStrictEqual(m.box, M.SAFE_BOX["host-read"], "fix moves the element to its safe box");
assert.strictEqual(m.captionsObscured, false, "fix clears the caption overlap (it really moved)");
assert.strictEqual(m.variant, "fixed", "fix is a resolved/green treatment");

// 3. needs-review (undecided) also shows the overlap honestly.
m = preview(Object.assign({}, lowerThird, { disp: "needs-review" }));
assert.deepStrictEqual(m.box, M.OVER_CAPTIONS_BOX);
assert.strictEqual(m.captionsObscured, true);
assert.strictEqual(m.variant, "review");

// 4. low-contrast approve stays faint + amber (the warning persists), never green.
m = preview({ id: "y", sponsor: "Acme", type: "lower-corner", strength: "subtle", at: 50, condition: "low-contrast", disp: "approve" });
assert.strictEqual(m.variant, "lowcontrast", "low-contrast approve stays rendered faint");
assert.strictEqual(m.tagTone, "review", "low-contrast approve stays amber, not green");

// 5. Green is reserved for genuinely clear cases: clean + approve is green.
m = preview({ id: "z", sponsor: "X", type: "lower-corner", strength: "subtle", at: 10, condition: "clean", disp: "approve" });
assert.strictEqual(m.variant, "approved", "no-conflict approval is allowed to be green");

// 6. Blocking conditions never offer an "approve" step in the first place.
["covers-face", "missing-disclosure", "sensitive-moment"].forEach((c) => {
  assert.ok(M.CONDITIONS[c].steps.indexOf("approve") < 0, c + " must not offer approve");
});

// 7. Shipped sample still blocks export on load (covers-face conflict present).
const sample = [
  { id: "s1", sponsor: "Acme Tools", type: "lower-corner", strength: "subtle", at: 95, condition: "clean", disp: "place" },
  { id: "s2", sponsor: "Brightline", type: "title-card", strength: "standard", at: 612, condition: "covers-face", disp: "conflict" },
  { id: "s3", sponsor: "Lumen Audio", type: "host-read", strength: "standard", at: 1455, condition: "lower-third", disp: "needs-review" },
  { id: "s4", sponsor: "Norththread", type: "end-card", strength: "prominent", at: 3380, condition: "missing-disclosure", disp: "conflict" },
  { id: "s5", sponsor: "Acme Tools", type: "description", strength: "subtle", at: 0, condition: "clean", disp: "place" },
];
assert.strictEqual(M.evaluate(sample).overall, "blocked", "sample blocks export on load");

// 8. clone() works WITHOUT a global structuredClone (the fallback path) and
//    returns an independent deep copy.
const Mfallback = load({ withStructuredClone: false });
const original = [{ id: "a", nested: { disp: "keep" } }];
const copy = Mfallback.clone(original);
assert.notStrictEqual(copy, original, "clone returns a new array");
assert.notStrictEqual(copy[0].nested, original[0].nested, "clone deep-copies nested objects");
copy[0].nested.disp = "changed";
assert.strictEqual(original[0].nested.disp, "keep", "mutating the clone never touches the original");

console.log("sponsor-placement-review: all assertions passed");
