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
Analyze the attached documents/images thoroughly. Generate exhaustive, high-yield study material.
1. Generate exactly or up to ${count} high-quality MCQs on "${subject}" in ${langName} with detailed explanations.
2. Generate comprehensive, masterclass One-Page Revision Notes ("note") with a rich summary and 6 to 10 detailed bullet points covering all facts, definitions, and concepts.
3. Generate a powerful mnemonic exam trick ("trick").
4. Generate a high-impact conceptual playCard ("playCard").

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
    "title": "Comprehensive One-Page Revision Notes",
    "summary": "Deep executive summary covering core concepts and exam orientation...",
    "mermaidDiagram": "graph TD\\n  A[Core Concept] --> B[Sub-topic]",
    "points": [
      "Key point 1 with full definitions and historical background",
      "Key point 2 with important dates or committees",
      "Key point 3 with classification/cataloguing rules",
      "Key point 4 with procedural details",
      "Key point 5 with exam traps and exceptions",
      "Key point 6 with final summary takeaway"
    ]
  },
  "trick": {
    "title": "Exam Mnemonic",
    "formula": "Short code or formula",
    "desc": "Easy description to remember"
  },
  "playCard": {
    "topic": "Core Topic",
    "front": "High-yield concept question",
    "back": "Precise answer and core rule"
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
