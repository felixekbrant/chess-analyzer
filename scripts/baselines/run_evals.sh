#!/bin/sh
# Keeps analysing games.json while fetch.py is still adding to it, then one final pass.
cd "$(dirname "$0")"
while :; do
  for i in 0 1 2 3 4 5; do node evalgames.cjs $i 6 > eval_$i.log 2>&1 & done
  wait
  if ! pgrep -f "fetch.py" > /dev/null; then
    for i in 0 1 2 3 4 5; do node evalgames.cjs $i 6 >> eval_$i.log 2>&1 & done
    wait
    break
  fi
done
echo all done
