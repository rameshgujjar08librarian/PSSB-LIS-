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
    const { subject, lang } = req.body;
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

    const prompt = `You are an expert Library Science exam mentor for RAMESH GUJJAR LIS Portal.
Analyze the attached document/image thoroughly. From this single material, generate a complete 4-in-1 study package on "${subject}" in ${lang === 'en' ? 'English' : 'Hindi Devanagari'}.

Return ONLY a valid raw JSON object without markdown fences or backticks:
{
  "questions": [
    {
      "question": "MCQ Question",
      "options": ["A", "B", "C", "D"],
      "correctAnswer": 0,
      "explanation": "Brief explanation"
    }
  ],
  "note": {
    "title": "Topic Heading",
    "summary": "Short summary",
    "mermaidDiagram": "graph TD\\n  A[Main] --> B[Sub1]\\n  A --> C[Sub2]",
    "points": ["Key point 1", "Key point 2", "Key point 3"]
  },
  "trick": {
    "title": "Mnemonic Title",
    "formula": "Shortcut / Code",
    "desc": "How to remember"
  },
  "playCard": {
    "topic": "Topic Name",
    "front": "Important concept question",
    "back": "Accurate answer and year"
  }
}`;

    const fileParts = (req.files || []).map(fileToGenerativePart);
    const result = await model.generateContent([prompt, ...fileParts]);
    let text = result.response.text().trim();
    text = text.replace(/```json/gi, '').replace(/```/g, '').trim();

    const data = JSON.parse(text);
    if (data.questions && Array.isArray(data.questions)) {
      data.questions.forEach(q => { q.subject = subject; questionBank.unshift(q); });
    }

    res.json({ success: true, data });
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
