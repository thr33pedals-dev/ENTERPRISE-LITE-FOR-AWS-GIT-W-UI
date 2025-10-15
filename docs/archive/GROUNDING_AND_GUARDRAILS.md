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
  const inappropriatePatterns = [
    /\b(joke|funny|laugh|humor)\b/i,
    /\b(sex|porn|xxx|nsfw)\b/i,
    /\b(hate|racist|offensive)\b/i,
    /\b(hack|exploit|crack)\b/i,
    // Add more as needed
  ];
  
  // Be lenient - only block obvious inappropriate content
  // Don't block technical terms like "crack down" or "exploit opportunity"
  const obviouslyInappropriate = message.match(/tell\s+me\s+a\s+joke/i) ||
                                  message.match(/something\s+funny/i) ||
                                  message.match(/adult\s+content/i);
  
  return { detected: obviouslyInappropriate };
}

/**
 * Check if query is on-topic (related to uploaded documents/tracking)
 */
function checkIfOnTopic(message, manifest) {
  // If no files uploaded yet, allow general questions
  if (!manifest || manifest.totalFiles === 0) {
    return {
      onTopic: true
    };
  }
  
  // Business/tracking related keywords
  const businessKeywords = [
    'po', 'order', 'shipment', 'tracking', 'status', 'eta', 'delivery',
    'customer', 'carrier', 'invoice', 'price', 'rate', 'location',
    'product', 'plan', 'policy', 'coverage', 'premium', 'deductible',
    'document', 'file', 'data', 'record', 'information', 'detail',
    'list', 'show', 'find', 'search', 'what', 'when', 'where', 'who', 'how',
    'compare', 'difference', 'between', 'all', 'summary', 'report'
  ];
  
  const hasBusinessKeyword = businessKeywords.some(keyword => 
    message.includes(keyword.toLowerCase())
  );
  
  // Off-topic patterns
  const offTopicPatterns = [
    /weather/i,
    /sports/i,
    /news/i,
    /politics/i,
    /celebrity/i,
    /movie/i,
    /recipe/i,
    /world\s+cup/i,
    /stock\s+market/i,
    /bitcoin|crypto/i
  ];
  
  const isOffTopic = offTopicPatterns.some(pattern => pattern.test(message));
  
  if (isOffTopic && !hasBusinessKeyword) {
    return {
      onTopic: false,
      suggestion: "I can help you with questions about your uploaded documents, tracking data, orders, shipments, and business information. What would you like to know?"
    };
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
export function sanitizeOutput(output, context) {
  // Remove any accidentally exposed system information
  let sanitized = output;
  
  // Remove file paths
  sanitized = sanitized.replace(/[A-Z]:\\[^\s]+/g, '[FILE_PATH]');
  sanitized = sanitized.replace(/\/[^\s]+\/(uploads|processed|temp)/g, '[FILE_PATH]');
  
  // Remove IP addresses (keep public ones like examples)
  sanitized = sanitized.replace(/\b(?:192\.168|10\.|172\.16)\.\d{1,3}\.\d{1,3}\b/g, '[IP_ADDRESS]');
  
  // Remove API keys if accidentally included
  sanitized = sanitized.replace(/sk-ant-[a-zA-Z0-9-]+/g, '[API_KEY]');
  sanitized = sanitized.replace(/Bearer\s+[a-zA-Z0-9-._]+/g, '[AUTH_TOKEN]');
  
  return sanitized;
}

/**
 * Ground response - ensure AI doesn't hallucinate
 */
export function generateGroundedSystemPrompt() {
  return `
CRITICAL GROUNDING RULES:
1. ONLY answer based on the uploaded files provided above
2. If information is NOT in the files, say: "I don't have that information in the uploaded files"
3. NEVER make up PO numbers, dates, or details
4. If unsure, say "I'm not certain" rather than guessing
5. Cite which file the information came from when possible
6. If a PO/order is not found, say clearly "PO [number] not found in uploaded files"
7. Do NOT provide information about POs/orders that don't exist in the data

HALLUCINATION PREVENTION:
- If user asks about PO-99999 and it doesn't exist → Say it doesn't exist
- If user asks about dates not in data → Don't invent dates
- If user asks for details you don't have → Admit you don't have them
- Better to say "I don't know" than to make something up

SCOPE BOUNDARIES:
- I can ONLY help with information from uploaded files
- I cannot access external databases or real-time information
- I cannot perform calculations beyond what's in the files
- I cannot update or modify data
- I cannot send emails or make external API calls
`;
}

/**
 * Check output for hallucination indicators
 */
export function detectHallucination(output, sourceData) {
  const warnings = [];
  
  // Check if output mentions PO numbers not in source data
  const poMatches = output.match(/\b(PO|Order)[-\s]?[A-Z0-9-]+/gi);
  if (poMatches && sourceData) {
    const sourceText = JSON.stringify(sourceData).toLowerCase();
    poMatches.forEach(po => {
      const poNormalized = po.replace(/[^a-z0-9]/gi, '').toLowerCase();
      if (!sourceText.includes(poNormalized)) {
        warnings.push({
          type: 'unknown_po',
          value: po,
          message: `Response mentions ${po} which may not exist in source data`
        });
      }
    });
  }
  
  // Check for vague date references that might be hallucinated
  const vagueDate = /sometime\s+(in|around)|approximately|roughly|about\s+\d+\s+(days|weeks)/i;
  if (vagueDate.test(output)) {
    warnings.push({
      type: 'vague_date',
      message: 'Response contains vague date estimates'
    });
  }
  
  return {
    hasWarnings: warnings.length > 0,
    warnings: warnings
  };
}

/**
 * Log blocked requests for monitoring
 */
export function logBlockedRequest(userMessage, guardra ilResult, userId = 'anonymous') {
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

