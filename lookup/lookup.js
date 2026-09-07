const RPC = "https://rpc.mainnet.chain.robinhood.com";
const EXAMPLES = [
  "0x385F4f8ae47651ce5F58F5265395a669f8281e18",
  "0x39dBED3a2bd333467115dE45665cC57F813C4571",
  "0x020bfC650A365f8BB26819deAAbF3E21291018b4"
];

const addrInput = document.getElementById('addrInput');
const goBtn = document.getElementById('goBtn');
const statusLine = document.getElementById('statusLine');
const output = document.getElementById('output');
const quickfill = document.getElementById('quickfill');

quickfill.innerHTML = EXAMPLES.map(a =>
  `<button class="chip" data-a="${a}">${short(a)}</button>`
).join('');
quickfill.querySelectorAll('.chip').forEach(c => {
  c.addEventListener('click', () => { addrInput.value = c.dataset.a; run(); });
});

goBtn.addEventListener('click', run);
addrInput.addEventListener('keydown', e => { if (e.key === 'Enter') run(); });

function short(a){ return a.slice(0,8) + '…' + a.slice(-6); }
function isAddress(a){ return /^0x[0-9a-fA-F]{40}$/.test(a); }

async function rpc(method, params){
  const res = await fetch(RPC, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
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
  // EIP-1167 and common vanity-clone variants: short bytecode with a PUSH20 (0x73)
  // opcode carrying the implementation address, immediately before the DELEGATECALL.
  const body = code.slice(2);
  if (body.length > 200) return null; // real implementations are much longer
  for (let i = 0; i + 2 <= body.length; i += 2){
    if (body.slice(i, i+2) === '73' && i + 2 + 40 <= body.length){
      const candidate = body.slice(i+2, i+2+40);
      if (body.includes('5af4')) return '0x' + candidate; // 5af4 = DELEGATECALL
    }
  }
  return null;
}

async function run(){
  const addr = addrInput.value.trim();
  if (!isAddress(addr)){
    statusLine.textContent = 'Not a valid 0x address (need 40 hex characters).';
    statusLine.className = 'status-line err';
    return;
  }
  statusLine.className = 'status-line';
  statusLine.textContent = 'reading chain…';
  goBtn.disabled = true;

  try{
    const [code, blockHex] = await Promise.all([
      rpc('eth_getCode', [addr, 'latest']),
      rpc('eth_blockNumber', [])
    ]);
    const block = parseInt(blockHex, 16);
    const isContract = code && code !== '0x';

    if (!isContract){
      const [balHex, nonceHex] = await Promise.all([
        rpc('eth_getBalance', [addr, 'latest']),
        rpc('eth_getTransactionCount', [addr, 'latest'])
      ]);
      const eth = parseInt(balHex, 16) / 1e18;
      renderEOA(addr, eth, parseInt(nonceHex,16), block);
      statusLine.textContent = `read at block ${block.toLocaleString()}`;
      return;
    }

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

    renderContract(addr, code, block, proxyTarget, values);
    statusLine.textContent = `read at block ${block.toLocaleString()}`;
  }catch(err){
    statusLine.className = 'status-line err';
    statusLine.textContent = 'RPC read failed: ' + err.message;
  }finally{
    goBtn.disabled = false;
  }
}

function renderEOA(addr, eth, nonce, block){
  output.innerHTML = `
    <div class="result">
      <div class="result-head">
        <div>
          <h2>Not a contract</h2>
          <div class="sym">wallet address</div>
        </div>
        <span class="pill eoa">EOA</span>
      </div>
      <div class="field"><div class="k">Address</div><div class="v">${addr}</div></div>
      <div class="field"><div class="k">Balance</div><div class="v">${eth.toFixed(6)} ETH</div></div>
      <div class="field"><div class="k">Nonce</div><div class="v">${nonce} (transactions sent)</div></div>
      <div class="field"><div class="k">Block</div><div class="v">${block.toLocaleString()}</div></div>
      <div class="scope-note">This address has no bytecode — it's a regular wallet, not a token. If you meant to paste a token's contract address, double-check it.</div>
    </div>`;
}

function renderContract(addr, code, block, proxyTarget, v){
  const hasErc20 = v.name || v.symbol || v.totalSupply;
  const supply = v.totalSupply ? (BigInt(v.totalSupply) / (10n ** BigInt(v.decimals ? parseInt(v.decimals,16) : 18))).toString() : null;
  const decimals = v.decimals ? parseInt(v.decimals, 16) : null;

  output.innerHTML = `
    <div class="result">
      <div class="result-head">
        <div>
          <h2>${v.name || '(name unavailable)'}</h2>
          <div class="sym">${v.symbol || ''}</div>
        </div>
        <span class="pill ${proxyTarget ? 'proxy' : 'contract'}">${proxyTarget ? 'proxy clone' : 'contract'}</span>
      </div>
      <div class="field"><div class="k">Address</div><div class="v">${addr}</div></div>
      ${proxyTarget ? `<div class="field"><div class="k">Implementation</div><div class="v">${proxyTarget}</div></div>` : ''}
      <div class="field"><div class="k">Decimals</div><div class="v">${decimals !== null ? decimals : '—'}</div></div>
      <div class="field"><div class="k">Total supply</div><div class="v">${supply ? Number(supply).toLocaleString() + ' ' + (v.symbol||'') : '—'}</div></div>
      <div class="field"><div class="k">Bytecode size</div><div class="v">${(code.length-2)/2} bytes</div></div>
      <div class="field"><div class="k">Block</div><div class="v">${block.toLocaleString()}</div></div>
      ${!hasErc20 ? `<div class="field"><div class="k">Note</div><div class="v muted">Contract exists but did not respond to standard ERC-20 read calls — it may use a non-standard interface.</div></div>` : ''}
      <div class="scope-note">
        <b>What this shows:</b> live ERC-20 metadata and contract type only, read directly from the chain.<br>
        <b>Not shown yet:</b> deployer address, launch/graduation history, or fee-escrow recipients — that needs indexing beyond a single RPC read. See <a href="../SPEC.md" style="color:var(--accent-dim)">SPEC.md</a> and <a href="../STATUS.md" style="color:var(--accent-dim)">STATUS.md</a> for that work.
      </div>
    </div>`;
}
