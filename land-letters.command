#!/bin/bash -l
# Double-click: makes every in-flight letter for the test account land now (see scripts/landLettersNow.js).
cd "/Volumes/SSD500/Ayush/igbackend" || exit 1
LOG="/Volumes/SSD500/Ayush/igbackend/land-letters.log"
{ echo "== $(date) =="; node scripts/landLettersNow.js ayushkumarsanu00@gmail.com "$@"; echo "exit $?"; } 2>&1 | tee "$LOG"
echo "listening on 3001:"; lsof -nP -iTCP:3001 -sTCP:LISTEN | tee -a "$LOG"
