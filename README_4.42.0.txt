ArbiFlow Engine 4.42.0

Purpose
- Exhaustive Morpho Base risk discovery with 1,000 records per page.
- No configured total-position or page cap. Pagination continues until the API returns fewer than 1,000 rows.
- Duplicate-page and zero-forward-progress guards fail closed instead of silently truncating coverage.
- Preserves full-universe discovery and exposes a <=1.01 hot-watch count for latency work.
- Exact fork accrual + production safety/economics gate remains mandatory.
- Live execution remains disabled. No signing or mainnet broadcast endpoint is added.

Validation
- Run npm run check.
- Deploy to Render and confirm startup PASS.
- Then run /api/production/base/candidate-safety-pipeline and confirm totalPositionCap:null and paginationExhausted:true.
