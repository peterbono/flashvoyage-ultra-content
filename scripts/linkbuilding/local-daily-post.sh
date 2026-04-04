#!/bin/bash
# FlashVoyage — Local daily linkbuilding (Quora + VF)
# Runs via macOS launchd, controls real Chrome via AppleScript.
# Requirements: Chrome open on profile "Florian", logged into Quora + VF.

source "$HOME/.nvm/nvm.sh"
nvm use 20 > /dev/null 2>&1

# Load API key from zshrc (already set there)
export ANTHROPIC_API_KEY="${ANTHROPIC_API_KEY:-$(grep ANTHROPIC_API_KEY ~/.zshrc 2>/dev/null | head -1 | cut -d= -f2)}"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
LOG="$REPO_DIR/data/linkbuilding-local.log"

echo "$(date): === Starting daily linkbuilding ===" >> "$LOG"

# Ensure Chrome is running with a window
CHROME_WINDOWS=$(osascript -e 'tell application "Google Chrome" to count of windows' 2>/dev/null || echo "0")
if [ "$CHROME_WINDOWS" = "0" ] || [ "$CHROME_WINDOWS" = "" ]; then
  echo "$(date): Chrome not open. Starting Chrome..." >> "$LOG"
  open -a "Google Chrome"
  # Wait for Chrome to fully launch
  for i in $(seq 1 30); do
    sleep 2
    CHROME_WINDOWS=$(osascript -e 'tell application "Google Chrome" to count of windows' 2>/dev/null || echo "0")
    if [ "$CHROME_WINDOWS" != "0" ] && [ "$CHROME_WINDOWS" != "" ]; then
      echo "$(date): Chrome started ($CHROME_WINDOWS windows)" >> "$LOG"
      break
    fi
    if [ $i -eq 30 ]; then
      echo "$(date): ERROR — Chrome failed to start after 60s. Skipping." >> "$LOG"
      osascript -e 'display notification "Chrome ne démarre pas — linkbuilding skippé" with title "FlashVoyage" sound name "Basso"' 2>/dev/null
      exit 1
    fi
  done
  # Extra wait for Chrome to load saved tabs and login sessions
  sleep 15
  echo "$(date): Chrome ready after startup wait" >> "$LOG"
fi
echo "$(date): Chrome OK ($CHROME_WINDOWS windows)" >> "$LOG"

cd "$REPO_DIR" || exit 1

# Pull latest code
git pull --quiet 2>/dev/null || true

# Run Quora (with retry)
echo "$(date): Running Quora..." >> "$LOG"
node scripts/linkbuilding/quora-local.js >> "$LOG" 2>&1
QUORA_EXIT=$?
if [ $QUORA_EXIT -ne 0 ]; then
  echo "$(date): Quora failed (exit $QUORA_EXIT), retrying in 30s..." >> "$LOG"
  sleep 30
  node scripts/linkbuilding/quora-local.js >> "$LOG" 2>&1
  QUORA_EXIT=$?
fi
echo "$(date): Quora done (exit $QUORA_EXIT)" >> "$LOG"

# Wait between posts (look more human)
sleep 60

# Run VF (with retry)
echo "$(date): Running VF..." >> "$LOG"
node scripts/linkbuilding/vf-local.js >> "$LOG" 2>&1
VF_EXIT=$?
if [ $VF_EXIT -ne 0 ]; then
  echo "$(date): VF failed (exit $VF_EXIT), retrying in 30s..." >> "$LOG"
  sleep 30
  node scripts/linkbuilding/vf-local.js >> "$LOG" 2>&1
  VF_EXIT=$?
fi
echo "$(date): VF done (exit $VF_EXIT)" >> "$LOG"

# Wait between posts
sleep 60

# Run Reddit (with retry)
echo "$(date): Running Reddit..." >> "$LOG"
node scripts/linkbuilding/reddit-local.js >> "$LOG" 2>&1
REDDIT_EXIT=$?
if [ $REDDIT_EXIT -ne 0 ]; then
  echo "$(date): Reddit failed (exit $REDDIT_EXIT), retrying in 30s..." >> "$LOG"
  sleep 30
  node scripts/linkbuilding/reddit-local.js >> "$LOG" 2>&1
  REDDIT_EXIT=$?
fi
echo "$(date): Reddit done (exit $REDDIT_EXIT)" >> "$LOG"

# Push state changes
cd "$REPO_DIR"
git add data/linkbuilding-week-plan.json data/linkbuilding-log.jsonl 2>/dev/null
git diff --staged --quiet || git commit -m "chore: local linkbuilding $(date +%Y-%m-%d)" && git push 2>/dev/null

# Summary notification
SUMMARY="Quora: $([ $QUORA_EXIT -eq 0 ] && echo 'OK' || echo 'FAIL') | VF: $([ $VF_EXIT -eq 0 ] && echo 'OK' || echo 'FAIL') | Reddit: $([ $REDDIT_EXIT -eq 0 ] && echo 'OK' || echo 'FAIL')"
echo "$(date): $SUMMARY" >> "$LOG"
osascript -e "display notification \"$SUMMARY\" with title \"FlashVoyage Linkbuilding\"" 2>/dev/null

echo "$(date): === Done ===" >> "$LOG"
