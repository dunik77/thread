#!/usr/bin/env node
"use strict";

/**
 * Captures assets/screenshot.png from the *running* service, waiting for a
 * real lookup to finish before the shutter fires.
 *
 * The naive approach (chrome --screenshot --virtual-time-budget) doesn't
 * work here: virtual time fast-forwards timers but real Bitquery and RPC
 * responses still take real seconds, so the capture lands on an empty page.
 * This drives Chrome over the DevTools Protocol instead and polls the page's
 * own status line until it says "done" -- the same signal a person waits for.
 *
 * That matters beyond convenience: it means the screenshot in the README is
 * a real lookup against live data, not a mock-up, and anyone can regenerate
 * it and get whatever the chain says today.
 *
 * Usage:
 *   npm run serve                       # in one terminal
 *   node scripts/screenshot.js          # in another
 *   node scripts/screenshot.js 0xTOKEN  # a different address
 */

const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PORT = 9222;
const SERVICE = process.env.THREAD_URL || "http://localhost:4663";
// a real token whose deployer has a long, named launch history -- shows the
// whole product in one frame: contract card, resolved deployer, the list
const ADDRESS = process.argv[2] || "0xa146cc739a09d0543e7e5b525f8eca26bb518032";
const OUT = path.join(__dirname, "..", "assets", "screenshot.png");
const READY_TIMEOUT_MS = 180000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitForDevTools() {
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(`http://localhost:${PORT}/json/version`);
      if (res.ok) return res.json();
    } catch {}
    await sleep(250);
  }
  throw new Error("Chrome's debugging port never came up");
}

/** Minimal CDP client: send a command, resolve when its id comes back. */
function connect(wsUrl) {
  const ws = new WebSocket(wsUrl);
  const pending = new Map();
  let nextId = 1;
  const ready = new Promise((resolve, reject) => {
    ws.addEventListener("open", () => resolve());
    ws.addEventListener("error", (e) => reject(new Error("websocket error: " + e.message)));
  });
  ws.addEventListener("message", (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
    }
  });
  return {
    ready,
    send(method, params = {}) {
      const id = nextId++;
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        ws.send(JSON.stringify({ id, method, params }));
      });
    },
    close: () => ws.close(),
  };
}

async function main() {
  // fail early and clearly if the service isn't up, rather than capturing a 404
  try {
    const probe = await fetch(SERVICE);
    if (!probe.ok) throw new Error(`HTTP ${probe.status}`);
  } catch (err) {
    console.error(`The service isn't answering at ${SERVICE} (${err.message}). Start it with: npm run serve`);
    process.exit(1);
  }

  const chrome = spawn(CHROME, [
    "--headless=new",
    "--disable-gpu",
    "--hide-scrollbars",
    `--remote-debugging-port=${PORT}`,
    "--window-size=1000,1200",
    "about:blank",
  ], { stdio: "ignore" });

  try {
    await waitForDevTools();

    const url = `${SERVICE}/?address=${ADDRESS}`;
    const tabRes = await fetch(`http://localhost:${PORT}/json/new?${encodeURIComponent(url)}`, { method: "PUT" });
    const tab = await tabRes.json();

    const cdp = connect(tab.webSocketDebuggerUrl);
    await cdp.ready;
    await cdp.send("Page.enable");
    await cdp.send("Runtime.enable");
    await cdp.send("Emulation.setDeviceMetricsOverride", {
      width: 1000, height: 1200, deviceScaleFactor: 2, mobile: false,
    });

    console.log(`Looking up ${ADDRESS} in a real browser, waiting for the lookup to finish...`);

    // the page sets its own status line to "done" only after the deployer
    // history has resolved AND every launch has been named
    const started = Date.now();
    let ready = false;
    while (Date.now() - started < READY_TIMEOUT_MS) {
      const { result } = await cdp.send("Runtime.evaluate", {
        expression: `(() => {
          const s = document.getElementById('statusLine');
          const cards = document.querySelectorAll('#output .card').length;
          return s && s.textContent.trim() === 'done' && cards >= 2;
        })()`,
        returnByValue: true,
      });
      if (result.value) { ready = true; break; }
      await sleep(1000);
    }
    if (!ready) throw new Error("the lookup never finished -- Bitquery may be rate-limited right now, try again");

    console.log(`Lookup finished in ${Math.round((Date.now() - started) / 1000)}s. Capturing.`);
    await sleep(600);   // let the last repaint settle

    const { contentSize } = await cdp.send("Page.getLayoutMetrics");
    const height = Math.ceil(contentSize.height);
    await cdp.send("Emulation.setDeviceMetricsOverride", {
      width: 1000, height, deviceScaleFactor: 2, mobile: false,
    });

    const shot = await cdp.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true });
    fs.writeFileSync(OUT, Buffer.from(shot.data, "base64"));
    console.log(`Wrote ${path.relative(process.cwd(), OUT)} (1000x${height} at 2x)`);

    cdp.close();
  } finally {
    chrome.kill();
  }
}

main().catch((err) => {
  console.error("Screenshot failed:", err.message);
  process.exit(1);
});
