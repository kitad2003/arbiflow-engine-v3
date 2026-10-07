4.78.2 Pool discovery corrective stage.
Base USDC input lowercased to avoid ethers mixed-case checksum failure.
Per-chain RPC requests serialized, 180ms pacing, bounded 429/503 retries.
Base PancakeSwap V3 factory reused from existing Base PancakeSwap adapter; fee tiers 500 and 2500.
Sushi and non-Base Pancake remain environment-configured only.
No independent executable quote, financing or atomic simulation is claimed.
All mainnet execution remains disabled.
