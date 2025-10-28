import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Anthropic from '@anthropic-ai/sdk';
import { processPDFAdvanced } from './pdf-processor-advanced.js';
import { getStorage } from './storage/index.js';
import {
  buildProcessedKey,
  buildRawKey,
  ensureKeyWithinTenant,
  tenantPersonaPrefix,
  safeSegment
} from './storage/paths.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.join(__dirname, '..');

let anthropicClient = null;
let storage = null;

function getAnthropicClient() {
  if (anthropicClient) {
    return anthropicClient;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY is required for vision processing');
  }

  anthropicClient = new Anthropic({ apiKey });
  storage = getStorage();
  return anthropicClient;
}

function resolveProjectPath(targetPath, fallback) {
  if (!targetPath) return fallback;
  if (path.isAbsolute(targetPath)) return targetPath;
  return path.resolve(PROJECT_ROOT, targetPath);
}

async function saveJsonToStorage(storageKey, payload, { prettyPrint = false, tenantId, personaId } = {}) {
  const activeStorage = storage || getStorage();
  const data = prettyPrint ? JSON.stringify(payload, null, 2) : JSON.stringify(payload);
  return activeStorage.save(storageKey, data, { contentType: 'application/json' });
}

function guessTitle(quickExtract, advancedData) {
  const preview = quickExtract?.preview?.split('\n').find(line => line.trim()) || '';
  if (preview) return preview.trim().slice(0, 200);
  const paragraphs = advancedData?.data?.paragraphs || [];
  if (paragraphs.length > 0 && paragraphs[0]?.text) {
    return paragraphs[0].text.trim().slice(0, 200);
  }
  return advancedData?.metadata?.title || 'Document';
}

function buildHierarchyFromText(fullText) {
  const sections = [];
  if (!fullText) {
    return sections;
  }

  const lines = fullText.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  const stack = [];

  const upsert = (identifier, title) => {
    const depth = identifier.split('.').length;
    const node = {
      section_id: identifier,
      section_title: title || `Section ${identifier}`,
      subsections: [],
      items: []
    };

    while (stack.length && stack[stack.length - 1].depth >= depth) {
      stack.pop();
    }

    if (stack.length === 0) {
      sections.push(node);
    } else {
      const parent = stack[stack.length - 1].node;
      if (!parent.subsections) parent.subsections = [];
      parent.subsections.push(node);
    }

    stack.push({ depth, node });
  };

  lines.forEach(line => {
    const numericMatch = line.match(/^(\d+(?:\.\d+){0,4})(?:\s+|-\s+)?(.+)?$/);
    if (numericMatch) {
      const [, identifier, title] = numericMatch;
      upsert(identifier, title ? title.trim() : undefined);
      return;
    }

    if (stack.length > 0) {
      const current = stack[stack.length - 1].node;
      if (!current.items) current.items = [];
      current.items.push({
        item_id: `${current.section_id}.${current.items.length + 1}`,
        text: line,
        sub_items: []
      });
    }
  });

  return sections;
}

function transformTables(tables = []) {
  return tables.map((table, index) => {
    const rows = table?.rows || [];
    const formattedRows = rows.map(row => {
      const cells = row.items || [];
      return cells.map(cell => cell.str?.trim() || '').filter(Boolean);
    }).filter(row => row.length > 0);

    return {
      table_title: table?.title || `Table ${index + 1}`,
      page: table?.page || null,
      rows: formattedRows
    };
  });
}

function extractClauses(fullText) {
  if (!fullText) return [];
  const clauses = [];
  const lines = fullText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

  lines.forEach(line => {
    const clauseMatch = line.match(/^(\d+(?:\.\d+){0,4})(?:\s+|-\s+)?(.+)?$/);
    if (clauseMatch) {
      const [, number, content] = clauseMatch;
      clauses.push({
        clause_number: number,
        text: content ? content.trim() : '',
        sub_clauses: []
      });
    }
  });

  return clauses;
}

function buildVisionPayload({ quickExtract, advancedData }) {
  const fullText = advancedData?.data?.fullText || quickExtract?.data?.fullText || '';
  return {
    source: advancedData ? 'advanced_pdf_parser' : 'quick_extract_only',
    document_metadata: {
      detected_type: 'pdf_document',
      title: guessTitle(quickExtract, advancedData),
      pages: advancedData?.metadata?.pages || quickExtract?.data?.pages || null
    },
    hierarchical_content: {
      sections: buildHierarchyFromText(fullText)
    },
    structured_data_tables: {
      tables: transformTables(advancedData?.data?.tables || [])
    },
    terms_conditions_clauses: {
      clauses: extractClauses(fullText)
    }
  };
}

export async function runVisionPipeline({ file, tenantId, personaId = null, quickExtract = null, reason = 'manual_trigger' }) {
  const visionEnabled = process.env.VISION_ENABLED === 'true';
  if (!visionEnabled || !file?.path) {
    return null;
  }

  try {
    const tenantKeyPrefix = tenantPersonaPrefix(tenantId, personaId);
    const randomSuffix = `${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
    const parsedStorageKey = buildProcessedKey(tenantId, personaId, 'vision', 'parsed', `${randomSuffix}.json`);

    const promptPath = process.env.VISION_PROMPT_PATH
      ? resolveProjectPath(process.env.VISION_PROMPT_PATH, null)
      : null;
    const promptPathRelative = promptPath ? path.relative(PROJECT_ROOT, promptPath) : null;

    let promptContent = null;
    if (promptPath && fs.existsSync(promptPath)) {
      try {
        promptContent = fs.readFileSync(promptPath, 'utf-8');
      } catch (err) {
        console.warn(`Vision pipeline: unable to read prompt at ${promptPath}`, err.message);
      }
    }

    const model = process.env.CLAUDE_VISION_MODEL || process.env.CLAUDE_MODEL || 'claude-sonnet-4-20250514';
    const maxTokens = parseInt(process.env.CLAUDE_VISION_MAX_TOKENS, 10) || parseInt(process.env.CLAUDE_MAX_TOKENS, 10) || 4096;
    const temperatureEnv = process.env.CLAUDE_VISION_TEMPERATURE ?? process.env.CLAUDE_TEMPERATURE;
    const temperature = Number.isFinite(parseFloat(temperatureEnv)) ? parseFloat(temperatureEnv) : 0;

    let anthropicResponse = null;
    let parsedPayload = null;
    let combinedText = '';

    try {
      const pdfBuffer = fs.readFileSync(file.path);
      const pdfBase64 = pdfBuffer.toString('base64');

      const client = getAnthropicClient();

      const instructionLines = [
        `Filename: ${file.originalname}`,
        `Tenant: ${safeSegment(tenantId, 'default')}`,
        personaId ? `Persona: ${safeSegment(personaId, 'default')}` : null,
        reason ? `Escalation reason: ${reason}` : null,
        quickExtract?.textQuality?.reason ? `Quick extract quality: ${quickExtract.textQuality.reason}` : null,
        'Return a strictly valid JSON object that captures the document structure and insights as instructed.'
      ].filter(Boolean);

      anthropicResponse = await client.messages.create({
        model,
        system: promptContent || 'You are an expert document cognition and extraction system. Return structured JSON.',
        max_tokens: maxTokens,
        temperature,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'document',
                source: {
                  type: 'base64',
                  media_type: 'application/pdf',
                  data: pdfBase64
                }
              },
              {
                type: 'text',
                text: instructionLines.join('\n')
              }
            ]
          }
        ]
      });

      const textSegments = (anthropicResponse.content || [])
        .filter(part => part.type === 'text' && typeof part.text === 'string')
        .map(part => part.text.trim())
        .filter(Boolean);

      const trimmedSegments = textSegments.map(segment => {
        const stripped = segment.trim();
        if (/^```json/i.test(stripped) && stripped.endsWith('```')) {
          return stripped
            .replace(/^```json\s*/i, '')
            .replace(/```\s*$/i, '')
            .trim();
        }
        if (/^```/.test(stripped) && stripped.endsWith('```')) {
          return stripped
            .replace(/^```\w*\s*/i, '')
            .replace(/```\s*$/i, '')
            .trim();
        }
        return stripped;
      });

      combinedText = trimmedSegments.join('\n\n').trim();

      if (combinedText) {
        try {
          parsedPayload = JSON.parse(combinedText);
        } catch (err) {
          console.warn('Vision pipeline: Claude response was not valid JSON. Falling back to local extraction.');
        }
      }
    } catch (err) {
      console.error('Anthropic vision call failed:', err);
    }

    let sourceTag = 'anthropic_vision';
    let modelUsed = anthropicResponse?.model || model;
    const createdAt = anthropicResponse?.created_at;
    const generatedAt = createdAt
      ? (typeof createdAt === 'number' ? new Date(createdAt * 1000).toISOString() : new Date(createdAt).toISOString())
      : new Date().toISOString();

    let finalPayload = parsedPayload;

    if (!finalPayload) {
      let advancedData = null;
      try {
        advancedData = await processPDFAdvanced(file);
      } catch (err) {
        console.warn(`Vision pipeline: advanced extraction failed for ${file.originalname}`, err.message);
      }
      finalPayload = buildVisionPayload({ quickExtract, advancedData });
      sourceTag = 'local_fallback';
      modelUsed = 'local_fallback';
    }

    if (typeof finalPayload !== 'object' || finalPayload === null) {
      finalPayload = { raw_text: combinedText || '', notes: 'Vision response could not be parsed.' };
    }

    const metadata = {
      model: modelUsed,
      generated_at: generatedAt,
      prompt_path: promptPathRelative,
      reason,
      source: sourceTag
    };

    if (!finalPayload.vision_metadata) {
      finalPayload.vision_metadata = metadata;
    }

    const prettyPrint = process.env.PRETTY_PRINT === 'true';
    const parsedSaveResult = await saveJsonToStorage(parsedStorageKey, finalPayload, { prettyPrint, tenantId, personaId });

    let parsedJsonPath = null;
    if (parsedSaveResult?.path) {
      parsedJsonPath = path.relative(PROJECT_ROOT, parsedSaveResult.path);
    }

    let rawStorageKey = null;
    let rawSaveResult = null;
    if (process.env.SAVE_RAW_RESPONSES === 'true') {
      rawStorageKey = buildRawKey(tenantId, personaId, 'vision', 'raw', `${randomSuffix}.json`);
      const rawPayload = anthropicResponse
        ? { response: anthropicResponse, combinedText }
        : { fallback: true, payload: finalPayload };
      rawSaveResult = await saveJsonToStorage(rawStorageKey, rawPayload, { prettyPrint, tenantId, personaId });
    }

    const artifacts = {
      parsedStorageKey: parsedSaveResult?.resolvedKey || parsedStorageKey,
      rawResponseStorageKey: rawSaveResult?.resolvedKey || rawStorageKey,
      promptStorageKey: null, // No prompt storage key in this function's artifacts
      model: modelUsed,
      generatedAt,
      promptPath: promptPathRelative,
      source: sourceTag
    };

    if (parsedJsonPath) {
      artifacts.parsedJsonPath = parsedJsonPath;
    }

    if (rawSaveResult?.path) {
      artifacts.rawResponsePath = path.relative(PROJECT_ROOT, rawSaveResult.path);
    }

    return {
      data: finalPayload,
      artifacts
    };
  } catch (error) {
    console.error('Vision pipeline failed:', error);
    return null;
  }
}
