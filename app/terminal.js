"use strict";

// Shares the live lookup and progressive metadata reader with the main app.
// Only the presentation changes: no generated token data or trading signals.
render = function renderTerminal(addr, card, history) {
  const esc = escapeHtml;
  const stamp = new Date().toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
  let html = `<div class="summary"><div><b>thread</b> trace · pons v2 · Robinhood Chain (4663)</div><div class="address"><span class="dim">input </span>${esc(addr)}</div><div class="meta"><span>observed <strong>${stamp}</strong></span><span>source <strong>${history.viaDirectRpc ? 'factory logs / RPC' : 'Bitquery / chain reads'}</strong></span></div></div>`;
  if (history.status !== 'resolved') {
    html += `<div class="notice">${esc(history.reason || history.error || 'History unavailable. Try again.')}</div>`;
    output.innerHTML = html;
    return;
  }
  const launches = history.launches || [];
  html += `<div class="summary"><div class="address"><span class="dim">deployer </span><a href="${explorerAddr(history.deployer)}" target="_blank" rel="noopener">${esc(history.deployer)}</a>${copyBtnHtml(history.deployer)}</div><div class="meta"><span>launches found <b>${launches.length}</b></span><span>relationship <strong>same recorded deployer</strong></span><span>order <strong>newest first</strong></span></div></div>`;
  if (history.infra) html += `<p class="notice">Shared infrastructure: ${esc(history.infra.name)}. These launches are not evidence of one person.</p>`;
  if (history.partial) html += `<p class="notice">Partial history · ${esc(history.partialReason)}</p>`;
  if (history.hitLimit) html += `<p class="notice">Query limit reached · more launches may exist. This is the returned sample.</p>`;
  for (const launch of launches) {
    const time = launch.block?.Time ? launch.block.Time.replace('T',' ').replace('Z',' UTC') : 'timestamp unavailable';
    html += `<article class="launch"><div class="launch-top"><time>${esc(time)}</time><span class="token-name">${esc(launch.name || 'Token name unavailable')}</span>${launch.symbol ? `<b>$${esc(launch.symbol)}</b>` : ''}<span class="badge">OBSERVED</span></div><div class="details">token <a href="${explorerAddr(launch.token)}" target="_blank" rel="noopener">${esc(launch.token)}</a>${copyBtnHtml(launch.token)}</div><div class="details">block <span class="green">${esc(launch.block?.Number || 'unknown')}</span> · event TokenLaunched · <a href="${explorerTx(launch.txHash)}" target="_blank" rel="noopener">transaction ↗ ${esc(short(launch.txHash))}</a></div></article>`;
  }
  html += `<p class="end"><span class="full-count">${launches.length} launch records displayed</span><span class="capture-count">${Math.min(8, launches.length)} of ${launches.length} returned launches shown · remaining rows hidden for capture</span> · fee-recipient history is not implemented</p>`;
  output.innerHTML = html;
};

document.getElementById('captureBtn').addEventListener('click', () => document.body.classList.toggle('capture'));
document.addEventListener('keydown', event => {
  if (event.key === 'Escape') document.body.classList.remove('capture');
});
if (new URLSearchParams(location.search).get('capture') === '1') document.body.classList.add('capture');
