import fs from 'fs';
import Anthropic from '@anthropic-ai/sdk';

function extractTextSegments(parts) {
  if (!Array.isArray(parts)) return [];
  return parts
    .filter(part => part?.type === 'text' && typeof part.text === 'string')
    .map(part => part.text);
}

export function createVisionClient() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.warn('VISION_PDF_ENABLED is true but ANTHROPIC_API_KEY is missing. Vision client will be disabled.');
    return null;
  }

  const model = process.env.CLAUDE_MODEL || 'claude-3-5-sonnet-20241022';
  const maxTokens = parseInt(process.env.CLAUDE_MAX_TOKENS, 10) || 4096;
  const temperature = parseFloat(process.env.CLAUDE_TEMPERATURE) || 0.2;

  const anthropic = new Anthropic({ apiKey });

  async function processPdf({ filePath, originalName, preview }) {
    if (!filePath) {
      throw new Error('processPdf requires filePath');
    }

    const pdfBuffer = fs.readFileSync(filePath);
    const start = Date.now();

    const response = await anthropic.messages.create({
      model,
      max_tokens: maxTokens,
      temperature,
      system: `You are a document intelligence assistant. Analyze attached PDF files and return **valid JSON only** with this schema:
{
  "summary": string,
  "full_text": string, // include key passages as plain UTF-8 text
  "tables": [
    {
      "title": string | null,
      "headers": string[],
      "rows": string[][]
    }
  ]
}
Always populate "tables" (use [] if none). Keep JSON compact and avoid Markdown.`,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `You are given a PDF file named "${originalName || 'document.pdf'}". Extract the essential content and return JSON only with this schema:
{
  "summary": string,
  "full_text": string,
  "tables": [
    {
      "title": string | null,
      "headers": string[],
      "rows": string[][]
    }
  ]
}
Ensure JSON is compact, no Markdown or additional prose. Include tables when present; otherwise set tables to an empty array.`
            },
            {
              type: 'document',
              document: {
                name: originalName || 'document.pdf',
                media_type: 'application/pdf',
                data: pdfBuffer.toString('base64')
              }
            }
          ]
        }
      ]
    });

    const textSegments = extractTextSegments(response.content);
    if (textSegments.length === 0) {
      throw new Error('Claude vision response did not include text content.');
    }

    const rawText = textSegments.join('\n').trim();
    let parsed;
    try {
      parsed = JSON.parse(rawText);
    } catch (err) {
      throw new Error(`Claude vision response was not valid JSON: ${err.message}`);
    }

    const latencyMs = Date.now() - start;
    const tables = Array.isArray(parsed.tables) ? parsed.tables : [];
    const fullText = parsed.full_text || parsed.fullText || parsed.summary || rawText;

    return {
      model: response.model || model,
      latencyMs,
      rawText,
      json: parsed,
      data: {
        fullText,
        tables,
        paragraphs: Array.isArray(parsed.paragraphs) ? parsed.paragraphs : [],
        json: parsed
      }
    };
  }

  return {
    processPdf
  };
}

