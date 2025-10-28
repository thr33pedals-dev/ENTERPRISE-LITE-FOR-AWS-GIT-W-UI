export function normalizeSegment(value, fallback = 'default') {
  const base = (value ?? fallback).toString().toLowerCase();
  const sanitized = base
    .replace(/[^a-z0-9-_]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);

  return sanitized || fallback;
}

function joinSegments(...parts) {
  return parts
    .map(part => (part ?? '').toString().replace(/^\/+|\/+$/g, ''))
    .filter(Boolean)
    .join('/');
}

export function tenantSegment(tenantId) {
  return normalizeSegment(tenantId, 'default');
}

export function personaSegment(personaId) {
  return normalizeSegment(personaId, 'default');
}

export function safeSegment(value, fallback = 'default') {
  return normalizeSegment(value, fallback);
}

export function tenantPersonaPrefix(tenantId, personaId) {
  return joinSegments(tenantSegment(tenantId), personaSegment(personaId));
}

export function rawPrefix(tenantId, personaId) {
  return joinSegments(tenantPersonaPrefix(tenantId, personaId), 'raw');
}

export function processedPrefix(tenantId, personaId) {
  return joinSegments(tenantPersonaPrefix(tenantId, personaId), 'processed');
}

export function transcriptsPrefix(tenantId, personaId) {
  return joinSegments(tenantPersonaPrefix(tenantId, personaId), 'transcripts');
}

export function manifestsKey(tenantId, personaId) {
  return joinSegments(processedPrefix(tenantId, personaId), 'manifest.json');
}

export function buildRawKey(tenantId, personaId, ...segments) {
  return joinSegments(rawPrefix(tenantId, personaId), ...segments);
}

export function buildProcessedKey(tenantId, personaId, ...segments) {
  return joinSegments(processedPrefix(tenantId, personaId), ...segments);
}

export function buildTranscriptKey(tenantId, personaId, conversationId, ...segments) {
  return joinSegments(transcriptsPrefix(tenantId, personaId), conversationId, ...segments);
}

export function buildCustomKey(tenantId, personaId, ...segments) {
  return joinSegments(processedPrefix(tenantId, personaId), ...segments);
}

export function ensureKeyWithinTenant(tenantId, personaId, key) {
  const prefix = tenantPersonaPrefix(tenantId, personaId);
  if (!prefix) return key;
  if ((key ?? '').startsWith(`${prefix}/`)) {
    return key;
  }
  return joinSegments(prefix, key);
}

export default {
  tenantSegment,
  personaSegment,
  tenantPersonaPrefix,
  rawPrefix,
  processedPrefix,
  transcriptsPrefix,
  manifestsKey,
  buildRawKey,
  buildProcessedKey,
  buildTranscriptKey,
  buildCustomKey,
  ensureKeyWithinTenant,
  normalizeSegment,
  safeSegment
};

