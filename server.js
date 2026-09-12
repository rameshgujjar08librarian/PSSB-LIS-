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
    const { subject, limit, lang } = req.body;
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

    let langName = 'Hindi Devanagari';
    if (lang === 'en') langName = 'English';
    else if (lang === 'pa') langName = 'Punjabi (Gurmukhi)';
    else if (lang === 'bn') langName = 'Bengali';

    let count = 20;
    if (limit !== 'max') count = parseInt(limit) || 20;

    const prompt = `You are an expert Library Science exam mentor for LIS GURUJI Portal (RAMESH GUJJAR).
Analyze the attached documents/images thoroughly. Generate exactly or up to ${count} high-quality MCQs on "${subject}" in ${langName}, along with short notes, trick, and play card.

Return ONLY a valid raw JSON object. Do not wrap in markdown or backticks:
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
    "title": "Topic Heading",
    "summary": "Quick summary",
    "mermaidDiagram": "graph TD\\n  A[Core] --> B[Sub]",
    "points": ["Key point 1", "Key point 2", "Key point 3"]
  },
  "trick": {
    "title": "Trick Title",
    "formula": "Mnemonic / Code",
    "desc": "Description"
  },
  "playCard": {
    "topic": "Topic Name",
    "front": "Concept question",
    "back": "Accurate answer"
  }
}`;

    const fileParts = (req.files || []).map(fileToGenerativePart);
    const result = await model.generateContent([prompt, ...fileParts]);
    let text = result.response.text().trim();

    // Robust JSON extraction in case AI adds extra text
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
    res.status(500).json({ success: false, message: err.message });
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
