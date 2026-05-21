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
    `Target dimensions: ${design.dimensions}`,
    `Title/content: ${design.content_title}`,
    `Visual direction: ${design.visual_direction}`,
    `Layout structure: ${design.layout_structure}`,
    `Typography direction: ${design.typography_direction}`,
    `Color system: ${design.color_system}`,
    `Image style: ${design.image_style}`,
    `Design mood: ${design.design_mood}`,
    `CTA style: ${design.cta_style}`,
    '',
    `Detailed prompt from designer agent: ${design.ai_image_prompt}`
  ].join('\n');

  const response = await openai.responses.create({
    model: process.env.OPENAI_IMAGE_MAIN_MODEL || model,
    input: imagePrompt,
    tools: [
      {
        type: 'image_generation',
        size
      }
    ]
  });

  const imageBase64 = response.output
    .filter((output) => output.type === 'image_generation_call')
    .map((output) => output.result)[0];

  if (!imageBase64) {
    throw new Error('Image generation did not return an image.');
  }

  const filename = `${sessionId}-${Date.now()}-${index + 1}.png`;
  const filePath = path.join(generatedDir, filename);
  await writeFile(filePath, Buffer.from(imageBase64, 'base64'));
  return `/generated/${filename}`;
}

async function getAgentInstructions(agentName) {
  if (!agentCache.has(agentName)) {
    const filePath = path.join(__dirname, agentFiles[agentName]);
    agentCache.set(agentName, await readFile(filePath, 'utf8'));
  }
  return agentCache.get(agentName);
}

function requireApiKey() {
  if (!openai) {
    const error = new Error('Missing OPENAI_API_KEY. Add it to .env, then restart the app.');
    error.status = 400;
    throw error;
  }
}

function parseCsv(buffer) {
  const text = buffer.toString('utf8').replace(/^\uFEFF/, '');
  const parsed = Papa.parse(text, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (header) => header.trim()
  });

  if (parsed.errors.length) {
    throw new Error(`CSV parsing failed: ${parsed.errors[0].message}`);
  }

  const rows = parsed.data
    .map((row) => Object.fromEntries(
      Object.entries(row).map(([key, value]) => [key, typeof value === 'string' ? value.trim() : value])
    ))
    .filter((row) => Object.values(row).some(Boolean))
    .filter((row) => !Object.values(row).join(' ').toLowerCase().includes('test'));

  const uniqueRows = Array.from(new Map(rows.map((row) => [JSON.stringify(row), row])).values());
  const latestValidRow = uniqueRows.at(-1) || null;

  if (!latestValidRow) {
    throw new Error('No valid client row found in the CSV.');
  }

  return { latestValidRow, rows: uniqueRows };
}

function parseBriefImport(buffer, filename = '') {
  const text = buffer.toString('utf8').replace(/^\uFEFF/, '').trim();
  if (!text) {
    throw new Error('The uploaded brief file is empty.');
  }

  if (filename.toLowerCase().endsWith('.json') || text.startsWith('{') || text.startsWith('[')) {
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? parsed.at(-1) : parsed;
  }

  return parseCsv(buffer).latestValidRow;
}

function buildInput(title, payload) {
  return `${title}\n\n${JSON.stringify(payload, null, 2)}`;
}

async function callAgent(agentName, payload) {
  requireApiKey();

  const instructions = await getAgentInstructions(agentName);
  const response = await openai.responses.create({
    model,
    instructions,
    input: buildInput(`Input for ${agentName} agent:`, payload)
  });

  return response.output_text || JSON.stringify(response.output || response, null, 2);
}

async function callVisionAgent(agentName, payload, files = []) {
  requireApiKey();

  const instructions = await getAgentInstructions(agentName);
  const content = [
    {
      type: 'input_text',
      text: buildInput(`Input for ${agentName} agent:`, {
        ...payload,
        uploaded_files: files.map((file) => ({
          originalname: file.originalname,
          mimetype: file.mimetype,
          size: file.size
        }))
      })
    }
  ];

  files
    .filter((file) => file.mimetype.startsWith('image/'))
    .slice(0, 8)
    .forEach((file) => {
      content.push({
        type: 'input_image',
        image_url: `data:${file.mimetype};base64,${file.buffer.toString('base64')}`
      });
    });

  const response = await openai.responses.create({
    model,
    instructions,
    input: [{ role: 'user', content }]
  });

  return response.output_text || JSON.stringify(response.output || response, null, 2);
}

async function callAgentJson(agentName, payload, schemaName, schema, extraInstructions = '') {
  requireApiKey();

  const instructions = `${await getAgentInstructions(agentName)}\n\n${extraInstructions}`.trim();
  const response = await openai.responses.create({
    model,
    instructions,
    input: buildInput(`Input for ${agentName} agent:`, payload),
    text: {
      format: {
        type: 'json_schema',
        name: schemaName,
        strict: true,
        schema
      }
    }
  });

  return JSON.parse(response.output_text);
}

async function runInitialWorkflow(csvData) {
  const intake = await callAgent('intake', {
    csv_latest_valid_row: csvData.latestValidRow,
    csv_valid_rows_count: csvData.rows.length,
    csv_rows: csvData.rows
  });

  const strategy = await callAgent('strategy', {
    intake_output: intake
  });

  return { intake, strategy };
}

async function runBusinessInfoWorkflow(businessInfo, brandingAnalysis = '') {
  const intake = await callAgent('intake', {
    source: 'client_business_information_form',
    business_information: businessInfo,
    branding_analysis: brandingAnalysis
  });

  const strategy = await callAgent('strategy', {
    intake_output: intake,
    branding_analysis: brandingAnalysis
  });

  return { intake, strategy };
}

function normalizeBrandSource(source) {
  const trimmed = source.trim();
  if (!trimmed) return '';

  try {
    return new URL(trimmed).toString();
  } catch {
    if (trimmed.startsWith('www.') || (/^[^\s/]+\.[^\s/]+/.test(trimmed))) {
      return `https://${trimmed}`;
    }
    return trimmed;
  }
}

async function fetchUrlText(url) {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 BrandingAnalysisBot/1.0',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      }
    });
    const text = await response.text();
    const noScripts = text
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    return `URL: ${url}\n\n${noScripts.slice(0, 50000)}`;
  } catch (error) {
    return `Could not fetch URL directly: ${url}\nFetch error: ${error.message}\nAnalyze this as a source reference only.`;
  }
}

function buildBrandingPrompt({ sources, businessInfo }) {
  return `
You are a senior visual identity designer, brand-manual analyst, and design-systems specialist.

Analyze the supplied brand sources and produce a detailed, implementation-ready visual branding JSON.
The JSON will be passed to other AI agents that create strategy, content, and designs, so prioritize how the brand LOOKS and how to recreate it accurately.

Extract explicit facts and careful visual/messaging inferences. Mark uncertain guesses as low confidence.
When exact color hex values or fonts are not available, infer approximate values and explain uncertainty.
Do not invent brand facts that are not supported by the material.

Business/client information:
${JSON.stringify(businessInfo || {}, null, 2)}

Sources:
${sources.map((source) => `- ${source}`).join('\n')}

Focus on:
- Logo system: primary mark, wordmark, monogram/symbol, variations, clear space, minimum sizes, color versions, incorrect usage.
- Color system: exact or inferred HEX values, primary/secondary/neutral colors, color pairings, usage ratios, contrast notes.
- Typography: font names if visible, likely substitutes, Arabic/English pairing, hierarchy, weights, sizes, headline/body behavior.
- Layout system: grids, spacing, margins, cards, panels, section patterns, radius, strokes, alignment, RTL/LTR notes.
- Imagery: photography, illustration, icon, pattern, texture, mockup, social media visual style, image treatments.
- Brand materials: stationery, social posts/stories/reels, ads, website sections, packaging, signage, uniforms, merchandise when visible or logically needed.
- Design tokens and component guidance another AI can directly apply.
- Missing visual information the user should provide for better design accuracy.
`.trim();
}

const stringArray = {
  type: 'array',
  items: { type: 'string' }
};

const brandAnalysisSchema = {
  type: 'object',
  properties: {
    brand_name: { type: 'string' },
    summary: { type: 'string' },
    visual_brand_system: {
      type: 'object',
      properties: {
        visual_summary: { type: 'string' },
        logo_system: {
          type: 'object',
          properties: {
            primary_logo_description: { type: 'string' },
            logo_variations: stringArray,
            symbol_or_monogram: { type: 'string' },
            wordmark_style: { type: 'string' },
            clear_space_rules: stringArray,
            minimum_size_guidance: stringArray,
            approved_colorways: stringArray,
            incorrect_usage: stringArray,
            confidence: { type: 'string' }
          },
          required: ['primary_logo_description', 'logo_variations', 'symbol_or_monogram', 'wordmark_style', 'clear_space_rules', 'minimum_size_guidance', 'approved_colorways', 'incorrect_usage', 'confidence'],
          additionalProperties: false
        },
        color_system: {
          type: 'object',
          properties: {
            primary_colors: stringArray,
            secondary_colors: stringArray,
            neutral_colors: stringArray,
            color_pairings: stringArray,
            usage_ratios: stringArray,
            accessibility_notes: stringArray
          },
          required: ['primary_colors', 'secondary_colors', 'neutral_colors', 'color_pairings', 'usage_ratios', 'accessibility_notes'],
          additionalProperties: false
        },
        typography_system: {
          type: 'object',
          properties: {
            primary_fonts: stringArray,
            hierarchy_rules: stringArray,
            arabic_typography_notes: stringArray,
            english_typography_notes: stringArray,
            font_pairing_guidance: stringArray
          },
          required: ['primary_fonts', 'hierarchy_rules', 'arabic_typography_notes', 'english_typography_notes', 'font_pairing_guidance'],
          additionalProperties: false
        },
        layout_system: {
          type: 'object',
          properties: {
            grid_and_spacing: stringArray,
            composition_style: stringArray,
            section_patterns: stringArray,
            card_and_panel_style: stringArray,
            border_radius_and_strokes: stringArray
          },
          required: ['grid_and_spacing', 'composition_style', 'section_patterns', 'card_and_panel_style', 'border_radius_and_strokes'],
          additionalProperties: false
        },
        imagery_system: {
          type: 'object',
          properties: {
            photography_style: stringArray,
            illustration_style: stringArray,
            icon_style: stringArray,
            texture_or_pattern_style: stringArray,
            image_treatment: stringArray,
            avoid: stringArray
          },
          required: ['photography_style', 'illustration_style', 'icon_style', 'texture_or_pattern_style', 'image_treatment', 'avoid'],
          additionalProperties: false
        },
        brand_materials: {
          type: 'object',
          properties: {
            stationery: stringArray,
            social_media_templates: stringArray,
            presentation_templates: stringArray,
            website_components: stringArray,
            packaging_or_merchandise: stringArray,
            advertising_materials: stringArray,
            environmental_or_signage: stringArray
          },
          required: ['stationery', 'social_media_templates', 'presentation_templates', 'website_components', 'packaging_or_merchandise', 'advertising_materials', 'environmental_or_signage'],
          additionalProperties: false
        }
      },
      required: ['visual_summary', 'logo_system', 'color_system', 'typography_system', 'layout_system', 'imagery_system', 'brand_materials'],
      additionalProperties: false
    },
    design_tokens: {
      type: 'object',
      properties: {
        colors: stringArray,
        fonts: stringArray,
        spacing: stringArray,
        radii: stringArray,
        shadows_or_effects: stringArray,
        components: stringArray
      },
      required: ['colors', 'fonts', 'spacing', 'radii', 'shadows_or_effects', 'components'],
      additionalProperties: false
    },
    design_rules: {
      type: 'object',
      properties: {
        do: stringArray,
        dont: stringArray,
        reusable_tokens: stringArray,
        accessibility_notes: stringArray
      },
      required: ['do', 'dont', 'reusable_tokens', 'accessibility_notes'],
      additionalProperties: false
    },
    implementation_guidance: {
      type: 'object',
      properties: {
        design_system_summary: { type: 'string' },
        prompt_guidance_for_design_ai: stringArray,
        recommended_assets_to_request: stringArray,
        best_fit_design_outputs: stringArray
      },
      required: ['design_system_summary', 'prompt_guidance_for_design_ai', 'recommended_assets_to_request', 'best_fit_design_outputs'],
      additionalProperties: false
    },
    missing_information: stringArray,
    evidence: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          source: { type: 'string' },
          observation: { type: 'string' },
          confidence: { type: 'string' }
        },
        required: ['source', 'observation', 'confidence'],
        additionalProperties: false
      }
    },
    confidence_score: { type: 'number' }
  },
  required: ['brand_name', 'summary', 'visual_brand_system', 'design_tokens', 'design_rules', 'implementation_guidance', 'missing_information', 'evidence', 'confidence_score'],
  additionalProperties: false
};

async function analyzeBrandingInternal(session, files = [], links = '', selectedModel = 'gpt-5.4-mini') {
  requireApiKey();

  const sources = [];
  const content = [];
  const linkSources = links
    .split('\n')
    .map(normalizeBrandSource)
    .filter(Boolean);

  for (const link of linkSources) {
    sources.push(link);
    content.push({
      type: 'input_text',
      text: await fetchUrlText(link)
    });
  }

  for (const file of files) {
    sources.push(`${file.originalname} (${file.mimetype || 'unknown'})`);

    if (file.mimetype?.startsWith('image/')) {
      content.push({
        type: 'input_image',
        image_url: `data:${file.mimetype};base64,${file.buffer.toString('base64')}`
      });
    } else if (file.mimetype === 'application/pdf' || file.originalname.toLowerCase().endsWith('.pdf')) {
      const uploaded = await openai.files.create({
        file: await toFile(file.buffer, file.originalname),
        purpose: 'user_data'
      });
      content.push({
        type: 'input_file',
        file_id: uploaded.id
      });
    } else {
      content.push({
        type: 'input_text',
        text: `File: ${file.originalname}\n\n${file.buffer.toString('utf8').slice(0, 50000)}`
      });
    }
  }

  if (!sources.length) {
    throw new Error('Please upload branding files or paste at least one brand link.');
  }

  content.unshift({
    type: 'input_text',
    text: buildBrandingPrompt({
      sources,
      businessInfo: session.businessInfo || session.outputs.businessInfo || {}
    })
  });

  const response = await openai.responses.create({
    model: selectedModel || process.env.BRANDING_MODEL || 'gpt-5.4-mini',
    input: [{ role: 'user', content }],
    text: {
      format: {
        type: 'json_schema',
        name: 'visual_brand_analysis',
        strict: true,
        schema: brandAnalysisSchema
      }
    }
  });

  return JSON.parse(response.output_text);
}

async function runCopyWorkflow(session, userFeedback = '') {
  const planner = await callAgent('planner', {
    intake_output: session.outputs.intake,
    strategy_output: session.outputs.strategy,
    branding_analysis: session.outputs.brandingAnalysis || '',
    user_feedback: userFeedback
  });

  const copywriting = await callAgent('copywriting', {
    intake_output: session.outputs.intake,
    strategy_output: session.outputs.strategy,
    content_plan_output: planner,
    branding_analysis: session.outputs.brandingAnalysis || '',
    user_feedback: userFeedback
  });

  const qa = await callAgent('qa', {
    intake_output: session.outputs.intake,
    strategy_output: session.outputs.strategy,
    content_plan_output: planner,
    copywriting_output: copywriting
  });

  return { planner, copywriting, qa };
}

async function runFinalWorkflow(session, userFeedback = '') {
  const creative = await callAgent('creative', {
    intake_output: session.outputs.intake,
    strategy_output: session.outputs.strategy,
    content_plan_output: session.outputs.planner,
    copywriting_output: session.outputs.copywriting,
    qa_output: session.outputs.qa,
    branding_analysis: session.outputs.brandingAnalysis || '',
    user_feedback: userFeedback
  });

  const finalBrief = await callAgent('orchestrator', {
    workflow_request: 'Compile a final PDF-ready marketing and content brief for designer handoff.',
    intake_output: session.outputs.intake,
    strategy_output: session.outputs.strategy,
    content_plan_output: session.outputs.planner,
    copywriting_output: session.outputs.copywriting,
    qa_output: session.outputs.qa,
    branding_analysis: session.outputs.brandingAnalysis || '',
    creative_direction_output: creative
  });

  return { creative, finalBrief };
}

async function buildSocialPlanRows(session) {
  const columns = [
    'منصة السوشيال ميديا',
    'العنوان',
    'النوع',
    'مقترح التصميم / الفيديو',
    'كوبي التصميم / الفيديو',
    'الكابشن',
    'الهاشتاغ'
  ];

  const rowProperties = Object.fromEntries(columns.map((column) => [
    column,
    {
      type: 'string',
      description: `Excel column: ${column}`
    }
  ]));

  const extraInstructions = `
SOCIAL PLAN EXPORT OVERRIDE:

You are creating the visible Social Media Content Plan table before Excel export.
This is not optional and this is not a generic workflow status response.

Use the Copywriting Agent output as the primary source for real content pieces.
Use the Creative Direction Agent output as the primary source for visual/video suggestions.

You must fill every row with useful content.
Do not output rows where all or most cells are "غير محدد".

Column mapping:
- منصة السوشيال ميديا: extract from each content item platform. If missing, infer from content type and strategy.
- العنوان: use the hook, content idea, or a short title based on the main copy.
- النوع: choose exactly one of Photo, Reel, Carousel, Story.
- مقترح التصميم / الفيديو: combine suggested visual direction with creative direction.
- كوبي التصميم / الفيديو: use hook, on-screen text, script text, or the strongest short copy from the content item.
- الكابشن: use main copy plus CTA when relevant.
- الهاشتاغ: propose relevant Arabic/English hashtags for the brand, industry, and platform.

Use "غير محدد" only for a specific cell when it cannot be extracted or reasonably inferred.
Never create a row with all cells "غير محدد".
Return at least 5 rows when enough content exists.
`;

  const result = await callAgentJson('orchestrator', {
    workflow_request: [
      'Create an Excel-ready social media content plan.',
      'Each row must represent one content piece.',
      'Use exactly these Arabic columns:',
      'منصة السوشيال ميديا',
      'العنوان',
      'النوع',
      'مقترح التصميم / الفيديو',
      'كوبي التصميم / الفيديو',
      'الكابشن',
      'الهاشتاغ',
      'The النوع value must be one of: Photo, Reel, Carousel, Story.',
      'Use غير محدد when a value is unavailable.'
    ].join('\n'),
    intake_output: session.outputs.intake,
    strategy_output: session.outputs.strategy,
    content_plan_output: session.outputs.planner,
    copywriting_output: session.outputs.copywriting,
    qa_output: session.outputs.qa,
    creative_direction_output: session.outputs.creative,
    final_brief_output: session.outputs.finalBrief
  }, 'social_media_content_plan', {
    type: 'object',
    properties: {
      rows: {
        type: 'array',
        items: {
          type: 'object',
          properties: rowProperties,
          required: columns,
          additionalProperties: false
        }
      }
    },
    required: ['rows'],
    additionalProperties: false
  }, extraInstructions);

  const rows = result.rows;
  const unknownCells = rows.flatMap((row) => columns.map((column) => row[column])).filter((value) => value === 'غير محدد').length;
  const totalCells = Math.max(rows.length * columns.length, 1);

  if (!rows.length || unknownCells / totalCells > 0.55) {
    const retryResult = await callAgentJson('orchestrator', {
      workflow_request: [
        'Retry the Social Media Content Plan.',
        'The previous attempt contained too many "غير محدد" cells.',
        'Extract real rows from copywriting_output and enrich them with creative_direction_output.',
        'Do not return placeholder-only rows.'
      ].join('\n'),
      intake_output: session.outputs.intake,
      strategy_output: session.outputs.strategy,
      content_plan_output: session.outputs.planner,
      copywriting_output: session.outputs.copywriting,
      qa_output: session.outputs.qa,
      creative_direction_output: session.outputs.creative,
      final_brief_output: session.outputs.finalBrief
    }, 'social_media_content_plan_retry', {
      type: 'object',
      properties: {
        rows: {
          type: 'array',
          items: {
            type: 'object',
            properties: rowProperties,
            required: columns,
            additionalProperties: false
          }
        }
      },
      required: ['rows'],
      additionalProperties: false
    }, `${extraInstructions}\n\nSTRICT RETRY: You must populate the table from the actual content. Do not use placeholder-only rows.`);

    return retryResult.rows;
  }

  return rows;
}

function setSocialPlan(session, rows) {
  session.outputs.socialPlan = rows;
  return session;
}

async function buildDesignPosts(session) {
  const columns = [
    'platform',
    'content_title',
    'content_type',
    'dimensions',
    'visual_direction',
    'layout_structure',
    'typography_direction',
    'color_system',
    'image_style',
    'design_mood',
    'cta_style',
    'animation_suggestions',
    'ai_image_prompt'
  ];

  const properties = Object.fromEntries(columns.map((column) => [
    column,
    { type: 'string' }
  ]));

  const result = await callAgentJson('graphicDesigner', {
    workflow_request: [
      'Generate production-ready social media design directions for every row in the social media content plan.',
      'Use branding_analysis, creative_direction_output, final_brief_output, and social_plan together.',
      'Each output item must be one design asset or carousel/story design concept.',
      'Do not create generic design notes. Make each design specific to the content row.'
    ].join('\n'),
    business_information: session.outputs.businessInfo || session.businessInfo || {},
    branding_analysis: session.outputs.brandingAnalysis || {},
    strategy_output: session.outputs.strategy || '',
    content_plan_output: session.outputs.planner || '',
    copywriting_output: session.outputs.copywriting || '',
    creative_direction_output: session.outputs.creative || '',
    final_brief_output: session.outputs.finalBrief || '',
    social_plan: session.outputs.socialPlan || []
  }, 'graphic_design_posts', {
    type: 'object',
    properties: {
      designs: {
        type: 'array',
        items: {
          type: 'object',
          properties,
          required: columns,
          additionalProperties: false
        }
      }
    },
    required: ['designs'],
    additionalProperties: false
  }, `
GRAPHIC DESIGN OUTPUT OVERRIDE:
Return detailed design directions, not marketing strategy.
Use Arabic when the content is Arabic.
Always include exact dimensions.
Always include a detailed AI image prompt. If text should be added later by the designer, say: "No text inside generated image; leave clean space for typography."
`);

  return result.designs;
}

async function buildDesignPostsWithImages(session) {
  const designs = await buildDesignPosts(session);
  const limit = Number(process.env.DESIGN_IMAGE_LIMIT || 3);
  const selectedDesigns = designs.slice(0, limit);

  for (let index = 0; index < selectedDesigns.length; index += 1) {
    selectedDesigns[index].image_url = await generateDesignImage(selectedDesigns[index], session.id, index);
  }

  return [
    ...selectedDesigns,
    ...designs.slice(limit).map((design) => ({
      ...design,
      image_url: '',
      image_status: 'prompt_ready_image_not_generated'
    }))
  ];
}

function getSession(id) {
  const session = sessions.get(id);
  if (!session) {
    const error = new Error('Session not found. Please upload the CSV again.');
    error.status = 404;
    throw error;
  }
  return session;
}

app.post('/api/start', upload.single('csv'), async (req, res, next) => {
  try {
    if (!req.file) {
      throw new Error('Please upload a CSV file.');
    }

    const csvData = parseCsv(req.file.buffer);
    const id = randomUUID();
    const businessInfo = {
      ...csvData.latestValidRow,
      _source: 'csv_upload',
      _valid_rows_count: csvData.rows.length
    };

    const session = {
      id,
      createdAt: new Date().toISOString(),
      csvData,
      businessInfo,
      approvals: {
        businessInfo: true,
        branding: false,
        strategy: false,
        copywriting: false
      },
      outputs: {
        businessInfo
      }
    };

    sessions.set(id, session);
    await saveSessionsToDisk();
    res.json(session);
  } catch (error) {
    next(error);
  }
});

app.post('/api/client-info', async (req, res, next) => {
  try {
    const id = randomUUID();
    const session = {
      id,
      createdAt: new Date().toISOString(),
      businessInfo: req.body.businessInfo || req.body,
      approvals: {
        businessInfo: true,
        branding: false,
        strategy: false,
        copywriting: false
      },
      outputs: {
        businessInfo: req.body.businessInfo || req.body
      }
    };

    sessions.set(id, session);
    await saveSessionsToDisk();
    res.json(session);
  } catch (error) {
    next(error);
  }
});

app.post('/api/import-brief', upload.single('briefFile'), async (req, res, next) => {
  try {
    if (!req.file) {
      throw new Error('Please upload a CSV or JSON brief export.');
    }

    const businessInfo = parseBriefImport(req.file.buffer, req.file.originalname);
    const id = randomUUID();
    const session = {
      id,
      createdAt: new Date().toISOString(),
      businessInfo,
      approvals: {
        businessInfo: true,
        branding: false,
        strategy: false,
        copywriting: false
      },
      outputs: {
        businessInfo
      }
    };

    sessions.set(id, session);
    await saveSessionsToDisk();
    res.json(session);
  } catch (error) {
    next(error);
  }
});

app.post('/api/analyze-branding', upload.array('brandingFiles', 12), async (req, res, next) => {
  try {
    const session = getSession(req.body.sessionId);
    const files = req.files || [];

    const brandingAnalysis = await analyzeBrandingInternal(
      session,
      files,
      req.body.brandingLinks || '',
      req.body.brandingModel || 'gpt-5.4-mini'
    );

    session.outputs.brandingAnalysis = brandingAnalysis;
    session.approvals.branding = false;
    await saveSessionsToDisk();
    res.json(session);
  } catch (error) {
    next(error);
  }
});

app.post('/api/approve-branding', async (req, res, next) => {
  try {
    const session = getSession(req.body.sessionId);
    const outputs = await runBusinessInfoWorkflow(
      session.businessInfo || session.outputs.businessInfo || {},
      session.outputs.brandingAnalysis || ''
    );

    session.approvals.branding = true;
    Object.assign(session.outputs, outputs);
    await saveSessionsToDisk();
    res.json(session);
  } catch (error) {
    next(error);
  }
});

app.post('/api/approve-strategy', async (req, res, next) => {
  try {
    const session = getSession(req.body.sessionId);
    const outputs = await runCopyWorkflow(session, req.body.feedback || '');
    session.approvals.strategy = true;
    Object.assign(session.outputs, outputs);
    await saveSessionsToDisk();
    res.json(session);
  } catch (error) {
    next(error);
  }
});

app.post('/api/revise-strategy', async (req, res, next) => {
  try {
    const session = getSession(req.body.sessionId);
    session.outputs.strategy = await callAgent('strategy', {
      intake_output: session.outputs.intake,
      revision_request: req.body.feedback || ''
    });
    session.approvals.strategy = false;
    await saveSessionsToDisk();
    res.json(session);
  } catch (error) {
    next(error);
  }
});

app.post('/api/approve-copywriting', async (req, res, next) => {
  try {
    const session = getSession(req.body.sessionId);
    const outputs = await runFinalWorkflow(session, req.body.feedback || '');
    session.approvals.copywriting = true;
    Object.assign(session.outputs, outputs);
    await saveSessionsToDisk();
    res.json(session);
  } catch (error) {
    next(error);
  }
});

app.post('/api/generate-social-plan', async (req, res, next) => {
  try {
    const session = getSession(req.body.sessionId);

    if (!session.outputs.finalBrief || !session.outputs.creative) {
      const error = new Error('Final brief is not ready yet. Approve copywriting first.');
      error.status = 400;
      throw error;
    }

    const rows = await buildSocialPlanRows(session);
    setSocialPlan(session, rows);
    await saveSessionsToDisk();
    res.json(session);
  } catch (error) {
    next(error);
  }
});

app.post('/api/export-social-plan', async (req, res, next) => {
  try {
    const session = getSession(req.body.sessionId);

    if (!session.outputs.finalBrief || !session.outputs.creative) {
      const error = new Error('Final brief is not ready yet. Approve copywriting first.');
      error.status = 400;
      throw error;
    }

    const rows = session.outputs.socialPlan || await buildSocialPlanRows(session);
    if (!session.outputs.socialPlan) {
      setSocialPlan(session, rows);
      await saveSessionsToDisk();
    }

    const columns = [
      'منصة السوشيال ميديا',
      'العنوان',
      'النوع',
      'مقترح التصميم / الفيديو',
      'كوبي التصميم / الفيديو',
      'الكابشن',
      'الهاشتاغ'
    ];

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'AI Marketing Workflow';
    workbook.created = new Date();

    const worksheet = workbook.addWorksheet('Social Media Plan', {
      views: [{ rightToLeft: true }]
    });

    worksheet.columns = columns.map((column, index) => ({
      header: column,
      key: column,
      width: [22, 32, 18, 44, 44, 50, 34][index]
    }));

    rows.forEach((row) => {
      worksheet.addRow(Object.fromEntries(columns.map((column) => [column, row[column] || 'غير محدد'])));
    });

    worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    worksheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF0B6B5F' }
    };
    worksheet.eachRow((row) => {
      row.alignment = { vertical: 'top', wrapText: true, readingOrder: 'rtl' };
    });

    const buffer = await workbook.xlsx.writeBuffer();

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="social-media-content-plan.xlsx"');
    res.send(buffer);
  } catch (error) {
    next(error);
  }
});

app.post('/api/generate-design-posts', async (req, res, next) => {
  try {
    const session = getSession(req.body.sessionId);

    if (!session.outputs.socialPlan) {
      const error = new Error('Social media plan is not ready yet.');
      error.status = 400;
      throw error;
    }

    session.outputs.designPosts = await buildDesignPostsWithImages(session);
    await saveSessionsToDisk();
    res.json(session);
  } catch (error) {
    next(error);
  }
});

app.post('/api/revise-copywriting', async (req, res, next) => {
  try {
    const session = getSession(req.body.sessionId);
    const outputs = await runCopyWorkflow(session, req.body.feedback || '');
    session.approvals.copywriting = false;
    Object.assign(session.outputs, outputs);
    await saveSessionsToDisk();
    res.json(session);
  } catch (error) {
    next(error);
  }
});

app.use((error, req, res, next) => {
  const status = error.status || 500;
  res.status(status).json({
    error: error.message || 'Something went wrong.'
  });
});

const port = Number(process.env.PORT || 3000);
await loadSessionsFromDisk();
app.listen(port, () => {
  console.log(`Marketing workflow app running at http://localhost:${port}`);
});
