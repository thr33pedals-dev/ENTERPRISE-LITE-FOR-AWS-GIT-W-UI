import Anthropic from '@anthropic-ai/sdk';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { checkGuardrails, sanitizeOutput, getGroundingRules, logBlockedRequest } from './guardrails.js';
import { buildVisionExcerpt, renderVisionContext } from './prompt-utils.js';
import { getStorage } from './storage/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');

const THINK_TOOL = {
  name: 'think',
  description: 'Use the tool to think about something. It will not obtain new information or change the database, but just append the thought to the log. Use it when complex reasoning or sequential decisions are needed.',
  input_schema: {
    type: 'object',
    properties: {
      thought: {
        type: 'string',
        description: 'Reasoning notes, policy checks, missing information, or plan before responding.'
      }
    },
    required: ['thought']
  }
};

const MAX_THINK_ITERATIONS = 3;

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

  const model = process.env.CLAUDE_MODEL || 'claude-sonnet-4-20250514';
  const visionModel = process.env.CLAUDE_VISION_MODEL || process.env.CLAUDE_MODEL || 'claude-sonnet-4-20250514';
  const visionMaxTokens = parseInt(process.env.CLAUDE_VISION_MAX_TOKENS || process.env.CLAUDE_MAX_TOKENS || '16000', 10);
  const visionTemperature = parseFloat(process.env.CLAUDE_VISION_TEMPERATURE || process.env.CLAUDE_TEMPERATURE || '0');

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
      const systemPrompt = await buildSystemPrompt(manifest);

      // Build conversation messages with current user turn
      const baseMessages = [
        ...conversationHistory.map(entry => ({
          role: entry.role,
          content: [{ type: 'text', text: entry.content }]
        })),
        {
          role: 'user',
          content: [{ type: 'text', text: userMessage }]
        }
      ];

      console.log(`🤖 Calling Claude (${model})...`);
      let assistantMessage = '';
      let iteration = 0;
      const runtimeMessages = [...baseMessages];

      while (iteration < MAX_THINK_ITERATIONS) {
        const response = await anthropic.messages.create({
          model: model,
          max_tokens: parseInt(process.env.CLAUDE_MAX_TOKENS) || 4096,
          temperature: parseFloat(process.env.CLAUDE_TEMPERATURE) || 0.3,
          system: systemPrompt,
          messages: runtimeMessages,
          tools: [THINK_TOOL],
          tool_choice: { type: 'auto' }
        });

        // Log any think steps for debugging/observability
        logThinkSteps(response);

        // Capture any assistant text generated in this turn
        const textSegments = extractTextSegments(response.content);
        if (textSegments.length > 0) {
          assistantMessage += (assistantMessage ? '\n\n' : '') + textSegments.join('\n\n');
        }

        // Record assistant turn in conversation before deciding next step
        runtimeMessages.push({
          role: 'assistant',
          content: response.content
        });

        // Identify tool invocations (e.g., think)
        const toolCalls = response.content.filter(part => part.type === 'tool_use');

        if (toolCalls.length === 0) {
          // Claude finished responding
          break;
        }

        // Return tool results so Claude can continue
        const toolResults = toolCalls.map(toolUse => ({
          role: 'user',
          content: [
            {
              type: 'tool_result',
              tool_use_id: toolUse.id,
              content: toolUse.name === 'think'
                ? 'Thought logged. Continue.'
                : 'Tool call acknowledged.'
            }
          ]
        }));

        runtimeMessages.push(...toolResults);
        iteration++;
      }

      if (!assistantMessage.trim()) {
        assistantMessage = 'I’m sorry, I could not generate a response from the current documents.';
      }
      
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
  async function buildSystemPrompt(manifest) {
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

    prompt += `
## Using the think tool (Policy & Compliance Focus)
Before responding, pause and jot notes in the think tool when:
- A user request might conflict with HR, ethics, or compliance rules.
- You need to confirm whether company policies allow a specific action.
- Multiple documents must be cross-checked (e.g., Code of Conduct + Conflict of Interest).
- A vision summary is available for images/diagrams/architectures. Review the "Vision Context (summarized)" section and plan which details you'll cite.

In the think step, explicitly cover:
1. **Applicable Rules** – Which uploaded policy sections seem relevant?
2. **Information Gaps** – What details do you still need from the user (manager approval, employment status, etc.)?
3. **Compliance Risks** – Any potential violations, disclosure requirements, or approvals required?
4. **Plan** – Outline how you’ll answer (e.g., cite policy, recommend escalation, suggest record-keeping).
5. **Artifacts to Consult** – Note the summarized vision fields (components, connections, risks, QA pairs). If needed details are missing, request a clearer file or the original source.


<think_tool_example_1>
User asks: “Can I run a side business while working here?”
- Applicable docs: Conflicts of Interest Policy §§2-4, Code of Conduct §1.3.
- Need to confirm: type of business, overlap with company role, whether disclosure form filed.
- Risks: breaches of loyalty, use of company time/resources.
- Plan: reference disclosure requirement, advise notifying HR/compliance, highlight relevant clauses.
</think_tool_example_1>

<think_tool_example_2>
User asks: “May I accept a holiday hamper from a vendor?”
- Applicable docs: Gifts, Entertainment & Hospitality Policy §3, Anti-Bribery Policy §5.
- Need to confirm: gift value, vendor relationship, prior approvals.
- Risks: exceeding gift thresholds, perceived inducement.
- Plan: quote gift-limit table, require written approval, log in gift register, suggest alternative (donate to charity).
`;

    prompt += `
## Response Expectations
- After thinking, **always** deliver a final answer in the following structure:
  - ### Summary – Direct answer in 1–2 sentences.
  - ### Policy References – Cite document names and sections/clauses used.
  - ### Actions / Escalation – Concrete next steps (forms to submit, approvals, contacts).
  - ### References – Bullet list of every document consulted (filename + section).
- If the uploaded policies do **not** cover the request, state that clearly, list which files you checked, and advise an appropriate escalation path (e.g., HR, Compliance Officer, external authority).
- When quoting or paraphrasing, reference the policy title and section number if available.
- Emphasize compliance, duty of disclosure, and record-keeping where relevant.
- When diagram, architecture, topology, design, or blueprint files are present, proactively describe key components and architecture even if the user request is vague; use available vision extracts before asking for clarification.
`;

    if (!manifest) {
      prompt += `\nCurrently, no data has been uploaded. Please inform the user to upload their files first.`;
      return prompt;
    }

    try {
      const storage = getStorage();

      const readText = async key => {
        if (!key || typeof storage.read !== 'function') return '';
        try {
          const buffer = await storage.read(key);
          return buffer.toString('utf-8');
        } catch (err) {
          console.warn(`⚠️ Unable to read text artifact (${key}):`, err.message);
          return '';
        }
      };

      const readJson = async key => {
        if (!key) return null;
        const storage = getStorage();
        if (typeof storage.readJson === 'function') {
          try {
            return await storage.readJson(key);
          } catch (err) {
            console.warn(`⚠️ Unable to read JSON artifact (${key}):`, err.message);
          }
        }
        if (typeof storage.read === 'function') {
          try {
            const buffer = await storage.read(key);
            return JSON.parse(buffer.toString('utf-8'));
          } catch (err) {
            console.warn(`⚠️ Unable to parse JSON artifact (${key}):`, err.message);
          }
        }
        return null;
      };

      const loadVisionPayload = async entry => {
        const storage = getStorage();
        const parsedStorageKey = entry.artifacts?.parsedStorageKey || entry.artifacts?.parsedJsonKey || entry.artifacts?.jsonKey;
        if (parsedStorageKey) {
          const payload = await readJson(parsedStorageKey);
          if (payload) {
            return payload;
          }
        }

        const localPath = entry.artifacts?.parsedJsonPath
          ? path.resolve(PROJECT_ROOT, entry.artifacts.parsedJsonPath)
          : null;

        if (localPath && fs.existsSync(localPath)) {
          try {
            const raw = fs.readFileSync(localPath, 'utf-8');
            return JSON.parse(raw);
          } catch (err) {
            console.warn(`⚠️ Unable to parse local vision JSON (${localPath}):`, err.message);
          }
        }

        const storageKeyFallback = entry.artifacts?.jsonKey;
        if (storageKeyFallback) {
          return await readJson(storageKeyFallback);
        }

        return null;
      };

      prompt += `\n=== UPLOADED FILES (${manifest.totalFiles} total) ===\n`;
      prompt += `Tracking files: ${manifest.fileTypes.tracking}\n`;
      prompt += `Knowledge files: ${manifest.fileTypes.knowledge}\n`;
      prompt += `Other files: ${manifest.fileTypes.other}\n\n`;

      const formatTriageSummary = (fileEntry) => {
        if (!fileEntry?.triage) return '';
        const { route, reason, quality, recommendedTool } = fileEntry.triage;
        const qualitySummary = quality
          ? `Score: ${typeof quality.score === 'number' ? quality.score.toFixed(2) : quality.score} | Usable: ${quality.isUsable}`
          : '';
        const toolHint = recommendedTool ? ` | Recommended tool: ${recommendedTool}` : '';
        return `\nTriage -> Route: ${route}${toolHint}\nReason: ${reason}${qualitySummary ? `\n${qualitySummary}` : ''}\n`;
      };

      const structuredEntries = manifest.files.filter(file => (file.type || '').toLowerCase() === 'excel');
      if (structuredEntries.length > 0) {
        prompt += `\n=== STRUCTURED DATA (Excel/CSV) ===\n`;
        for (const entry of structuredEntries) {
          const data = await readJson(entry.artifacts?.jsonKey);
          prompt += `\nFile: ${entry.name}\n`;
          prompt += formatTriageSummary(entry);

          if (Array.isArray(data)) {
            prompt += `Records: ${data.length}\n`;
            if (data.length > 0) {
              prompt += `Columns: ${Object.keys(data[0]).join(', ')}\n`;
              if (data.length <= 100) {
                prompt += `\nData:\n${JSON.stringify(data, null, 2)}\n`;
              } else {
                prompt += `\nSample (first 10):\n${JSON.stringify(data.slice(0, 10), null, 2)}\n`;
                prompt += `\n[Full dataset available with ${data.length} records]\n`;
              }
            }
          } else if (data) {
            prompt += `⚠️ Structured data file parsed but not an array.\n`;
          } else {
            prompt += `⚠️ Structured data file not found in processed artifacts.\n`;
          }

          prompt += `\n---\n`;
        }
      }

      const summarizeVisionPayload = (payload) => {
        if (!payload || typeof payload !== 'object') {
          return null;
        }

        const docProfile = payload.document_profile || payload.document_metadata || {};
        const technical = payload.core_content?.technical_diagram;
        const risks = Array.isArray(payload.risks) ? payload.risks.slice(0, 5) : [];
        const qaPairs = Array.isArray(payload.qa_pairs) ? payload.qa_pairs.slice(0, 3) : [];

        const summary = {
          profile: {
            detected_type: docProfile.detected_type || payload.document_metadata?.detected_type || null,
            primary_purpose: docProfile.primary_purpose || null,
            confidence_score: docProfile.confidence_score || null
          },
          components: technical?.components?.slice(0, 8)?.map(component => ({
            name: component.component_name || component.name || null,
            type: component.component_type || null,
            criticality: component.criticality || null
          })) || [],
          connections: technical?.connections?.slice(0, 6)?.map(connection => ({
            source: connection.source_component || null,
            destination: connection.destination_component || null,
            type: connection.connection_type || null
          })) || [],
          risks: risks.map(risk => ({
            id: risk.risk_id || null,
            type: risk.risk_type || null,
            description: risk.description || null,
            impact: risk.impact || null,
            mitigation: risk.mitigation || risk.mitigation_recommendations || null
          })),
          qa_pairs: qaPairs.map(pair => ({
            question: pair.question || null,
            answer: pair.answer || null
          })),
          executive_summary: payload.executive_summary || null,
          detailed_summary: payload.detailed_summary ? `${payload.detailed_summary.substring(0, 800)}${payload.detailed_summary.length > 800 ? '...' : ''}` : null
        };

        return summary;
      };

      const knowledgeEntries = manifest.files.filter(file => ['pdf', 'docx', 'txt'].includes((file.type || '').toLowerCase()));
      if (knowledgeEntries.length > 0) {
        prompt += `\n=== KNOWLEDGE BASE (PDF/DOCX/Text) ===\n`;
        for (const entry of knowledgeEntries) {
          const textContent = await readText(entry.artifacts?.txtKey);

          prompt += `\nFile: ${entry.name}\n`;
          prompt += formatTriageSummary(entry);

          const visionPayload = await loadVisionPayload(entry);
          if (visionPayload) {
            prompt += `Vision JSON available -> ${entry.artifacts.parsedJsonPath || entry.artifacts.jsonKey}\n`;
            const excerpt = buildVisionExcerpt(visionPayload);
            if (excerpt) {
              prompt += `Vision Extract Summary:\n${excerpt}\n`;
            }
            const summarized = summarizeVisionPayload(visionPayload);
            if (summarized) {
              prompt += `Vision Context (summarized):\n${JSON.stringify(summarized, null, 2)}\n`;
            }
          }

          if (!textContent) {
            prompt += `⚠️ Text extraction unavailable for this file.\n`;
          } else {
            const nonPrintableMatches = textContent.match(/[^\x20-\x7E\s]/g) || [];
            const nonPrintableRatio = nonPrintableMatches.length / Math.max(textContent.length, 1);
            const hasUsableWords = /[A-Za-z]{4,}/.test(textContent);
            const isGarbled = textContent.length < 20 || 
                             /^[\s\n\r\t]+$/.test(textContent) || 
                             textContent.includes('\u0000') ||
                             textContent.includes('\u0001') ||
                             textContent.includes('\u0002') ||
                             (!hasUsableWords) ||
                             nonPrintableRatio > 0.8;

            if (isGarbled) {
              prompt += `⚠️ WARNING: This file appears to contain garbled or unreadable content.\n`;
              prompt += `Content preview (first 200 chars): ${textContent.substring(0, 200)}\n`;
              prompt += `If asked about this file, inform the user that the content is garbled and cannot be read.\n`;
            } else {
              const importantKeywords = [
                { label: 'sick leave', regex: /.{0,120}sick\s+(leave|days|policy).{0,160}/gi },
                { label: 'medical leave', regex: /.{0,160}medical\s+leave.{0,160}/gi },
                { label: 'paid time off', regex: /.{0,160}(paid\s+time\s+off|pto).{0,160}/gi },
                { label: 'vacation policy', regex: /.{0,160}vacation.{0,160}/gi }
              ];

              const highlights = [];
              for (const { label, regex } of importantKeywords) {
                const matches = [];
                let match;
                while ((match = regex.exec(textContent)) !== null && matches.length < 3) {
                  matches.push(match[0].replace(/\s+/g, ' ').trim());
                }
                if (matches.length > 0) {
                  highlights.push({ label, matches });
                }
              }

              if (highlights.length > 0) {
                prompt += `Key excerpts detected:\n`;
                for (const { label, matches } of highlights) {
                  prompt += `- ${label}: ${matches.join(' ... ')}\n`;
                }
                prompt += `\n`;
              }

              if (textContent.length <= 5000) {
                prompt += `Content:\n${textContent}\n`;
              } else {
                prompt += `Content (first 5000 chars):\n${textContent.substring(0, 5000)}...\n`;
                prompt += `[Document continues, total length: ${textContent.length} characters]\n`;
              }
            }
          }

          prompt += `\n---\n`;
        }
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

function logThinkSteps(response) {
  if (!response?.content) return;

  let thinkCount = 0;

  response.content.forEach(part => {
    if (part.type === 'tool_use' && part.name === 'think') {
      thinkCount++;
      const thought = part.input?.thought;
      if (thought) {
        console.log(`🧠 Think step ${thinkCount}: ${thought}`);
      }
    }
  });
}

function extractTextSegments(content = []) {
  return content
    .filter(part => part.type === 'text' && part.text?.trim())
    .map(part => part.text.trim());
}

function extractTextFromResponse(response) {
  if (!response?.content) {
    return 'No response generated';
  }

  const textSegments = extractTextSegments(response.content);

  if (textSegments.length === 0) {
    return 'No response generated';
  }

  return textSegments.join('\n\n');
}

/**
 * Helper: Extract specific PO data from tracking file
 * Used for quick lookups without loading all data into prompt
 */
export async function findPOData(poNumber, processedKeyPrefix) {
  try {
    const storage = getStorage();
    const key = path.join(processedKeyPrefix || '', 'tracking_main.json');
    if (!(await storage.exists(key))) {
      return null;
    }

    const buffer = await storage.read(key);
    const trackingData = JSON.parse(buffer.toString('utf-8'));

    const normalizedPO = poNumber?.toLowerCase?.() || '';
    if (!normalizedPO) return null;

    const found = trackingData.find(row => {
      return Object.values(row).some(value => {
        if (typeof value === 'string') {
          return value.toLowerCase().includes(normalizedPO);
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

