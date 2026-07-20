#!/usr/bin/env bash
# One-command setup for the ATS submit-candidate mimic.
# Installs dependencies, generates the Prisma client, creates the SQLite schema,
# and seeds deterministic data. After this, run `npm start`.
set -euo pipefail

cd "$(dirname "$0")"

echo "==> Installing dependencies (also generates the Prisma client)..."
npm install

echo "==> Creating SQLite schema + seeding deterministic data..."
npm run db:reset

echo ""
echo "Setup complete."
echo "  Start the app:  npm start        (API on http://localhost:3000, form at /)"
echo "  Re-seed anytime: npm run db:reset  (shell)  or  POST /test/reset  (during tests)"
