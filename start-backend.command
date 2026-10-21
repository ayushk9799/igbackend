#!/bin/bash -l
cd "/Volumes/SSD500/Ayush/igbackend" || exit 1
LOG="/Volumes/SSD500/Ayush/igbackend/start-backend.log"
CHK="/Volumes/SSD500/Ayush/igbackend/start-backend.check"
lsof -ti tcp:3001 | xargs kill 2>/dev/null
{ echo "== $(date) =="; ifconfig | grep "inet " | grep -v 127.0.0.1; } > "$LOG"
PORT=3001 nohup npm run dev >> "$LOG" 2>&1 &
disown
sleep 8
{
  echo "== $(date) =="
  echo "listening:"; lsof -nP -iTCP:3001 -sTCP:LISTEN
  echo "curl:"; curl -s -m 5 -o /dev/null -w "%{http_code}\n" http://172.20.10.6:3001/api/app-config
} > "$CHK" 2>&1
cat "$CHK"
echo "Backend runs in the background now; this window can be closed."
