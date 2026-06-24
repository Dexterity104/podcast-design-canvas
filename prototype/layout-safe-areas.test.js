"use strict";

// Minimal, dependency-free verification for the "Sponsored" disclosure check added
// to the layout safe areas prototype.
// Run with: `node prototype/layout-safe-areas.test.js` (Node built-ins only).
//
// The prototype is browser-only, so the test supplies a tiny DOM stub that lets the
// page script run to its `module.exports` block (and confirms the render path does
// not throw). The assertions then exercise the pure evaluate() logic.

const fs = require("fs");
const vm = require("vm");
const path = require("path");
const assert = require("assert");

function makeNode() {
  const node = {
    _children: [], style: {}, dataset: {}, textContent: "", value: "",
    set innerHTML(v) { this._html = v; }, get innerHTML() { return this._html; },
    set className(v) { this._cls = v; }, get className() { return this._cls; },
    setAttribute() {}, getAttribute() { return null; },
    addEventListener() {},
    appendChild(c) { this._children.push(c); return c; },
    append(...cs) { this._children.push(...cs); },
    replaceChildren(...cs) { this._children = cs; },
    querySelector() { return makeNode(); },
    get children() { return this._children; },
  };
  return node;
}

function load() {
  const html = fs.readFileSync(path.join(__dirname, "layout-safe-areas.html"), "utf8");
  const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
  const roots = {};
  ["#rows", "#status", "#issues", "#addRow", "#reset"].forEach((s) => (roots[s] = makeNode()));
  const document = { createElement: () => makeNode(), querySelector: (s) => roots[s] || makeNode() };
  // vm contexts do not inherit Node globals; the prototype uses structuredClone, which
  // exists natively in the browser, so provide it here.
  const sandbox = { document, structuredClone: globalThis.structuredClone, module: { exports: {} } };
  vm.createContext(sandbox);
  vm.runInContext(script, sandbox); // runs render() for the sample — must not throw
  return sandbox.module.exports;
}

const M = load();
const state = (row) => M.evaluate([row]).results[0].state;
const issue = (row) => M.evaluate([row]).results[0].issue;

// 1. The disclosure check exists, is non-positional (its own preview), and offers
//    only the resolutions that fit: add the label, decide later, or accept.
assert.ok(M.checks.disclosure, "disclosure check exists");
assert.strictEqual(M.checks.disclosure.preview, "disclosure", "has its own frame preview");
// join() keeps the comparison realm-agnostic (the array comes from the vm context).
assert.strictEqual(M.checks.disclosure.fixes.join(","), "review,label,accept", "fits the conflict");
assert.ok(M.fixes.label, "the 'Add the Sponsored label' resolution exists");

// 2. A branded mark missing its label is a review item until the creator acts.
const undecided = { id: "x", element: "sponsor", check: "disclosure", fix: "review" };
assert.strictEqual(state(undecided), "review", "missing disclosure needs review");
assert.ok(/Sponsored/.test(issue(undecided).title), "the issue names the missing Sponsored label");

// 3. Adding the label resolves it; accepting keeps it as a deliberate choice.
assert.strictEqual(state({ ...undecided, fix: "label" }), "fixed", "adding the label resolves it");
assert.strictEqual(state({ ...undecided, fix: "accept" }), "accepted", "accept keeps it on purpose");

// 4. A stale fix the disclosure check does not offer falls back to review (never acts
//    on an option the UI would not show).
assert.strictEqual(state({ ...undecided, fix: "move" }), "review", "a non-offered fix is ignored");

// 5. The default sample surfaces the new check and blocks export on load.
const sampleEval = M.evaluate(M.sampleRows);
assert.ok(M.sampleRows.some((r) => r.check === "disclosure"), "sample includes the disclosure row");
assert.strictEqual(sampleEval.overall, "review", "layout needs review on load");

// 6. The new check does not disturb the existing placement checks.
assert.strictEqual(state({ id: "y", element: "logo", check: "outside-crop", fix: "accept" }), "accepted");
assert.strictEqual(state({ id: "z", element: "caption", check: "clear", fix: "keep" }), "clear");

console.log("layout-safe-areas (Sponsored disclosure check): all assertions passed");
