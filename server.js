import 'dotenv/config';
import express from 'express';
import multer from 'multer';
import Papa from 'papaparse';
import OpenAI from 'openai';
import { toFile } from 'openai/uploads';
import ExcelJS from 'exceljs';
import { mkdir, readFile, writeFile } from 'fs/promises';
import { randomUUID } from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const upload = multer({ storage: multer.memoryStorage() });
const sessions = new Map();
const dataDir = path.join(__dirname, 'data');
const sessionsFile = path.join(dataDir, 'sessions.json');
const generatedDir = path.join(__dirname, 'public/generated');

const model = process.env.OPENAI_MODEL || 'gpt-5.2';
const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const agentFiles = {
  orchestrator: 'agents/00-orchestrator.md',
  intake: 'agents/01-intake-diagnosis.md',
  strategy: 'agents/02-digital-strategy.md',
  planner: 'agents/03-content-planner.md',
  copywriting: 'agents/04-copywriting.md',
  qa: 'agents/05-qa-brand-consistency.md',
  creative: 'agents/06-creative-direction.md',
  visualBranding: 'agents/07-visual-branding-analysis.md',
  graphicDesigner: 'agents/08-graphic-designer.md'
};

const agentCache = new Map();

async function loadSessionsFromDisk() {
  try {
    const data = JSON.parse(await readFile(sessionsFile, 'utf8'));
    Object.entries(data).forEach(([id, session]) => sessions.set(id, session));
  } catch (error) {
    if (error.code !== 'ENOENT') {
      console.warn(`Could not load saved sessions: ${error.message}`);
    }
  }
}

async function saveSessionsToDisk() {
  await mkdir(dataDir, { recursive: true });
  await writeFile(
    sessionsFile,
    JSON.stringify(Object.fromEntries(sessions), null, 2),
    'utf8'
  );
}

function pickImageSize(design = {}) {
  const dimensions = `${design.dimensions || ''}`.toLowerCase();
  const platform = `${design.platform || ''}`.toLowerCase();
  const type = `${design.content_type || ''}`.toLowerCase();

  if (
    dimensions.includes('1920')
    || platform.includes('tiktok')
    || platform.includes('snap')
    || type.includes('story')
    || type.includes('reel')
  ) {
    return '1024x1536';
  }

  if (dimensions.includes('1600') || dimensions.includes('900') || platform.includes('x/twitter')) {
    return '1536x1024';
  }

  return '1024x1536';
}

async function generateDesignImage(design, sessionId, index) {
  requireApiKey();
  await mkdir(generatedDir, { recursive: true });

  const size = pickImageSize(design);
  const imagePrompt = [
    'Generate a polished final social media design mockup image for this design direction.',
    'The result should look like a premium agency social media post, not a wireframe.',
    'Use clean modern Saudi/GCC-aware visual design, elegant typography composition, strong hierarchy, premium spacing, and brand-aware colors.',
    'If Arabic text appears, keep it natural, readable, RTL, and professionally composed. Avoid broken Arabic typography.',
    'Do not include app UI, browser chrome, annotations, crop marks, or explanatory labels.',
    '',
    `Platform: ${design.platform}`,
    `Content type: ${design.content_type}`,
