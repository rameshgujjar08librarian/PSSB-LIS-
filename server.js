const express = require("express");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const pdfParse = require("pdf-parse");
const mammoth = require("mammoth");

const app = express();
const uploadDir = path.join(__dirname, "uploads");
const dataDir = path.join(__dirname, "data");
const bankFile = path.join(dataDir, "question_bank.json");

if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
if (!fs.existsSync(bankFile)) fs.writeFileSync(bankFile, JSON.stringify({}), "utf8");

const upload = multer({ dest: uploadDir });
const PORT = process.env.PORT || 3000;
const GEMINI_API_KEY = (process.env.GEMINI_API_KEY || "").trim();

app.use(express.json({ limit: "30mb" }));
app.use(express.static(path.join(__dirname, "public")));

function getBank() {
  try {
    if (fs.existsSync(bankFile)) return JSON.parse(fs.readFileSync(bankFile, "utf8"));
  } catch (e) {
    console.error("Error reading bank:", e);
  }
  return {};
}

function saveBank(data) {
  fs.writeFileSync(bankFile, JSON.stringify(data, null, 2), "utf8");
}

async function extract(file) {
  const ext = path.extname(file.originalname).toLowerCase();
  const buf = fs.readFileSync(file.path);
  if (ext === ".pdf") {
    const p = await pdfParse(buf);
    return { type: "text", name: file.originalname, content: p.text || "" };
  }
  if (ext === ".docx") {
    const res = await mammoth.extractRawText({ buffer: buf });
    return { type: "text", name: file.originalname, content: res.value || "" };
  }
  if ([".html", ".htm", ".txt"].includes(ext)) {
    return { type: "text", name: file.originalname, content: buf.toString("utf8") };
  }
  if ([".jpg", ".jpeg", ".png", ".webp", ".jfif"].includes(ext)) {
    const mime = ext === ".png" ? "image/png" : ext === ".webp" ? "image/webp" : "image/jpeg";
    return {
      type: "image",
      name: file.originalname,
      inlineData: { mimeType: mime, data: buf.toString("base64") }
    };
  }
  return { type: "text", name: file.originalname, content: "" };
}

function cleanup(files) {
  for (const f of (files || [])) {
    try { fs.unlinkSync(f.path); } catch (e) {}
  }
}

function normalize(s) {
  return String(s || "").toLowerCase().replace(/\s+/g, " ").trim();
}

function dedupe(qs) {
  const seen = new Set(), out = [];
  for (const q of qs || []) {
    const key = normalize(q.question);
    if (!key || seen.has(key) || !Array.isArray(q.options) || q.options.length < 4) continue;
    if (!Number.isInteger(q.answer) || q.answer < 0 || q.answer > 3) continue;
    seen.add(key);
    out.push(q);
  }
  return out;
}

function chunkText(text, size = 4200, overlap = 300) {
  const clean = text.replace(/\r/g, "").trim();
  if (clean.length <= size) return [clean];
  const chunks = [];
  let start = 0;
  while (start < clean.length) {
    let end = Math.min(start + size, clean.length);
    if (end < clean.length) {
      const lastNl = clean.lastIndexOf("\n", end);
      if (lastNl > start + 2000) end = lastNl;
      else {
        const lastDot = clean.lastIndexOf(". ", end);
        if (lastDot > start + 2000) end = lastDot + 1;
      }
    }
    chunks.push(clean.slice(start, end).trim());
    start = end - overlap;
    if (start >= clean.length - overlap) break;
  }
  return chunks;
}

async function callGemini(parts) {
  const models = ["gemini-3.6-flash", "gemini-2.0-flash", "gemini-flash-latest"];
  let lastErr = "";

  for (const model of models) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
    try {
      const apiRes = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-goog-api-key": GEMINI_API_KEY
        },
        body: JSON.stringify({
          contents: [{ parts }],
          generationConfig: { responseMimeType: "application/json" }
        })
      });

      if (apiRes.ok) {
        const resData = await apiRes.json();
        const rawText = resData.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!rawText) continue;
        try {
          return JSON.parse(rawText);
        } catch (pe) {
          const match = rawText.match(/\{[\s\S]*\}/);
          if (match) return JSON.parse(match[0]);
        }
      } else {
        lastErr = await apiRes.text();
      }
    } catch (e) {
      lastErr = e.message;
    }
  }
  console.error("Gemini API call failed:", lastErr);
  return { questions: [] };
}

// Summary API
app.get("/api/bank/summary", (req, res) => {
  const bank = getBank();
  const subjects = Object.keys(bank).map(sub => ({
    name: sub,
    count: bank[sub].length
  }));
  const total = subjects.reduce((acc, s) => acc + s.count, 0);
  res.json({ subjects, total });
});

// CBT Questions API
app.post("/api/bank/cbt-questions", (req, res) => {
  const { selectedSubjects, count } = req.body;
  const bank = getBank();
  let pool = [];

  const subs = Array.isArray(selectedSubjects) && selectedSubjects.length ? selectedSubjects : Object.keys(bank);
  for (const s of subs) {
    if (bank[s]) pool.push(...bank[s].map(q => ({ ...q, subject: s })));
  }

  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }

  const requested = count === "all" || !count ? pool.length : Math.min(parseInt(count, 10) || pool.length, pool.length);
  res.json({ questions: pool.slice(0, requested), totalAvailable: pool.length });
});

// Delete Subject API
app.post("/api/bank/delete-subject", (req, res) => {
  const { subject } = req.body;
  const bank = getBank();
  if (bank[subject]) {
    delete bank[subject];
    saveBank(bank);
  }
  res.json({ success: true });
});

// Multi-file + Flexible Target Generation API
app.post("/api/generate", upload.fields([
  { name: "study", maxCount: 30 },
  { name: "sample", maxCount: 10 }
]), async (req, res) => {
  const files = Object.values(req.files || {}).flat();
  try {
    if (!GEMINI_API_KEY) {
      return res.status(500).json({ error: "GEMINI_API_KEY is not configured in .env" });
    }
    const studyFiles = req.files?.study || [];
    if (!studyFiles.length) {
      return res.status(400).json({ error: "कृपया कम से कम एक Study Material PDF या फ़ोटो अपलोड करें।" });
    }

    const lang = req.body.language || "Hindi Devanagari";
    const subject = (req.body.subject || "General").trim();
    const targetCountRaw = req.body.targetCount || "max";
    const isMax = targetCountRaw === "max";
    const maxTarget = isMax ? Infinity : (parseInt(targetCountRaw, 10) || 50);

    const bank = getBank();
    if (!bank[subject]) bank[subject] = [];
    const seenKeys = new Set(bank[subject].map(q => normalize(q.question)));
    const newQuestions = [];

    console.log(`[Batch Start] Files: ${studyFiles.length} | Subject: "${subject}" | Target: ${isMax ? "Maximum (Exhaustive)" : maxTarget}`);

    for (let fIdx = 0; fIdx < studyFiles.length; fIdx++) {
      if (newQuestions.length >= maxTarget) break;

      const file = studyFiles[fIdx];
      const extracted = await extract(file);
      console.log(`[Processing File ${fIdx + 1}/${studyFiles.length}]: ${file.originalname} (${extracted.type})`);

      if (extracted.type === "image") {
        const remainingNeeded = isMax ? 35 : Math.min(35, maxTarget - newQuestions.length);
        const imgPrompt = `You are an expert UGC-NET examination paper setter for subject: "${subject}".
Examine this image carefully: "${file.originalname}". Read every handwritten/printed line, table, date, author, formula, and concept.
Language: ${lang}.
GENERATE ${isMax ? "MAXIMUM POSSIBLE QUESTIONS (target up to 35)" : `EXACTLY UP TO ${remainingNeeded} QUESTIONS`} covering facts in this image.
Styles: Direct factual, match the following, assertion-reason, negative questions ("Which is NOT...").
Every question must have 4 options and 1 correct answer (index 0-3).
Return ONLY valid JSON: {"questions":[{"question":"...","options":["...","...","...","..."],"answer":0,"detailed_explanation":"..."}]}`;

        const resJson = await callGemini([{ text: imgPrompt }, { inlineData: extracted.inlineData }]);
        const list = dedupe(resJson.questions || []);
        for (const q of list) {
          if (newQuestions.length >= maxTarget) break;
          const k = normalize(q.question);
          if (!seenKeys.has(k)) {
            seenKeys.add(k);
            newQuestions.push({ ...q, subject, sourceFile: file.originalname, addedAt: new Date().toISOString() });
          }
        }
      } 
      else if (extracted.type === "text" && extracted.content.trim().length > 0) {
        const chunks = chunkText(extracted.content, 4200, 300);

        for (let c = 0; c < chunks.length; c++) {
          if (newQuestions.length >= maxTarget) break;

          const remainingNeeded = isMax ? 35 : Math.min(35, maxTarget - newQuestions.length);
          const prompt = `You are an expert UGC-NET/JRF paper setter for subject: "${subject}".
MATERIAL SOURCE: "${file.originalname}" (Section ${c + 1}/${chunks.length}).
Language: ${lang}.
GENERATE ${isMax ? "MAXIMUM POSSIBLE QUESTIONS (target up to 35)" : `EXACTLY UP TO ${remainingNeeded} HIGH-QUALITY QUESTIONS`} from this section. Cover all dates, laws, names, definitions, and facts.
Styles: Direct factual, statement analysis, chronological order, match the following.
4 options, exactly 1 correct answer (index 0-3).
Return ONLY valid JSON: {"questions":[{"question":"...","options":["...","...","...","..."],"answer":0,"detailed_explanation":"..."}]}`;

          const resJson = await callGemini([{ text: prompt }]);
          const list = dedupe(resJson.questions || []);
          for (const q of list) {
            if (newQuestions.length >= maxTarget) break;
            const k = normalize(q.question);
            if (!seenKeys.has(k)) {
              seenKeys.add(k);
              newQuestions.push({ ...q, subject, sourceFile: file.originalname, addedAt: new Date().toISOString() });
            }
          }
        }
      }
    }

    const finalQuestions = isMax ? newQuestions : newQuestions.slice(0, maxTarget);
    bank[subject].push(...finalQuestions);
    saveBank(bank);

    console.log(`[Success] Added ${finalQuestions.length} questions to "${subject}". Total in bank: ${bank[subject].length}`);

    res.json({
      success: true,
      added: finalQuestions.length,
      filesProcessed: studyFiles.length,
      totalInSubject: bank[subject].length,
      subject,
      targetRequested: targetCountRaw,
      questions: finalQuestions
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message || "Generation failed" });
  } finally {
    cleanup(files);
  }
});

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => console.log(`AI Study CBT with Dual Timer Selection running on port ${PORT}`));
