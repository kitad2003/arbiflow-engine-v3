ArbiFlow 4.58.6 — Pool Discovery Contract Binding Repair
4.58.5 reached all six chains but all 176 pool reads failed before checking any pool.
Root cause confirmed in the scanner: it used ethers.Contract even though server.js imports Contract directly from ethers and has no ethers namespace binding.
4.58.6 changes those scanner constructions to the existing Contract import.
Preserves bounded concurrency, caching, progress counters, nonblocking startup, fork verification, and read-only/no-mainnet-action gates.
