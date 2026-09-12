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

app.post('/api/generate', upload.array('files'), async (req, res) => {
  try {
    const { subject, limit, lang } = req.body;
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

    let prompt = `You are a premier Library Science exam expert for RAMESH GUJJAR LIS Portal.
Analyze the attached documents thoroughly and create ${limit === 'max' ? 'up to 20' : limit} high-quality MCQs on "${subject}".
Language: ${lang === 'hi' ? 'Hindi Devanagari' : 'English'}.

Return ONLY a valid raw JSON array of objects without markdown formatting or backticks:
[
  {
    "question": "Question text",
    "options": ["Option A", "Option B", "Option C", "Option D"],
    "correctAnswer": 0,
    "explanation": "Brief explanation"
  }
]`;

    const fileParts = (req.files || []).map(fileToGenerativePart);
    const result = await model.generateContent([prompt, ...fileParts]);
    let text = result.response.text().trim();
    text = text.replace(/```json/gi, '').replace(/```/g, '').trim();

    const questions = JSON.parse(text);
    questions.forEach(q => { q.subject = subject; questionBank.unshift(q); });

    res.json({ success: true, questionsCount: questions.length, questions });
  } catch (err) {
    console.error('Error generating MCQs:', err);
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
