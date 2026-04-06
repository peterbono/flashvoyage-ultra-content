#!/bin/bash
# FlashVoyage — Local daily linkbuilding (Quora + VF)
# Runs via macOS launchd, controls real Chrome via AppleScript.
# Requirements: Chrome open on profile "Florian", logged into Quora + VF.

source "$HOME/.nvm/nvm.sh"
nvm use 20 > /dev/null 2>&1

# Load API key from .env files
if [ -z "$ANTHROPIC_API_KEY" ]; then
  for envfile in "$HOME/flashvoyage-content/.env" "$HOME/clodoproject/.env" "$HOME/.env"; do
    if [ -f "$envfile" ]; then
      val=$(grep '^ANTHROPIC_API_KEY=' "$envfile" | head -1 | cut -d= -f2)
      if [ -n "$val" ]; then export ANTHROPIC_API_KEY="$val"; break; fi
    fi
  done
fi

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

# Run Routard (with retry)
echo "$(date): Running Routard..." >> "$LOG"
node scripts/linkbuilding/routard-local.js >> "$LOG" 2>&1
ROUTARD_EXIT=$?
if [ $ROUTARD_EXIT -ne 0 ]; then
  echo "$(date): Routard failed (exit $ROUTARD_EXIT), retrying in 30s..." >> "$LOG"
  sleep 30
  node scripts/linkbuilding/routard-local.js >> "$LOG" 2>&1
  ROUTARD_EXIT=$?
fi
echo "$(date): Routard done (exit $ROUTARD_EXIT)" >> "$LOG"

# Wait between posts
sleep 60

# Run IG Engagement (comment on FR voyage accounts to break cold start)
echo "$(date): Running IG Engagement..." >> "$LOG"
node scripts/linkbuilding/ig-engagement-local.js >> "$LOG" 2>&1
IG_EXIT=$?
echo "$(date): IG Engagement done (exit $IG_EXIT)" >> "$LOG"

# Push state changes
cd "$REPO_DIR"
git add data/linkbuilding-week-plan.json data/linkbuilding-log.jsonl data/engagement-log.jsonl 2>/dev/null
git diff --staged --quiet || git commit -m "chore: local linkbuilding $(date +%Y-%m-%d)" && git push 2>/dev/null

# Summary notification
SUMMARY="Quora: $([ $QUORA_EXIT -eq 0 ] && echo 'OK' || echo 'FAIL') | VF: $([ $VF_EXIT -eq 0 ] && echo 'OK' || echo 'FAIL') | Routard: $([ $ROUTARD_EXIT -eq 0 ] && echo 'OK' || echo 'FAIL') | IG: $([ $IG_EXIT -eq 0 ] && echo 'OK' || echo 'FAIL')"
echo "$(date): $SUMMARY" >> "$LOG"
osascript -e "display notification \"$SUMMARY\" with title \"FlashVoyage Linkbuilding\"" 2>/dev/null

echo "$(date): === Done ===" >> "$LOG"
