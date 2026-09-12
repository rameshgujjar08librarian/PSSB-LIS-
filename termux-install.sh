#!/data/data/com.termux/files/usr/bin/bash
set -e
pkg update -y
pkg install nodejs -y
npm install
if [ ! -f .env ]; then cp .env.example .env; fi
echo
echo "=========================================="
echo " AI Study CBT - Termux setup complete"
echo " Edit .env and put your OPENAI_API_KEY"
echo " Then run: npm start"
echo " Open: http://127.0.0.1:3000"
echo "=========================================="
