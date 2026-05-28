'use strict';
try { require('dotenv').config(); } catch {}

const express = require('express');
const Anthropic = require('@anthropic-ai/sdk');
const path = require('path');
const multer = require('multer');
const pdfParse = require('pdf-parse');

const app = express();
const PORT = process.env.PORT || 3000;

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

let anthropic;
function getClient() {
  if (!anthropic) {
    if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY not configured.');
    anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return anthropic;
}

app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.post('/api/parse-pdf', upload.single('pdf'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No PDF file uploaded.' });
    const data = await pdfParse(req.file.buffer);
    res.json({ text: data.text });
  } catch (err) {
    console.error('PDF parse error:', err.message);
    res.status(500).json({ error: err.message || 'Failed to parse PDF.' });
  }
});

const ANALYSIS_SYSTEM = `You are ClassMind AI, a smart academic assistant for Nigerian university students.

Analyze the provided course material or WhatsApp chat export and extract structured academic information.

Return ONLY valid JSON with this exact structure:
{
  "assignments": [
    {
      "subject": "Course name or code",
      "title": "Assignment title or description",
      "deadline": "Date/time string or 'No deadline mentioned'",
      "priority": "HIGH",
      "details": "Full description of what needs to be done"
    }
  ],
  "timetable": [
    {
      "day": "Monday",
      "time": "8:00 AM",
      "subject": "Course name",
      "type": "class",
      "venue": "Location or 'Not specified'"
    }
  ],
  "topics": {
    "SubjectName": {
      "summary": "One-paragraph summary of this subject's content",
      "key_points": ["Key point 1", "Key point 2", "Key point 3"]
    }
  },
  "overview": "2-3 sentence summary of everything found in this material",
  "tip": "One interesting AI or tech concept explained in 50 words, relevant to the student"
}

Priority rules:
- HIGH: exam, test, quiz, or deadline within 48 hours
- MEDIUM: deadline within this week
- LOW: future deadline or no deadline

Timetable type values: class, lecture, lab, test, exam, assignment_due

If information is missing or unclear, use reasonable defaults. Always return valid JSON — no markdown, no explanation, just the JSON object.`;

app.post('/api/analyze', async (req, res) => {
  try {
    const { content } = req.body;
    if (!content?.trim()) return res.status(400).json({ error: 'No content provided.' });

    const client = getClient();
    const response = await client.messages.create({
      model: 'claude-opus-4-7',
      max_tokens: 8192,
      thinking: { type: 'adaptive' },
      system: ANALYSIS_SYSTEM,
      messages: [{ role: 'user', content: `Analyze this academic material and extract all relevant information:\n\n${content.slice(0, 50000)}` }]
    });

    const textBlock = response.content.find(b => b.type === 'text');
    const data = extractJSON(textBlock?.text || '');
    res.json(data);
  } catch (err) {
    console.error('Analyze error:', err.message);
    res.status(500).json({ error: err.message || 'Analysis failed.' });
  }
});

const STYLE_INSTRUCTIONS = {
  simple: `TEACHING STYLE — Simple & Layman:
Explain everything like you're talking to a smart secondary school student. Use everyday language, real-life examples, and analogies. Avoid jargon — if you must use a technical term, immediately explain it in plain words. Break things down step by step. Use short sentences. Make it feel easy and non-intimidating.`,

  academic: `TEACHING STYLE — Academic & Professional:
Use formal academic language appropriate for university level. Reference proper terminology, cite concepts accurately, and structure responses with clear headings where appropriate. Write essays and assignments in proper academic format. Use the tone of a university lecturer or textbook author.`,

  exam: `TEACHING STYLE — Exam Ready:
Be laser-focused on what's examinable. Lead with the most likely exam questions on this topic, give model answers in bullet points, highlight definitions the examiner wants to see word-for-word, and flag common student mistakes to avoid. Think like a marking scheme.`,

  naija: `TEACHING STYLE — Naija Street Mode:
Talk like a brilliant Nigerian classmate who just finished reading and is explaining it to you casually. Keep it real, relatable, and direct. Use everyday Nigerian expressions where they fit naturally. Make the student feel like they're gisting with a smart friend, not reading a textbook. Still 100% accurate though — no cutting corners on facts.`,

  eli5: `TEACHING STYLE — Explain Like I'm 5 (ELI5):
Use the simplest possible words and the most relatable analogies imaginable. Imagine explaining to a curious child. Use stories, comparisons to everyday things (food, sports, money, phones), and lots of "it's like when..." Make the student go "ohhhh I get it now!" Break every concept down to its most fundamental idea first.`,

  tutor: `TEACHING STYLE — Personal Tutor:
Act as a patient one-on-one tutor. Ask the student what they already understand before diving in. Build on what they know. Give examples, then check understanding with a quick question. If explaining a calculation or process, go step by step and pause to make sure each part makes sense. Be encouraging and positive throughout.`
};

app.post('/api/chat', async (req, res) => {
  try {
    const { message, history = [], context, style = 'simple' } = req.body;
    if (!message?.trim()) return res.status(400).json({ error: 'No message provided.' });

    const client = getClient();

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const contextText = context ? JSON.stringify(context, null, 2) : 'No study material has been analyzed yet.';
    const styleInstruction = STYLE_INSTRUCTIONS[style] || STYLE_INSTRUCTIONS.simple;

    const stream = client.messages.stream({
      model: 'claude-opus-4-7',
      max_tokens: 4096,
      system: [
        {
          type: 'text',
          text: `You are ClassMind AI — an intelligent study assistant for Nigerian university students.\n\nYou have access to the student's analyzed academic context below. Use it to give personalized, accurate help.\n\nWhen writing assignments or essays, write them completely. When helping with exam prep, be thorough.\n\n${styleInstruction}\n\nAnalyzed academic context:\n\n${contextText}`,
          cache_control: { type: 'ephemeral' }
        }
      ],
      messages: [
        ...history.slice(-10).map(m => ({ role: m.role, content: m.content })),
        { role: 'user', content: message }
      ]
    });

    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        res.write(`data: ${JSON.stringify({ text: event.delta.text })}\n\n`);
      }
    }

    res.write('data: [DONE]\n\n');
    res.end();
  } catch (err) {
    console.error('Chat error:', err.message);
    if (!res.headersSent) {
      res.status(500).json({ error: err.message || 'Chat failed.' });
    } else {
      res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
      res.end();
    }
  }
});

app.get('/{*path}', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.listen(PORT, () => console.log(`ClassMind AI running on port ${PORT}`));

function extractJSON(text) {
  try { return JSON.parse(text.trim()); } catch {}
  const match = text.match(/\{[\s\S]*\}/);
  if (match) {
    try { return JSON.parse(match[0]); } catch {}
  }
  return { assignments: [], timetable: [], topics: {}, overview: 'Could not extract structured information from the provided content.', tip: '' };
}
