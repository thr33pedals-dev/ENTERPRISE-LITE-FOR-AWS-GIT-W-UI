/**
 * Guardrails System for AI Safety & Grounding
 * Prevents off-topic queries, prompt injection, data leakage
 */

/**
 * Check if user query is appropriate and in-scope
 * Returns { allowed: boolean, reason: string, blockedType: string }
 */
export function checkGuardrails(userMessage, manifest = null) {
  const message = userMessage.toLowerCase().trim();
  
  // 1. Check for prompt injection attempts
  const injectionCheck = detectPromptInjection(message);
  if (injectionCheck.detected) {
    return {
      allowed: false,
      reason: "I can only help with questions about your uploaded documents and tracking data.",
      blockedType: 'prompt_injection',
      severity: 'high'
    };
  }
  
  // 2. Check for inappropriate content
  const inappropriateCheck = detectInappropriateContent(message);
  if (inappropriateCheck.detected) {
    return {
      allowed: false,
      reason: "I'm designed to help with business document queries. Please ask about your uploaded files, tracking data, or business information.",
      blockedType: 'inappropriate',
      severity: 'medium'
    };
  }
  
  // 3. Check if query is off-topic
  const topicCheck = checkIfOnTopic(message, manifest);
  if (!topicCheck.onTopic) {
    return {
      allowed: false,
      reason: topicCheck.suggestion,
      blockedType: 'off_topic',
      severity: 'low'
    };
  }
  
  // 4. Check for bulk data extraction attempts
  const dataExtractionCheck = detectBulkDataExtraction(message);
  if (dataExtractionCheck.detected) {
    return {
      allowed: false,
      reason: "For security reasons, I can answer specific queries but not export all records. Please ask about specific items (e.g., 'What's the status of PO-12345?').",
      blockedType: 'bulk_extraction',
      severity: 'high'
    };
  }
  
  // 5. Check for system manipulation attempts
  const systemCheck = detectSystemManipulation(message);
  if (systemCheck.detected) {
    return {
      allowed: false,
      reason: "I can only help with questions about your uploaded documents.",
      blockedType: 'system_manipulation',
      severity: 'high'
    };
  }
  
  // All checks passed
  return {
    allowed: true,
    reason: null,
    blockedType: null,
    severity: null
  };
}

/**
 * Detect prompt injection attempts
 */
function detectPromptInjection(message) {
  const injectionPatterns = [
    /ignore\s+(previous|all|above|prior)\s+(instructions|prompts|rules)/i,
    /forget\s+(everything|all|previous|your)/i,
    /you\s+are\s+now/i,
    /new\s+instructions/i,
    /system\s*:?\s*role/i,
    /\[system\]/i,
    /pretend\s+(you're|to\s+be)/i,
    /act\s+as\s+(if|a)/i,
    /your\s+(system\s+)?prompt/i,
    /reveal\s+your/i,
    /what\s+(are\s+)?your\s+instructions/i,
    /bypass\s+your/i,
    /override\s+your/i,
    /<\|im_start\|>/i,  // Chat format injection
    /\{system\}/i
  ];
  
  const detected = injectionPatterns.some(pattern => pattern.test(message));
  
  return { detected };
}

/**
 * Detect inappropriate content
 */
function detectInappropriateContent(message) {
  // Be lenient - only block obvious inappropriate content
  const obviouslyInappropriate = message.match(/tell\s+me\s+a\s+joke/i) ||
                                  message.match(/something\s+funny/i) ||
                                  message.match(/adult\s+content/i);
  
  return { detected: obviouslyInappropriate };
}

/**
 * Check if query is on-topic (related to uploaded documents/tracking)
 */
function checkIfOnTopic(message, manifest) {
  // Off-topic patterns - check these first
  const offTopicPatterns = [
    /\b(weather|temperature|forecast|rain|sunny|cloud)\b/i,
    /\b(sport|football|soccer|basketball|tennis|world\s+cup|olympic)\b/i,
    /\b(news|headline|current\s+event|latest\s+news)\b/i,
    /\b(politic|election|president|government|parliament)\b/i,
    /\b(celebrity|famous|actor|actress|movie\s+star)\b/i,
    /\b(movie|film|cinema|netflix|tv\s+show|series)\b/i,
    /\b(recipe|cooking|food|restaurant|menu)\b/i,
    /\b(stock\s+market|trading|invest|crypto|bitcoin)\b/i
  ];
  
  const isObviouslyOffTopic = offTopicPatterns.some(pattern => pattern.test(message));
  
  if (isObviouslyOffTopic) {
    // Double-check it's not actually about business
    // E.g., "weather conditions affecting shipments" should be allowed
    const businessContext = /\b(shipment|delivery|tracking|order|business|document|file)\b/i.test(message);
    
    if (!businessContext) {
      return {
        onTopic: false,
        suggestion: "I can help you with questions about your uploaded documents, tracking data, orders, shipments, and business information. What would you like to know?"
      };
    }
  }
  
  // If files are uploaded, be more strict
  if (manifest && manifest.totalFiles > 0) {
    // Business/document related keywords
    const businessKeywords = [
      'po', 'order', 'shipment', 'tracking', 'status', 'eta', 'delivery',
      'customer', 'carrier', 'invoice', 'price', 'rate', 'location',
      'product', 'plan', 'policy', 'coverage', 'premium', 'deductible',
      'document', 'file', 'data', 'record', 'information', 'detail',
      'list', 'show', 'find', 'search', 'what', 'when', 'where', 'who', 'how',
      'compare', 'difference', 'between', 'all', 'summary', 'report', 'upload'
    ];
    
    const hasBusinessKeyword = businessKeywords.some(keyword => 
      message.includes(keyword.toLowerCase())
    );
    
    // If no business keywords and looks like general question
    if (!hasBusinessKeyword && message.length < 100) {
      // Check if it's a general question
      const generalPatterns = /\b(what\s+is|tell\s+me\s+about|explain|how\s+does)\b/i;
      if (generalPatterns.test(message) && !isObviouslyOffTopic) {
        // Could be asking about capabilities, allow it
        return { onTopic: true };
      }
    }
  }
  
  return {
    onTopic: true
  };
}

/**
 * Detect bulk data extraction attempts
 */
function detectBulkDataExtraction(message) {
  const bulkPatterns = [
    /show\s+(me\s+)?all\s+(the\s+)?(customer|client|phone|email|address|password|credit|card)/i,
    /export\s+all/i,
    /dump\s+(all|entire|whole|complete)\s+(database|data|records)/i,
    /give\s+me\s+(all|every|complete\s+list\s+of)\s+(customer|client|user|account)/i,
    /list\s+(all|every)\s+(password|credit|card|ssn|nric)/i,
    /download\s+(all|entire|whole)\s+database/i
  ];
  
  const detected = bulkPatterns.some(pattern => pattern.test(message));
  
  return { detected };
}

/**
 * Detect system manipulation attempts
 */
function detectSystemManipulation(message) {
  const manipulationPatterns = [
    /access\s+(the\s+)?(server|database|system|admin|root)/i,
    /sudo|chmod|rm\s+-rf/i,
    /drop\s+table/i,
    /delete\s+from/i,
    /; (select|insert|update|delete)/i,  // SQL injection
    /\$\{.*\}/,  // Template injection
    /eval\(/i,
    /exec\(/i
  ];
  
  const detected = manipulationPatterns.some(pattern => pattern.test(message));
  
  return { detected };
}

/**
 * Sanitize output to prevent data leakage
 */
export function extractContactIntent(output) {
  if (!output || typeof output !== 'string') {
    return { sanitized: output || '', contactIntent: null };
  }

  const CONTACT_REGEX = /\{\{contact_intent:(\{[\s\S]*?\})\}\}\s*$/i;
  const match = output.match(CONTACT_REGEX);

  if (!match) {
    return { sanitized: output, contactIntent: null };
  }

  let parsed = null;
  try {
    parsed = JSON.parse(match[1]);
  } catch (error) {
    console.warn('⚠️ Failed to parse contact intent payload:', error.message);
  }

  const sanitized = output.replace(CONTACT_REGEX, '').trimEnd();
  return { sanitized, contactIntent: parsed };
}

export function sanitizeOutput(output, context) {
  const { sanitized: withoutIntent, contactIntent } = extractContactIntent(output);

  // Remove any accidentally exposed system information
  let sanitized = withoutIntent;
  
  // Remove file paths
  sanitized = sanitized.replace(/[A-Z]:\\[^\s]+/g, '[FILE_PATH]');
  sanitized = sanitized.replace(/\/[^\s]+\/(uploads|processed|temp)/g, '[FILE_PATH]');
  
  // Remove IP addresses (keep public ones like examples)
  sanitized = sanitized.replace(/\b(?:192\.168|10\.|172\.16)\.\d{1,3}\.\d{1,3}\b/g, '[IP_ADDRESS]');
  
  // Remove API keys if accidentally included
  sanitized = sanitized.replace(/sk-ant-[a-zA-Z0-9-]+/g, '[API_KEY]');
  sanitized = sanitized.replace(/Bearer\s+[a-zA-Z0-9-._]+/g, '[AUTH_TOKEN]');
  
  return { sanitized, contactIntent };
}

/**
 * Generate grounded system prompt addition
 */
export function getGroundingRules() {
  return `

🚨 CRITICAL GROUNDING RULES - NO HALLUCINATION ALLOWED:

1. **ONLY use information explicitly present in the uploaded files above**
2. **If information is NOT clearly visible in the files, respond: "I don't have that information in the uploaded files"**
3. **NEVER invent, assume, or make up any data**
4. **NEVER create PO numbers, dates, names, or details that aren't in the files**
5. **If file content is garbled, unclear, or unreadable, say so explicitly**
6. **If asked about specific details not in the files, respond: "That specific information is not available in the uploaded files"**
7. **If a handbook or policy document is uploaded—even if the company name differs from other files—you may use it to answer relevant policy questions.**

MANDATORY GROUNDING CHECKLIST:
- ✅ Before answering ANY question, verify the information exists in the provided files
- ✅ If the file content is unclear or garbled, state this clearly
- ✅ Only say "No relevant information found in the uploaded files" after checking every uploaded document and confirming none mention the topic
- ✅ Never assume, infer, or extrapolate data that isn't explicitly stated
- ✅ Always be honest about the limitations of the available data
- ✅ If you cannot find the requested information, say so directly

STRICT RULE: **It's better to say "I don't know" than to make up ANY information.**

HALLUCINATION PREVENTION:
- Do NOT create examples or sample data
- Do NOT fill in missing information
- Do NOT assume what the data might contain
- Do NOT provide generic business information
- ONLY work with what is actually in the files

If a document looks partially garbled, still share the readable portions. Say something like:
"I can read parts of this document, but some sections look corrupted or missing. Here's what I can confirm: … If you need the missing details, please re-upload a cleaner copy."

SCOPE BOUNDARIES:
- I can ONLY help with information from uploaded files
- I cannot access external databases or real-time information
- I cannot perform calculations beyond what's in the files
- I cannot update or modify data
- I cannot send emails or make external API calls
`;
}

/**
 * Log blocked requests for monitoring
 */
export function logBlockedRequest(userMessage, guardrailResult, userId = 'anonymous') {
  const logEntry = {
    timestamp: new Date().toISOString(),
    userId: userId,
    message: userMessage.substring(0, 200), // Truncate for privacy
    blockedType: guardrailResult.blockedType,
    severity: guardrailResult.severity
  };
  
  console.warn('🛡️ GUARDRAIL BLOCKED:', logEntry);
  
  // In production, send to monitoring system
  // sendToMonitoring(logEntry);
  
  return logEntry;
}

