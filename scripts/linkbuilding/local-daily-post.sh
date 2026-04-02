#!/bin/bash
# FlashVoyage — Local daily linkbuilding poster (Quora + Voyage Forum)
# Runs via macOS launchd cron, uses real Chrome cookies to bypass Cloudflare

source "$HOME/.nvm/nvm.sh"
nvm use 20 > /dev/null 2>&1

# Ensure Chrome is running
if ! pgrep -f "Google Chrome" > /dev/null 2>&1; then
  echo "$(date): Chrome not running, opening..." >> "$LOG"
  open -a "Google Chrome"
  sleep 5
fi
# Load API key from zshrc (already set there)
export ANTHROPIC_API_KEY="${ANTHROPIC_API_KEY:-$(grep ANTHROPIC_API_KEY ~/.zshrc 2>/dev/null | head -1 | cut -d= -f2)}"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
LOG="$REPO_DIR/data/linkbuilding-local.log"

echo "$(date): Starting local linkbuilding run" >> "$LOG"

cd "$REPO_DIR" || exit 1

# Run Quora (dynamic AI-generated answers, multiple per day)
echo "$(date): Running Quora dynamic..." >> "$LOG"
node scripts/linkbuilding/quora-dynamic.js >> "$LOG" 2>&1
echo "$(date): Quora done (exit $?)" >> "$LOG"

# Run Voyage Forum
echo "$(date): Running VF..." >> "$LOG"
node scripts/linkbuilding/vf-local.js >> "$LOG" 2>&1
echo "$(date): VF done (exit $?)" >> "$LOG"

# Push state changes
cd "$REPO_DIR"
git add data/linkbuilding-week-plan.json data/linkbuilding-log.jsonl 2>/dev/null
git diff --staged --quiet || git commit -m "chore: local linkbuilding $(date +%Y-%m-%d)" && git push 2>/dev/null

echo "$(date): Done" >> "$LOG"
