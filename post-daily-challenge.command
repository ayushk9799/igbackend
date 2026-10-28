#!/bin/bash -l
cd "/Volumes/SSD500/Ayush/igbackend" || exit 1
LOG="/Volumes/SSD500/Ayush/igbackend/post-daily-challenge.log"
{
  echo "== $(date) =="
  echo "== post =="; node scripts/seedDailyChallengeToday.js 2026-10-24
  echo "== verify =="; node scripts/verifyDailyChallenge.js 2026-10-24
  echo "== END =="
} 2>&1 | tee "$LOG"
