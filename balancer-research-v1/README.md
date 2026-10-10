# Balancer-first clean research build

This folder is separate from every previous ArbiFlow strategy and imports no old project code.

Only design references:
1. https://docs.flashbots.net/flashbots-mev-share/searchers/tutorials/flash-loan-arbitrage/flash-loan-basics
2. https://docs.flashbots.net/flashbots-mev-share/searchers/tutorials/flash-loan-arbitrage/bot
3. https://web3.gate.com/crypto-wiki/article/mastering-flash-loans-a-comprehensive-guide-for-defi-enthusiasts-20251210
4. https://medium.com/@nachograyeb_98844/the-engineers-path-to-blockchain-building-and-testing-flash-loan-arbitrage-smart-contracts-ddd487ba55cf

## Implemented
- Pure off-chain event filter for Uniswap-V2-style swap topic, using exposed log hints
- Separate, manually verified pair-index for alternate venue lookup
- Balancer V2-style Vault flashLoan/receiveFlashLoan callback contract (no live integration)
- Mock/unit tests for rejecting unknown swaps, same venue, missing alternatives
- Documentation of what remains unverified

## Not implemented or claimed
- Live event-stream integration, pairing with any particular chain, Balancer Vault availability,
  borrowed liquidity, fee schedule, deployed contracts, swap routes, real profit,
  transaction inclusion, bundle submission, and on-chain trading.
- In particular Flashbots' MEV-Share bot tutorial documents **Ethereum** endpoints.
  It DOES NOT establish Base bundle capabilities.
- The callback currently repays only, intentionally with NO trading. A nonzero fee
  requires externally available funds and is not a profitable-arbitrage test.

## Test
node balancer-research-v1/test.js

Only research-based evidence will authorize additions to this folder.
