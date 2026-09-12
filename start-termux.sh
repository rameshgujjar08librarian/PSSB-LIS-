#!/data/data/com.termux/files/usr/bin/bash
set -e
if [ ! -d node_modules ]; then npm install; fi
node server.js
