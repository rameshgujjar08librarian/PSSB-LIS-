const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 10000;

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const upload = multer({ storage: multer.memoryStorage() });
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

let questionBank = [];

function fileToGenerativePart(file) {
  return {
    inlineData: {
      data: file.buffer.toString('base64'),
      mimeType: file.mimetype
    }
  };
}

app.post('/api/generate-all', upload.array('files'), async (req, res) => {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ success: false, message: 'API Key missing on server!' });
    }

    const { subject, limit, lang } = req.body;
    const model = genAI.getGenerativeModel({ model: 'gemini-3.6-flash' });

    let langName = 'Hindi Devanagari';
    if (lang === 'en') langName = 'English';
    else if (lang === 'pa') langName = 'Punjabi (Gurmukhi)';
    else if (lang === 'bn') langName = 'Bengali';

    let count = 20;
    if (limit !== 'max') count = parseInt(limit) || 20;

    const prompt = `You are an expert Library Science exam mentor for LIS GURUJI Portal (RAMESH GUJJAR).
Analyze the attached documents/images thoroughly and generate ultra-creative, colorful hand-written style classroom notes and visual mind-maps.
1. Generate exactly or up to ${count} high-quality MCQs on "${subject}" in ${langName} with detailed explanations.
2. Generate creative, colorful Hand-Written style Revision Notes ("note") styled like colored-pen classroom notes with visual emojis (🔴 Red marker, 🔵 Blue pen, 🟢 Green highlighter, 🟡 Yellow sticky-note) and 8-10 detailed revision points.
3. Generate a dedicated "microNotes" section that is 100% visual flowchart / mind-map format using structured layout, color-coded nodes, and hand-written style quick-revision capsules.
4. Generate a powerful mnemonic exam trick ("trick") and a high-impact conceptual playCard ("playCard").

Return ONLY a valid raw JSON object without markdown or backticks:
{
  "questions": [
    {
      "question": "MCQ Question",
      "options": ["A", "B", "C", "D"],
      "correctAnswer": 0,
      "explanation": "Detailed explanation"
    }
  ],
  "note": {
    "title": "🎨 Hand-Written Master Revision Notes",
    "summary": "✍️ [CLASSROOM SUMMARY] Vivid summary styled like colored-pen notes...",
    "mermaidDiagram": "graph TD\\n  A[🎨 Core Topic] --> B[💡 Key Rule]\\n  B --> C[⚡ Exam Fact]",
    "points": [
      "🔴 [CRITICAL FACT]: Detailed point with red marker highlight...",
      "🔵 [CORE CONCEPT]: Detailed point with blue pen structure...",
      "🟢 [EXAM TRAP]: Detailed point with green highlighter...",
      "🟡 [QUICK TRICK]: Detailed point with yellow sticky note vibe..."
    ]
  },
  "microNotes": {
    "title": "🧠 100% Visual Flowchart & Micro Notes",
    "diagramStyleText": "🚀 [MIND MAP FLOW]\n🔴 [CORE TOPIC] ──> 🔵 [SUB-TOPIC 1] ──> 🟢 [KEY FACT]\n       │\n       └──> 🟡 [EXAM TRAP WARNING]",
    "capsules": [
      "📌 Capsule 1 (Quick Formula / Date / Author)",
      "📌 Capsule 2 (Core Law / Principle Breakdown)",
      "📌 Capsule 3 (Fast-track keyword comparison)"
    ]
  },
  "trick": {
    "title": "Exam Mnemonic",
    "formula": "Short code or formula",
    "desc": "Description"
  },
  "playCard": {
    "topic": "Core Topic",
    "front": "Concept question",
    "back": "Precise answer"
  }
}`;

    const fileParts = (req.files || []).map(fileToGenerativePart);
    const result = await model.generateContent([prompt, ...fileParts]);
    let text = result.response.text().trim();

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      text = jsonMatch[0];
    } else {
      text = text.replace(/```json/gi, '').replace(/```/g, '').trim();
    }

    const data = JSON.parse(text);
    if (data.questions && Array.isArray(data.questions)) {
      data.questions.forEach(q => { q.subject = subject; questionBank.unshift(q); });
    }

    res.json({ success: true, data, questionsCount: data.questions?.length || 0 });
  } catch (err) {
    console.error('Generation error:', err);
    res.status(500).json({ success: false, message: err.message || 'AI Generation Failed' });
  }
});

app.get('/api/questions', (req, res) => {
  res.json(questionBank);
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
