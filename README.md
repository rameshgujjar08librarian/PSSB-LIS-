# AI Study CBT — Android / Termux Edition

This edition is made for running directly on an Android phone with Termux.

## 1) Install Termux
Install Termux from the official F-Droid/GitHub distribution (not a random APK site).

## 2) Put this folder in Termux
After extracting the ZIP, open Termux and `cd` into this project folder.

Example:
`cd ~/AI_Study_CBT_MOBILE`

## 3) One-time setup
Run:
`bash termux-install.sh`

## 4) Add your OpenAI API key
Open `.env` and set:
`OPENAI_API_KEY=YOUR_KEY_HERE`

You can edit it with:
`nano .env`
Save with Ctrl+O, Enter; exit with Ctrl+X.

## 5) Start the app
`bash start-termux.sh`

Then open Chrome and visit:
`http://127.0.0.1:3000`

IMPORTANT: Do NOT open `public/index.html` directly. That causes browser `Failed to fetch` because the backend is not running.

## Question generation
- 25/50/100/150/200/300/400/500 choices.
- Maximum useful = up to 500, generated in batches of 50.
- Multiple study files can be uploaded.
- No 3-question demo fallback.
- Server removes duplicate questions.
- CBT uses the full generated bank.

## Supported study files
PDF, DOCX, TXT, HTML, JPG, JPEG, PNG, WEBP.
