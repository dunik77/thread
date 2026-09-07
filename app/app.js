const RPC = "https://rpc.mainnet.chain.robinhood.com";
const EXPLORER = "https://robinhoodchain.blockscout.com";
const EXAMPLES = [
  { a: "0xdf2237114d595e0bf4d35cbcdebcdf43c55c4669", tag: "real repeat deployer" },
  { a: "0xca11bde05977b3631167028862be2a173976ca11", tag: "Multicall3 -- infra, not a person" },
  { a: "0x385F4f8ae47651ce5F58F5265395a669f8281e18", tag: "not a Pons v2 launch" },
];

const addrInput = document.getElementById('addrInput');
const goBtn = document.getElementById('goBtn');
const statusLine = document.getElementById('statusLine');
const output = document.getElementById('output');
const quickfill = document.getElementById('quickfill');

quickfill.innerHTML = EXAMPLES.map(e =>
  `<button class="chip" data-a="${e.a}">${short(e.a)} <span class="tag">· ${e.tag}</span></button>`
).join('');
quickfill.querySelectorAll('.chip').forEach(c => {
  c.addEventListener('click', () => { addrInput.value = c.dataset.a; run(); });
});

goBtn.addEventListener('click', run);
addrInput.addEventListener('keydown', e => { if (e.key === 'Enter') run(); });

// ?address=0x... runs the lookup straight away, so a finding can be handed
// to someone as a link instead of "paste this in yourself". Also what makes
// the README screenshot a real capture rather than a mocked-up one.
const deepLink = new URLSearchParams(location.search).get('address');
if (deepLink) {
  addrInput.value = deepLink;
  queueMicrotask(() => run());
}

function short(a){ return a.slice(0,8) + '…' + a.slice(-6); }
function escapeHtml(value){
  return String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[c]));
}
function isAddress(a){ return /^0x[0-9a-fA-F]{40}$/.test(a); }
function explorerAddr(a){ return `${EXPLORER}/address/${a}`; }

/** Copies the full address, not the truncated display text -- addresses are hex only, safe to inline. */
async function copyAddr(addr, btn){
  try{
    await navigator.clipboard.writeText(addr);
  }catch(e){
    // Clipboard API unavailable (very old browser, or a non-secure context
    // that isn't localhost) -- fall back to the old execCommand path.
    const ta = document.createElement('textarea');
    ta.value = addr;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
  }
  showToast(`Copied ${short(addr)}`);
  if (btn){
    const original = btn.textContent;
    btn.textContent = '✓';
    btn.classList.add('copied');
    setTimeout(() => { btn.textContent = original; btn.classList.remove('copied'); }, 1200);
  }
}

function showToast(msg){
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(window.__toastTimer);
  window.__toastTimer = setTimeout(() => t.classList.remove('show'), 1800);
}

function copyBtnHtml(addr){
  return `<button class="copy-btn" onclick="copyAddr('${addr}', this)" title="Copy full address">copy</button>`;
}
function explorerTx(h){ return `${EXPLORER}/tx/${h}`; }

/**
 * The primary way to follow an address inside thread: replaces the input
 * and runs a fresh lookup, the same as clicking one of the quick-fill
 * chips. Used for the deployer address specifically -- clicking it treats
 * it as "look this account up here," not "leave and go read a raw
 * explorer page," which is the whole point of building this as a service
 * rather than pointing everything at Blockscout.
 */
function lookupInApp(address){
  addrInput.value = address;
  window.scrollTo({ top: 0, behavior: 'smooth' });
  run();
}

/** An address rendered as an in-app lookup link, with a small separate icon out to the explorer for anyone who still wants the raw page. */
function addrLinkHtml(address){
  return `<button class="addr-link" onclick="lookupInApp('${address}')" title="Look up ${address} in thread">${address}</button>` +
    `<a class="explorer-mini" href="${explorerAddr(address)}" target="_blank" rel="noopener" title="Open on block explorer instead">explorer ↗</a>`;
}

async function rpc(method, params){
  const res = await fetch(RPC, {
    signal: AbortSignal.timeout(5000),
    method: 'POST', headers: {'Content-Type':'application/json'},
    body: JSON.stringify({ jsonrpc:'2.0', id:1, method, params })
  });
  const json = await res.json();
  if (json.error) throw new Error(json.error.message || 'RPC error');
  return json.result;
}

function decodeString(hex){
  try{
    const h = hex.slice(2);
    const len = parseInt(h.slice(64,128), 16);
    const data = h.slice(128, 128 + len*2);
    const bytes = data.match(/.{1,2}/g).map(b => parseInt(b,16));
    return new TextDecoder().decode(new Uint8Array(bytes));
  }catch(e){ return null; }
}

function detectMinimalProxy(code){
  const body = code.slice(2);
  if (body.length > 200) return null;
  for (let i = 0; i + 2 <= body.length; i += 2){
    if (body.slice(i, i+2) === '73' && i + 2 + 40 <= body.length){
      const candidate = body.slice(i+2, i+2+40);
      if (body.includes('5af4')) return '0x' + candidate;
    }
  }
  return null;
}

async function fetchContractCard(addr){
  const [code, blockHex] = await Promise.all([
    rpc('eth_getCode', [addr, 'latest']),
    rpc('eth_blockNumber', [])
  ]);
  const isContract = code && code !== '0x';
  if (!isContract) return { kind: 'eoa' };

  const proxyTarget = detectMinimalProxy(code);
  const selectors = { name:'0x06fdde03', symbol:'0x95d89b41', decimals:'0x313ce567', totalSupply:'0x18160ddd' };
  const calls = await Promise.allSettled(
    Object.entries(selectors).map(([k,sel]) => rpc('eth_call', [{to:addr, data:sel}, 'latest']).then(r => [k,r]))
  );
  const values = {};
  for (const c of calls){
    if (c.status === 'fulfilled'){
      const [k, raw] = c.value;
      values[k] = (k === 'name' || k === 'symbol') ? decodeString(raw) : raw;
    }
  }
  return { kind: 'contract', proxyTarget, values };
}

/** Same two read calls as fetchContractCard, but only the two needed to label a list row. */
async function fetchNameSymbol(addr){
  try{
    const [nameRaw, symbolRaw] = await Promise.all([
      rpc('eth_call', [{to:addr, data:'0x06fdde03'}, 'latest']),
      rpc('eth_call', [{to:addr, data:'0x95d89b41'}, 'latest']),
    ]);
    return { name: decodeString(nameRaw), symbol: decodeString(symbolRaw) };
  }catch(e){
    return { name: null, symbol: null };
  }
}

/**
 * Bitquery's TokenLaunched event carries addresses only, no name or symbol
 * -- so a deployer's other launches would otherwise render as a bare list
 * of hex strings, telling you nothing about what any of them actually are.
 * This fetches name/symbol for each one directly from the chain, same as
 * the main Contract card above, capped at two workers (four RPC calls) so a
 * deployer with 30 launches doesn't fire 60 simultaneous calls at a public,
 * keyless RPC that's already shared with everyone else using it.
 */
async function enrichLaunches(launches, onUpdate){
  const CONCURRENCY = 2;
  const out = launches.map(l => ({ ...l }));
  let next = 0;
  async function worker(){
    while (next < launches.length){
      const i = next++;
      out[i] = { ...launches[i], ...(await fetchNameSymbol(launches[i].token)) };
      if (onUpdate) onUpdate(out);
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, launches.length) }, worker));
  return out;
}

/**
 * Bitquery's realtime tier gets less reliable as a deployer's launch count
 * grows -- observed timing out and needing more than one try, with no other
 * change, against real addresses in this app's own quick-fill list. Rather
 * than hide that behind one long, silent server-side retry, this retries
 * client-side (up to 3 tries) and calls `onAttempt` before each one so the
 * status line can show real progress instead of looking frozen. Only an
 * "inconclusive" result is retried -- a resolved answer or a hard error
 * returns immediately.
 */
async function fetchDeployerHistory(addr, onAttempt){
  const maxAttempts = 3;
  let last = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++){
    if (onAttempt) onAttempt(attempt, maxAttempts);
    const res = await fetch(`/api/deployer-history?address=${addr}`);
    last = await res.json();
    if (last.status !== 'inconclusive') return last;
  }
  return last;
}

let lookupVersion = 0;
async function run(){
  const addr = addrInput.value.trim();
  if (!isAddress(addr)){
    statusLine.className = 'status-line err';
    statusLine.textContent = 'Not a valid 0x address (need 40 hex characters).';
    return;
  }
  const version = ++lookupVersion;
  statusLine.className = 'status-line';
  statusLine.textContent = 'reading chain…';
  goBtn.disabled = true;

  const onAttempt = (attempt, max) => {
    if (version !== lookupVersion) return;
    statusLine.textContent = attempt === 1
      ? 'reading chain and querying deployer history…'
      : `deployer history is slow to answer (Bitquery's free tier) — retrying, attempt ${attempt} of ${max}…`;
  };

  try{
    const [contractCard, history] = await Promise.all([
      fetchContractCard(addr).catch(e => ({ kind: 'error', message: e.message })),
      fetchDeployerHistory(addr, onAttempt).catch(e => ({ status: 'error', reason: e.message })),
    ]);
    if (version !== lookupVersion) return;
    render(addr, contractCard, history);
    if (history.status === 'resolved' && history.launches.length > 0){
      statusLine.textContent = `identifying ${history.launches.length} other launch(es)…`;
      history.launches = await enrichLaunches(history.launches, launches => {
        if (version === lookupVersion) render(addr, contractCard, { ...history, launches });
      });
    }
    if (version !== lookupVersion) return;
    render(addr, contractCard, history);
    statusLine.textContent = 'done';
  }catch(err){
    if (version !== lookupVersion) return;
    statusLine.className = 'status-line err';
    statusLine.textContent = 'Lookup failed: ' + err.message;
  }finally{
    if (version === lookupVersion) goBtn.disabled = false;
  }
}

function render(addr, card, history){
  let html = '';

  // -- ERC-20 metadata card (real, client-side RPC) --
  html += '<div class="card">';
  html += `<div class="card-head"><h3>Contract</h3>${card.kind === 'contract' ? `<span class="pill ${card.proxyTarget ? 'proxy' : 'contract'}">${card.proxyTarget ? 'proxy clone' : 'contract'}</span>` : card.kind === 'eoa' ? '<span class="pill eoa">EOA</span>' : ''}</div>`;
  if (card.kind === 'contract'){
    const v = card.values;
    html += `<div class="field"><div class="k">Name</div><div class="v">${escapeHtml(v.name || '—')} ${v.symbol ? '('+escapeHtml(v.symbol)+')' : ''}</div></div>`;
    if (card.proxyTarget) html += `<div class="field"><div class="k">Implementation</div><div class="v"><a href="${explorerAddr(card.proxyTarget)}" target="_blank" rel="noopener">${card.proxyTarget}</a></div></div>`;
    if (v.totalSupply){
      const dec = v.decimals ? parseInt(v.decimals,16) : 18;
      const supply = (BigInt(v.totalSupply) / (10n ** BigInt(dec))).toString();
      html += `<div class="field"><div class="k">Total supply</div><div class="v">${Number(supply).toLocaleString()} ${escapeHtml(v.symbol||'')}</div></div>`;
    }
    html += `<div class="field"><div class="k">Explorer</div><div class="v"><a href="${explorerAddr(addr)}" target="_blank" rel="noopener">${addr}</a>${copyBtnHtml(addr)}</div></div>`;
  } else if (card.kind === 'eoa') {
    html += `<div class="field"><div class="k">Note</div><div class="v muted">No bytecode -- this is a wallet address, not a token contract.</div></div>`;
    html += `<div class="field"><div class="k">Explorer</div><div class="v"><a href="${explorerAddr(addr)}" target="_blank" rel="noopener">${addr}</a>${copyBtnHtml(addr)}</div></div>`;
  } else {
    html += `<div class="field"><div class="k">Error</div><div class="v muted">${card.message || 'RPC read failed'}</div></div>`;
  }
  html += '</div>';

  // -- Deployer history card (real, server-side Bitquery) --
  html += '<div class="card">';
  const historyPill = history.status === 'not-found' ? '<span class="pill notfound">not a Pons v2 launch</span>'
    : history.status === 'inconclusive' ? '<span class="pill unclear">unclear -- try again</span>'
    : '';
  html += `<div class="card-head"><h3>Deployer history</h3>${historyPill}</div>`;
  if (history.status === 'resolved'){
    html += `<div class="field"><div class="k">Deployer</div><div class="v">${addrLinkHtml(history.deployer)}${copyBtnHtml(history.deployer)}</div></div>`;
    if (history.viaToken){
      html += `<p style="margin:8px 0 0;color:var(--text-faint);font-size:12px;">(resolved from the token address you entered)</p>`;
    }
    if (history.viaDirectRpc){
      html += `<p style="margin:8px 0 0;color:var(--text-faint);font-size:12px;">(Bitquery couldn't answer this time -- read directly from the chain instead, see SPEC.md)</p>`;
    }
    if (history.infra){
      html += `<div class="infra-warning" style="margin-top:12px;"><span class="mark">⚠</span><div><b>${history.infra.name}</b> -- not a person. ${history.infra.reason}</div></div>`;
    }
    if (history.partial){
      html += `<div class="infra-warning" style="margin-top:12px;border-color:var(--warn);"><span class="mark">⚠</span><div>${escapeHtml(history.partialReason)}</div></div>`;
    } else {
      html += `<div class="field"><div class="k">Launches found</div><div class="v">${history.launches.length}${history.hitLimit ? ' (hit query limit -- more may exist)' : ''}</div></div>`;
    }
    if (history.launches.length > 0){
      html += '<div class="launch-list" style="margin-top:10px;">';
      for (const l of history.launches){
        const label = l.name || l.symbol
          ? `<b>${escapeHtml(l.name || l.symbol)}</b>${l.name && l.symbol ? ' ('+escapeHtml(l.symbol)+')' : ''} <span style="color:var(--text-faint)">${short(l.token)}</span>`
          : `${short(l.token)} <span style="color:var(--text-faint)">(name unavailable)</span>`;
        const time = l.block?.Time ? l.block.Time.slice(0,16).replace('T',' ') : `block ${l.block?.Number || 'unknown'}`;
        html += `<div class="row"><span class="t"><button class="addr-link" onclick="lookupInApp('${l.token}')">${label}</button></span><span class="time">${escapeHtml(time)}</span>${copyBtnHtml(l.token)}<a class="explorer" href="${explorerTx(l.txHash)}" target="_blank" rel="noopener">tx ↗</a></div>`;
      }
      html += '</div>';
    }
  } else if (history.status === 'not-found') {
    html += `<div class="field"><div class="k">Result</div><div class="v">Not a Pons v2 launch.</div></div>`;
    html += `<p style="margin:10px 0 0;color:var(--text-faint);font-size:12px;">${history.reason}</p>`;
  } else if (history.status === 'inconclusive') {
    html += `<div class="field"><div class="k">Result</div><div class="v muted">Genuinely unclear: ${history.reason}</div></div>`;
    html += `<p style="margin:10px 0 0;color:var(--text-faint);font-size:12px;">Both Bitquery and a direct check against the public RPC failed to give a clean answer this time -- not a confirmed negative, not a confirmed launch. Try Look up again.</p>`;
  } else {
    html += `<div class="field"><div class="k">Error</div><div class="v muted">${history.reason || history.error || 'query failed'}</div></div>`;
  }
  html += '</div>';

  // -- Fee-recipient card (honestly not built) --
  html += '<div class="card">';
  html += `<div class="card-head"><h3>Fee-recipient history</h3><span class="pill notbuilt">not built</span></div>`;
  html += `<div class="not-built">TokenLaunched doesn't carry fee-recipient data -- it's in decoded call input, not an event.<br>See SPEC.md milestone M3.</div>`;
  html += '</div>';

  output.innerHTML = html;
}
