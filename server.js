'use strict';
try { require('dotenv').config(); } catch {}

const express = require('express');
const Anthropic = require('@anthropic-ai/sdk');
const path = require('path');
const multer = require('multer');
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');
const XLSX = require('xlsx');

const app = express();
const PORT = process.env.PORT || 3000;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB per file
});

let anthropic;
function getClient() {
  if (!anthropic) {
    if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY not configured.');
    anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return anthropic;
}

app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public'), {
  etag: true,
  setHeaders(res, filePath) {
    // HTML: never cache — always fetch fresh so deploys show immediately
    if (filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    }
  }
}));

const IMAGE_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
const CLAUDE_IMAGE_TYPES = { 'image/jpg': 'image/jpeg', 'image/jpeg': 'image/jpeg', 'image/png': 'image/png', 'image/gif': 'image/gif', 'image/webp': 'image/webp' };

async function extractFileContent(file) {
  const mime = file.mimetype || '';
  const name = file.originalname || '';
  const ext = path.extname(name).toLowerCase();

  // Images — return as base64 for Claude Vision
  if (IMAGE_TYPES.includes(mime) || ['.jpg','.jpeg','.png','.gif','.webp'].includes(ext)) {
    return {
      type: 'image',
      mediaType: CLAUDE_IMAGE_TYPES[mime] || 'image/jpeg',
      data: file.buffer.toString('base64'),
      label: name
    };
  }

  // PDF
  if (mime === 'application/pdf' || ext === '.pdf') {
    const parsed = await pdfParse(file.buffer);
    return { type: 'text', text: `[FILE: ${name}]\n${parsed.text}`, label: name };
  }

  // Word documents
  if (mime.includes('wordprocessingml') || mime === 'application/msword' || ['.docx','.doc'].includes(ext)) {
    const result = await mammoth.extractRawText({ buffer: file.buffer });
    return { type: 'text', text: `[FILE: ${name}]\n${result.value}`, label: name };
  }

  // Excel spreadsheets
  if (mime.includes('spreadsheetml') || mime.includes('excel') || ['.xlsx','.xls'].includes(ext)) {
    const wb = XLSX.read(file.buffer, { type: 'buffer' });
    const lines = [];
    wb.SheetNames.forEach(sheetName => {
      lines.push(`--- Sheet: ${sheetName} ---`);
      const csv = XLSX.utils.sheet_to_csv(wb.Sheets[sheetName]);
      lines.push(csv);
    });
    return { type: 'text', text: `[FILE: ${name}]\n${lines.join('\n')}`, label: name };
  }

  // CSV / plain text / markdown
  if (mime.startsWith('text/') || ['.txt','.csv','.md','.markdown'].includes(ext)) {
    return { type: 'text', text: `[FILE: ${name}]\n${file.buffer.toString('utf8')}`, label: name };
  }

  // PowerPoint — extract what we can as binary text fallback
  if (['.pptx','.ppt'].includes(ext) || mime.includes('presentationml') || mime.includes('powerpoint')) {
    return { type: 'text', text: `[FILE: ${name}]\n[PowerPoint file — Claude will analyze slide structure and any readable text content from this presentation]`, label: name };
  }

  // Audio / Video — note unsupported but acknowledged
  if (mime.startsWith('audio/') || mime.startsWith('video/') || ['.mp3','.mp4','.wav','.m4a','.mov','.avi','.ogg'].includes(ext)) {
    return { type: 'text', text: `[FILE: ${name}]\n[Audio/video file detected. Note: direct audio/video transcription is not yet supported. Please paste a transcript or notes from this recording for analysis.]`, label: name };
  }

  // Fallback — try reading as UTF-8 text
  try {
    const text = file.buffer.toString('utf8');
    return { type: 'text', text: `[FILE: ${name}]\n${text}`, label: name };
  } catch {
    return { type: 'text', text: `[FILE: ${name}]\n[Could not extract content from this file type.]`, label: name };
  }
}

const ANALYSIS_SYSTEM = `You are ClassMind AI, a smart academic assistant for Nigerian university students.

Analyze the provided course material — which may include text, images of notes/slides/whiteboards, documents, spreadsheets, or WhatsApp chat exports — and extract structured academic information.

For images: read all text visible in the image, extract schedule info, assignments, topics, diagrams, etc.

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

Always return valid JSON — no markdown, no explanation, just the JSON object.`;

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

// Multi-file analyze endpoint — accepts any file types
app.post('/api/analyze-files', upload.array('files', 20), async (req, res) => {
  try {
    if (!req.files?.length && !req.body.text?.trim()) {
      return res.status(400).json({ error: 'No files or text provided.' });
    }

    const client = getClient();

    // Extract content from all files
    const extracted = await Promise.all((req.files || []).map(f => extractFileContent(f)));

    // Build message content blocks
    const contentBlocks = [];

    // Add pasted text first if present
    if (req.body.text?.trim()) {
      contentBlocks.push({ type: 'text', text: `[PASTED TEXT]\n${req.body.text.slice(0, 20000)}` });
    }

    for (const item of extracted) {
      if (item.type === 'image') {
        contentBlocks.push({
          type: 'image',
          source: { type: 'base64', media_type: item.mediaType, data: item.data }
        });
        contentBlocks.push({ type: 'text', text: `[Above image file: ${item.label}]` });
      } else {
        contentBlocks.push({ type: 'text', text: item.text.slice(0, 30000) });
      }
    }

    contentBlocks.push({ type: 'text', text: 'Analyze all the above material and extract all academic information.' });

    const response = await client.messages.create({
      model: 'claude-opus-4-7',
      max_tokens: 8192,
      thinking: { type: 'adaptive' },
      system: ANALYSIS_SYSTEM,
      messages: [{ role: 'user', content: contentBlocks }]
    });

    const textBlock = response.content.find(b => b.type === 'text');
    const data = extractJSON(textBlock?.text || '');
    res.json(data);
  } catch (err) {
    console.error('Analyze-files error:', err.message);
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
