ArbiFlow 4.37.2 — Constructor Alignment Fix
Corrects the unsigned production deployment plan to match ArbiFlowAtomicExecutor430 exactly.
Constructor arguments: Aave Base Pool, Morpho Blue.
OWNER is not a constructor argument; Solidity sets OWNER = msg.sender.
The intended Coinbase Wallet remains the from address for read-only gas estimation and must be the wallet that signs the eventual deployment for OWNER to match.
No private key is requested or stored. No signature, submission, broadcast, deployment, or fund movement occurs.
