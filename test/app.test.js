"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function app() {
  const elements = new Map();
  const document = { getElementById(id) {
    if (!elements.has(id)) elements.set(id, { innerHTML: "", value: "", textContent: "",
      addEventListener() {}, querySelectorAll() { return []; } });
    return elements.get(id);
  } };
  const context = vm.createContext({ document, AbortSignal, TextDecoder, setTimeout, clearTimeout,
    URLSearchParams, location: { search: "" }, queueMicrotask });
  vm.runInContext(fs.readFileSync(path.join(__dirname, "../app/app.js"), "utf8"), context);
  return { context, elements };
}

const token = "0x1111111111111111111111111111111111111111";
function history() {
  return { status: "resolved", deployer: token, launches: [
    { token, block: { Number: "123", Time: null }, txHash: "0xabc" },
  ] };
}

test("launch rows render with missing timestamps and escape token metadata", () => {
  const { context, elements } = app();
  const data = history();
  data.launches[0].name = '<img src=x onerror="alert(1)">';
  data.launches[0].symbol = "TOKEN";
  context.render(token, { kind: "eoa" }, data);
  const html = elements.get("output").innerHTML;
  assert.match(html, /block 123/);
  assert.match(html, /TOKEN/);
  assert.match(html, /&lt;img/);
  assert.ok(!html.includes('<img src=x'));
});

test("run displays launch addresses before token metadata finishes", async () => {
  const { context, elements } = app();
  elements.get("addrInput").value = token;
  context.fetchContractCard = async () => ({ kind: "eoa" });
  context.fetchDeployerHistory = async () => history();
  let finish;
  context.fetchNameSymbol = () => new Promise(resolve => { finish = resolve; });
  const running = context.run();
  await new Promise(resolve => setImmediate(resolve));
  assert.match(elements.get("output").innerHTML, /block 123/);
  assert.match(elements.get("output").innerHTML, /name unavailable/);
  finish({ name: "Named token", symbol: "NAMED" });
  await running;
  assert.match(elements.get("output").innerHTML, /Named token/);
});
