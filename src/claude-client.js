import Anthropic from '@anthropic-ai/sdk';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { checkGuardrails, sanitizeOutput, getGroundingRules, logBlockedRequest } from './guardrails.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Create Claude client with MCP (filesystem access)
 * This allows Claude to read uploaded Excel files
 */
export function createClaudeClient() {
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY is required. Please set it in your .env file.');
  }

  const anthropic = new Anthropic({
    apiKey: apiKey,
  });

  const model = process.env.CLAUDE_MODEL || 'claude-3-5-sonnet-20241022';

  /**
   * Chat with Claude about tracking data
   * Claude has access to read files via simulated MCP
   * 
   * @param {string} userMessage - User's question
   * @param {Array} conversationHistory - Previous messages
   * @param {Object} manifest - File manifest with paths
   * @returns {string} Claude's response
   */
  async function chat(userMessage, conversationHistory = [], manifest = null) {
    try {
      // Check guardrails first
      const guardrailCheck = checkGuardrails(userMessage, manifest);
      
      if (!guardrailCheck.allowed) {
        // Log blocked request
        logBlockedRequest(userMessage, guardrailCheck);
        
        // Return friendly message
        return guardrailCheck.reason;
      }
      
      // Build system prompt with file context
      const systemPrompt = buildSystemPrompt(manifest);

      // Build conversation messages
      const messages = [
        ...conversationHistory,
        {
          role: 'user',
          content: userMessage
        }
      ];

      console.log(`🤖 Calling Claude (${model})...`);

      // Call Claude API
      const response = await anthropic.messages.create({
        model: model,
        max_tokens: parseInt(process.env.CLAUDE_MAX_TOKENS) || 4096,
        temperature: parseFloat(process.env.CLAUDE_TEMPERATURE) || 0.3,
        system: systemPrompt,
        messages: messages
      });

      // Extract text response
      let assistantMessage = response.content[0]?.text || 'No response generated';
      
      // Sanitize output to prevent data leakage
      assistantMessage = sanitizeOutput(assistantMessage);

      return assistantMessage;

    } catch (error) {
      console.error('Claude API error:', error);
      
      if (error.status === 401) {
        throw new Error('Invalid API key. Please check your ANTHROPIC_API_KEY in .env file.');
      }
      
      if (error.status === 429) {
        throw new Error('Rate limit exceeded. Please try again in a moment.');
      }

      throw new Error(`Claude API error: ${error.message}`);
    }
  }

  /**
   * Build system prompt with file access instructions
   * This simulates MCP by giving Claude the file contents directly
   * Handles Excel tracking data, PDFs, DOCX, and other knowledge files
   */
  function buildSystemPrompt(manifest) {
    let prompt = `You are a helpful AI assistant with access to uploaded documents.

Your role:
- Answer questions about tracking data, shipment status, and business information
- Provide clear, accurate information from the uploaded files
- Search across multiple file types (Excel, PDF, DOCX, text files)
- Be friendly, professional, and empathetic
- If you don't have information, admit it clearly

IMPORTANT - Response Formatting:
- Use **markdown formatting** for better readability
- Use **bold** for emphasis and key information (PO numbers, status, etc.)
- Use bullet lists for multiple items
- Use tables (markdown format) when presenting tabular data
- Use ### headings for sections if the response has multiple parts
- Keep paragraphs short and scannable
- Example good response format:

**PO Number:** SG-001
**Status:** In Transit
**ETA:** October 15, 2024

**Details:**
- Carrier: DHL Express
- Current Location: Singapore Port
- Last Update: October 8, 2024

If presenting multiple items, use tables:

| PO Number | Status | ETA |
|-----------|--------|-----|
| SG-001 | In Transit | Oct 15 |
| SG-002 | Delivered | Oct 10 |

`;

    // Add grounding rules to prevent hallucination
    prompt += getGroundingRules();

    if (!manifest) {
      prompt += `\nCurrently, no data has been uploaded. Please inform the user to upload their files first.`;
      return prompt;
    }

    // Read the actual data (simulating MCP file access)
    try {
      const processedDir = path.join(__dirname, '..', 'uploads', 'processed');
      
      prompt += `\n=== UPLOADED FILES (${manifest.totalFiles} total) ===\n`;
      prompt += `Tracking files: ${manifest.fileTypes.tracking}\n`;
      prompt += `Knowledge files: ${manifest.fileTypes.knowledge}\n`;
      prompt += `Other files: ${manifest.fileTypes.other}\n\n`;

      // Read only files from current upload (based on manifest)
      const processedFiles = fs.readdirSync(processedDir);
      
      // Get current upload files from manifest
      const currentFiles = manifest.files.map(f => f.name);
      
      // Process structured data (Excel/CSV) - only current upload files
      const jsonFiles = processedFiles.filter(f => {
        if (!f.endsWith('.json') || f.endsWith('_meta.json') || f === 'manifest.json') return false;
        // Check if this file belongs to current upload
        const baseName = f.replace(/_\d+\.json$/, '');
        return currentFiles.some(currentFile => currentFile.includes(baseName));
      });
      if (jsonFiles.length > 0) {
        prompt += `\n=== STRUCTURED DATA (Excel/CSV) ===\n`;
        jsonFiles.forEach(filename => {
          const data = JSON.parse(fs.readFileSync(path.join(processedDir, filename), 'utf-8'));
          const originalName = filename.replace(/_\d+\.json$/, '');
          
          prompt += `\nFile: ${originalName}\n`;
          if (Array.isArray(data)) {
            prompt += `Records: ${data.length}\n`;
            if (data.length > 0) {
              prompt += `Columns: ${Object.keys(data[0]).join(', ')}\n`;
              // Include data (limit for very large files)
              if (data.length <= 100) {
                prompt += `\nData:\n${JSON.stringify(data, null, 2)}\n`;
              } else {
                prompt += `\nSample (first 10):\n${JSON.stringify(data.slice(0, 10), null, 2)}\n`;
                prompt += `\n[Full dataset available with ${data.length} records]\n`;
              }
            }
          }
          prompt += `\n---\n`;
        });
      }

      // Process text-based files (PDF, DOCX, TXT) - only current upload files
      const txtFiles = processedFiles.filter(f => {
        if (!f.endsWith('.txt')) return false;
        // Check if this file belongs to current upload
        const baseName = f.replace(/_\d+\.txt$/, '');
        return currentFiles.some(currentFile => currentFile.includes(baseName));
      });
      if (txtFiles.length > 0) {
        prompt += `\n=== KNOWLEDGE BASE (PDF/DOCX/Text) ===\n`;
        txtFiles.forEach(filename => {
          const textContent = fs.readFileSync(path.join(processedDir, filename), 'utf-8');
          const originalName = filename.replace(/_\d+\.txt$/, '');
          
          prompt += `\nFile: ${originalName}\n`;
          
          // Check if content is garbled or unreadable (more tolerant)
          const nonPrintableMatches = textContent.match(/[^\x20-\x7E\s]/g) || [];
          const nonPrintableRatio = nonPrintableMatches.length / Math.max(textContent.length, 1);
          const hasUsableWords = /[A-Za-z]{4,}/.test(textContent);
          const isGarbled = textContent.length < 20 || 
                           /^[\s\n\r\t]+$/.test(textContent) || 
                           textContent.includes('\u0000') ||
                           textContent.includes('\u0001') ||
                           textContent.includes('\u0002') ||
                           (!hasUsableWords) ||
                           // Check for excessive non-printable characters (but allow some)
                           nonPrintableRatio > 0.8;
          
          if (isGarbled) {
            prompt += `⚠️ WARNING: This file appears to contain garbled or unreadable content.\n`;
            prompt += `Content preview (first 200 chars): ${textContent.substring(0, 200)}\n`;
            prompt += `If asked about this file, inform the user that the content is garbled and cannot be read.\n`;
          } else {
            // Provide targeted highlights for key policy keywords to guide the model
            const importantKeywords = [
              { label: 'sick leave', regex: /.{0,120}sick\s+(leave|days|policy).{0,160}/gi },
              { label: 'medical leave', regex: /.{0,160}medical\s+leave.{0,160}/gi },
              { label: 'paid time off', regex: /.{0,160}(paid\s+time\s+off|pto).{0,160}/gi },
              { label: 'vacation policy', regex: /.{0,160}vacation.{0,160}/gi }
            ];

            const highlights = [];
            importantKeywords.forEach(({ label, regex }) => {
              const matches = [];
              let match;
              while ((match = regex.exec(textContent)) !== null && matches.length < 3) {
                matches.push(match[0].replace(/\s+/g, ' ').trim());
              }
              if (matches.length > 0) {
                highlights.push({ label, matches });
              }
            });

            if (highlights.length > 0) {
              prompt += `Key excerpts detected:\n`;
              highlights.forEach(({ label, matches }) => {
                prompt += `- ${label}: ${matches.join(' ... ')}\n`;
              });
              prompt += `\n`;
            }

            // Limit very long documents
            if (textContent.length <= 5000) {
              prompt += `Content:\n${textContent}\n`;
            } else {
              prompt += `Content (first 5000 chars):\n${textContent.substring(0, 5000)}...\n`;
              prompt += `[Document continues, total length: ${textContent.length} characters]\n`;
            }
          }
          prompt += `\n---\n`;
        });
      }

      prompt += `\n\n=== INSTRUCTIONS FOR ANSWERING QUESTIONS ===

For TRACKING questions (PO numbers, shipment status, ETA):
1. Search the structured data (Excel/CSV files) for the specific reference
2. Provide complete information: Status, ETA, Location, Carrier, etc.
3. If not found, suggest similar matches or ask for clarification
4. Mention any issues or delays proactively

For KNOWLEDGE questions (products, procedures, policies):
1. Search the knowledge base (PDF/DOCX/Text files) for relevant information
2. Quote or paraphrase the source document
3. Provide context and explain clearly
4. If information spans multiple documents, synthesize it

For GENERAL questions:
1. Search ALL available files for relevant information
2. Combine information from multiple sources if needed
3. Be clear about which file(s) you're referencing
4. If information is uncertain or incomplete, say so

Answer in a friendly, professional tone. Don't mention file formats or JSON - just provide the information naturally as if you're a knowledgeable assistant.`;

    } catch (error) {
      console.error('Error reading uploaded data:', error);
      prompt += `\nError loading uploaded data. Please try uploading the files again.`;
    }

    return prompt;
  }

  return {
    chat,
    model
  };
}

/**
 * Helper: Extract specific PO data from tracking file
 * Used for quick lookups without loading all data into prompt
 */
export function findPOData(poNumber, processedDir) {
  try {
    const mainFilePath = path.join(processedDir, 'tracking_main.json');
    if (!fs.existsSync(mainFilePath)) {
      return null;
    }

    const trackingData = JSON.parse(fs.readFileSync(mainFilePath, 'utf-8'));
    
    // Search for PO (case-insensitive, flexible matching)
    const found = trackingData.find(row => {
      return Object.values(row).some(value => {
        if (typeof value === 'string') {
          return value.toLowerCase().includes(poNumber.toLowerCase());
        }
        return false;
      });
    });

    return found || null;
  } catch (error) {
    console.error('Error finding PO data:', error);
    return null;
  }
}

