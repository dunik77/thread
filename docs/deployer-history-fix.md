# Deployer history display fix

The token lookup now follows a deployer discovered through direct RPC and requests that deployer's other Pons v2 launches automatically. An empty indexed history also triggers the RPC fallback. If the follow-up fails, the confirmed input launch remains visible with a partial-history notice.

Launch rows render before name/symbol enrichment finishes and update incrementally. Missing block timestamps display the block number; timestamp-fetch failures no longer discard confirmed launch logs. Network requests have timeouts. Token names and symbols are escaped before display, and rows link to an in-app lookup.

Validation: 55 offline tests passed, including the actual page script's rendering and delayed metadata behavior. A live CLI lookup for `0xa146cc739a09d0543e7e5b525f8eca26bb518032` resolved deployer `0xdf2237114d595e0bf4d35cbcdebcdf43c55c4669` and returned 31 distinct launches (30 indexed results plus the confirmed input launch). The limit warning remained visible; this is not a claim of complete lifetime coverage.

Scope remains the configured Pons v2 factory. Restart an already running Node server to load the backend changes, then refresh the page.
