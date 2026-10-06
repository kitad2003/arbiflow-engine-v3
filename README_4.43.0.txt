ArbiFlow Engine 4.43.0

Purpose
- Preserve 4.42 exhaustive Morpho discovery: 1,000 per page, no configured total-position cap.
- Add an independent exhaustive hot-watch fast lane for HF <= 1.01.
- Hot-watch pagination is also uncapped and continues until exhaustion.
- Any hot-watch API signal below HF 1.0 is still sent through exact fresh fork accrual + production safety/economics gate.
- Full-universe candidate-safety route remains unchanged and available.
- Live execution remains disabled; no signing or mainnet broadcast endpoint is added.

Routes
- Full universe: /api/production/base/candidate-safety-pipeline
- Fast lane: /api/production/base/hot-watch-safety-pipeline

Validation
- npm run check
- Deploy and confirm startup PASS with 4.43.0 labels.
- Run fast-lane route and compare elapsedMs with the full-universe route.
