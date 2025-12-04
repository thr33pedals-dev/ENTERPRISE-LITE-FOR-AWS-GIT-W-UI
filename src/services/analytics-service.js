import dataStore from './data-store.js';
import { sanitizeTenantId } from '../file-processor.js';

const COLLECTION = 'usage_analytics';

function normalizeTenantId(rawTenantId) {
  return sanitizeTenantId(rawTenantId || 'default') || 'default';
}

// Map action/persona to AI type
function getAiTypeFromRecord(record) {
  if (!record) return null;
  
  // First check explicit ai_type
  if (record.ai_type) return record.ai_type;
  
  // Check persona field (most reliable for chat events)
  const persona = record.persona;
  if (persona === 'sales' || persona === 'chat') return 'sales';
  if (persona === 'support') return 'support';
  if (persona === 'interview') return 'interview';
  
  // Fall back to action-based detection
  const action = record.action;
  if (!action) return null;
  if (action.includes('sales')) return 'sales';
  if (action.includes('support')) return 'support';
  if (action.includes('interview')) return 'interview';
  if (action === 'chat_message' || action === 'chat_interaction') return 'sales'; // Default chat to sales
  
  return null;
}

export async function listAnalyticsRecords({ tenantId, type, personaId = null, limit = 500 } = {}) {
  const normalizedTenant = normalizeTenantId(tenantId);
  
  // Try to load from multiple persona paths to aggregate all events
  const personasToCheck = personaId ? [personaId] : ['sales', 'support', 'interview', null];
  let allRecords = [];
  
  for (const persona of personasToCheck) {
    try {
      const records = await dataStore.list(
        COLLECTION,
        record => {
          if (!record) return false;
          if (normalizeTenantId(record.tenantId) !== normalizedTenant) return false;
          // Check type using persona and action fields
          if (type) {
            const recordType = getAiTypeFromRecord(record);
            if (recordType !== type) return false;
          }
          return true;
        },
        { tenantId: normalizedTenant, personaId: persona }
      );
      if (Array.isArray(records)) {
        allRecords = allRecords.concat(records);
      }
    } catch (err) {
      // Ignore errors for missing persona paths
    }
  }

  // Deduplicate by id
  const seen = new Set();
  const unique = allRecords.filter(r => {
    if (!r.id || seen.has(r.id)) return false;
    seen.add(r.id);
    return true;
  });

  const sorted = unique.sort((a, b) => {
    const aTime = new Date(a.usage_date || a.occurredAt || a.createdAt || 0).getTime();
    const bTime = new Date(b.usage_date || b.occurredAt || b.createdAt || 0).getTime();
    return bTime - aTime;
  });

  return limit > 0 ? sorted.slice(0, limit) : sorted;
}

// Get aggregated metrics from actual data
export async function getAnalyticsSummary(tenantId) {
  const normalizedTenant = normalizeTenantId(tenantId);
  
  // Load all analytics events
  const allEvents = await listAnalyticsRecords({ tenantId: normalizedTenant, limit: 10000 });
  
  // Categorize by type
  const salesEvents = allEvents.filter(e => getAiTypeFromRecord(e) === 'sales');
  const supportEvents = allEvents.filter(e => getAiTypeFromRecord(e) === 'support');
  const interviewEvents = allEvents.filter(e => getAiTypeFromRecord(e) === 'interview');
  
  return {
    sales: {
      totalInteractions: salesEvents.length,
      successfulInteractions: salesEvents.filter(e => e.success !== false).length,
      leadsGenerated: salesEvents.filter(e => e.metadata?.contactIntent).length
    },
    support: {
      totalInteractions: supportEvents.length,
      resolved: supportEvents.filter(e => e.success !== false).length,
      escalations: supportEvents.filter(e => e.metadata?.contactIntent?.type === 'support_escalation').length
    },
    interview: {
      totalSessions: interviewEvents.length,
      completed: interviewEvents.filter(e => e.action === 'interview_completed' || e.metadata?.status === 'completed').length
    },
    lastUpdated: new Date().toISOString()
  };
}

export async function recordAnalyticsEvent(event = {}) {
  const {
    tenantId,
    companyId,
    ai_type,
    persona,
    usage_date = new Date().toISOString(),
    session_duration = null,
    success = true,
    metadata = null
  } = event;

  if (!ai_type) {
    throw new Error('recordAnalyticsEvent requires an ai_type');
  }

  const normalizedTenant = normalizeTenantId(tenantId);

  return dataStore.create(
    COLLECTION,
    {
      tenantId: normalizedTenant,
      company_id: companyId || null,
      ai_type,
      persona: persona || null,
      usage_date,
      session_duration,
      success,
      metadata
    },
    { tenantId: normalizedTenant, personaId: persona || null }
  );
}

export default {
  listAnalyticsRecords,
  recordAnalyticsEvent,
  getAnalyticsSummary
};

