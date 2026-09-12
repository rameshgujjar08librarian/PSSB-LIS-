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

// 1 PDF GENERATES EVERYTHING INTO ITS RESPECTIVE PLACE
app.post('/api/generate', upload.array('files'), async (req, res) => {
  try {
    const { subject, limit, lang } = req.body;
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

    const prompt = `You are a premier Library Science competitive exam mentor for RAMESH GUJJAR LIS Portal.
Analyze the attached documents thoroughly. From this single study material, generate a complete 5-in-1 study pack on "${subject}" in ${lang === 'en' ? 'English' : 'Hindi Devanagari'}.

Return ONLY a raw valid JSON object without markdown formatting or backticks:
{
  "questions": [
    {
      "question": "Question text",
      "options": ["Opt A", "Opt B", "Opt C", "Opt D"],
      "correctAnswer": 0,
      "explanation": "Brief explanation"
    }
  ],
  "note": {
    "title": "Topic Heading",
    "summary": "Quick summary",
    "mermaidDiagram": "graph TD\\n  A[Main Topic] --> B[Branch 1]\\n  A --> C[Branch 2]",
    "points": ["Key point 1", "Key point 2", "Key point 3", "Key point 4"]
  },
  "shortNote": {
    "title": "Topic Key Summary",
    "points": ["Micro bullet 1", "Micro bullet 2", "Micro bullet 3"],
    "keyTable": [
      {"concept": "Act / Term", "detail": "Year / Detail"}
    ]
  },
  "tricks": [
    {
      "title": "Mnemonic Rule",
      "formula": "Code / Shortcut",
      "desc": "How to remember"
    }
  ],
  "playCards": [
    {
      "topic": "Topic Name",
      "front": "Question or challenge",
      "back": "Exact answer and year"
    }
  ]
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
    console.error('All-in-One generation error:', err);
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
