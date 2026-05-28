'use strict';
try { require('dotenv').config(); } catch {}

const express = require('express');
const Anthropic = require('@anthropic-ai/sdk');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

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

app.post('/api/chat', async (req, res) => {
  try {
    const { message, history = [], context } = req.body;
    if (!message?.trim()) return res.status(400).json({ error: 'No message provided.' });

    const client = getClient();

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const contextText = context ? JSON.stringify(context, null, 2) : 'No study material has been analyzed yet.';

    const stream = client.messages.stream({
      model: 'claude-opus-4-7',
      max_tokens: 4096,
      system: [
        {
          type: 'text',
          text: `You are ClassMind AI — an intelligent, friendly study assistant for Nigerian university students.\n\nYou have access to the student's analyzed academic context below. Use it to give personalized, accurate help.\n\nWhen writing assignments or essays, write them completely and professionally. When explaining topics, use clear examples. When helping with exam prep, be thorough.\n\nAnalyzed academic context:\n\n${contextText}`,
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
