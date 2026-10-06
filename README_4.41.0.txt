ArbiFlow Engine 4.41.0 - Full Paginated Morpho Discovery

Built from validated 4.40.0.

Discovery changes only:
- Morpho Base marketPositions discovery is health-factor-first, not largest-borrower-first.
- 1000 positions per page by default.
- Continues pagination until the final partial page; default safety backstop 25 pages (25,000 rows), configurable up to 100 pages.
- Deduplicates marketId + borrower.
- Covers listed Base markets server-side rather than preselecting only the top 50 markets.
- Default discovery health-factor ceiling: 1.10, configurable with ARBIFLOW_MORPHO_DISCOVERY_HF_LTE.
- Coverage diagnostics include pages, raw rows, unique positions, markets represented, and HF buckets.
- Existing production candidate safety route remains /api/production/base/candidate-safety-pipeline.
- API discovery remains non-authoritative; exact fresh fork accrual + production safety gate remains required.
- Live execution remains disabled. No mainnet signing or broadcast endpoint is added.

Optional env vars (defaults are safe; no change required):
ARBIFLOW_MORPHO_DISCOVERY_PAGE_SIZE=1000
ARBIFLOW_MORPHO_DISCOVERY_MAX_PAGES=25
ARBIFLOW_MORPHO_DISCOVERY_HF_LTE=1.10
