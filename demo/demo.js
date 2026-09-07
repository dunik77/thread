const CASES = [
  {
    ticker: "$GLOWFROG",
    launch_address: "0xA17F9E2C4B8D1F6A3E9C7B2D5F8A1E4C6B9D3F70",
    deployer_address: "0xD3F81C4E9B2A7F5D8E1C4B9A6F3D7E2C5B8A1F94",
    phase: "graduated",
    deployer_prior_launches: [
      { ticker: "$MOSSKING", phase: "dead", tx_hash: "0x6a1fd83bce...c92d" },
      { ticker: "$EMBERPUP", phase: "graduated", tx_hash: "0x2b7ea914f0...44f1" }
    ],
    fee_recipients: [
      { address: "0x7C4A9F2E1D8B5C3A6F9E2D7C4B1A8F5E3D6C9B2A", amount: "4.80 ETH", tx_hash: "0x9d3c7ab421...81ab" }
    ],
    fee_recipients_elsewhere: [
      { address: "0x7C4A9F2E1D8B5C3A6F9E2D7C4B1A8F5E3D6C9B2A", launch: "$MOSSKING", tx_hash: "0x5e11d0af92...2c9e" },
      { address: "0x7C4A9F2E1D8B5C3A6F9E2D7C4B1A8F5E3D6C9B2A", launch: "$EMBERPUP", tx_hash: "0x8f3a29bc51...77d4" }
    ],
    evidence_gaps: [],
    generated_at: "2026-09-07 18:42 UTC · block 1,402,118"
  },
  {
    ticker: "$KELPKING",
    launch_address: "0xE28B4D1A9C6F3E7B2D5A8C1F4E9B6D3A7C2F5E81",
    deployer_address: "0xF1C8A4D7B2E9C6F3A8D1B5E2C9F6A3D7B4E1C8A5",
    phase: "curve",
    deployer_prior_launches: [],
    fee_recipients: [
      { address: "0x3D9A6C2F8E5B1D4A7C9F2E6B3D8A5C1F4E7B2D9A", amount: "0.62 ETH", tx_hash: "0x4f2a80c913...9c3d" }
    ],
    fee_recipients_elsewhere: [],
    evidence_gaps: [],
    generated_at: "2026-09-07 18:44 UTC · block 1,402,151"
  },
  {
    ticker: "$ASHVAULT",
    launch_address: "0xB94D2A7C1E8F5B3A9D6C2F4E7B1A8D5C3F9E6B2A",
    deployer_address: "0xA5D8C1F4E9B6A3D7C2F5E8B1A4D9C6F3E7B2A5D8",
    phase: "dead",
    deployer_prior_launches: [
      { ticker: "$VOIDCASK", phase: "graduated", tx_hash: "0x81ecb03f74...5a3f" }
    ],
    fee_recipients: [],
    fee_recipients_elsewhere: [],
    evidence_gaps: [
      "Fee escrow for this launch returned no events before the indexed block cutoff — recipient list may be incomplete, not empty.",
      "Deployer history checked back to block 1,180,000 only. Earlier activity by this address is not indexed."
    ],
    generated_at: "2026-09-07 18:46 UTC · block 1,402,177"
  }
];

let active = 0;

function short(addr){
  return addr.slice(0,8) + "…" + addr.slice(-6);
}

function findingLabel(c){
  const parts = [];
  if(c.deployer_prior_launches.length) parts.push(c.deployer_prior_launches.length + " prior launch" + (c.deployer_prior_launches.length>1?"es":""));
  if(c.fee_recipients_elsewhere.length) parts.push(c.fee_recipients_elsewhere.length + " fee overlap" + (c.fee_recipients_elsewhere.length>1?"s":""));
  if(c.evidence_gaps.length) parts.push(c.evidence_gaps.length + " gap" + (c.evidence_gaps.length>1?"s":""));
  return parts.length ? parts.join(" · ") : "no prior connections found";
}

function renderList(){
  const list = document.getElementById('caseList');
  list.innerHTML = CASES.map((c,i) => `
    <button class="case-item ${i===active?'active':''}" data-i="${i}">
      <span class="ticker">${c.ticker}</span>
      <span class="meta">
        <span class="pill ${c.phase}">${c.phase}</span>
        <span class="finding">${findingLabel(c)}</span>
      </span>
    </button>
  `).join('');
  list.querySelectorAll('.case-item').forEach(btn=>{
    btn.addEventListener('click', ()=>{ active = Number(btn.dataset.i); render(); });
  });
}

function txButton(hash){
  return `<button class="tx-btn" onclick="showToast()">${hash} ↗</button>`;
}

function renderDossier(){
  const c = CASES[active];
  const d = document.getElementById('dossier');
  d.innerHTML = `
    <div class="dossier-head">
      <div>
        <h2>${c.ticker}</h2>
        <div class="addr-row"><span class="label">launch</span> ${c.launch_address}</div>
        <div class="addr-row"><span class="label">deployer</span> ${c.deployer_address}</div>
      </div>
      <span class="pill ${c.phase}">${c.phase}</span>
    </div>

    <section class="block">
      <h3>Deployer history <span class="count">(${c.deployer_prior_launches.length})</span></h3>
      ${c.deployer_prior_launches.length ? c.deployer_prior_launches.map(l => `
        <div class="row">
          <span class="primary">${l.ticker}</span>
          <span class="pill ${l.phase}">${l.phase}</span>
          ${txButton(l.tx_hash)}
        </div>
      `).join('') : `<p class="empty-note">No earlier launches found for this deployer address in the indexed range.</p>`}
    </section>

    <section class="block">
      <h3>Fee-escrow recipients <span class="count">(${c.fee_recipients.length})</span></h3>
      ${c.fee_recipients.length ? c.fee_recipients.map(f => `
        <div class="row">
          <span class="primary">${short(f.address)}</span>
          <span class="amount">${f.amount}</span>
          ${txButton(f.tx_hash)}
        </div>
      `).join('') : `<p class="empty-note">No credited fee recipients recorded for this launch.</p>`}
    </section>

    <section class="block">
      <h3>Same recipient, other launches <span class="count">(${c.fee_recipients_elsewhere.length})</span></h3>
      ${c.fee_recipients_elsewhere.length ? c.fee_recipients_elsewhere.map(f => `
        <div class="row">
          <span class="primary">${short(f.address)}</span>
          <span class="via">also paid on ${f.launch}</span>
          ${txButton(f.tx_hash)}
        </div>
      `).join('') : `<p class="empty-note">No other launch has credited the same fee recipient.</p>`}
    </section>

    <section class="block">
      <h3>Evidence gaps <span class="count">(${c.evidence_gaps.length})</span></h3>
      ${c.evidence_gaps.length ? c.evidence_gaps.map(g => `
        <div class="gap-row"><span class="mark">△</span><span>${g}</span></div>
      `).join('') : `<p class="empty-note">Nothing known to be missing for this case file.</p>`}
    </section>

    <div class="dossier-foot">
      <span>generated ${c.generated_at}</span>
      <span>format v0 · see <a href="../docs/case-file-format.md">docs/case-file-format.md</a></span>
    </div>
  `;
}

function render(){ renderList(); renderDossier(); }

function showToast(){
  const t = document.getElementById('toast');
  t.classList.add('show');
  clearTimeout(window.__toastTimer);
  window.__toastTimer = setTimeout(()=> t.classList.remove('show'), 2200);
}

render();
