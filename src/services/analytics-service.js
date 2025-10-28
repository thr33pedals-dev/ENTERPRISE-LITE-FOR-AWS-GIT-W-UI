import dataStore from './data-store.js';
import { sanitizeTenantId } from '../file-processor.js';

const COLLECTION = 'usage_analytics';

function normalizeTenantId(rawTenantId) {
  return sanitizeTenantId(rawTenantId || 'default') || 'default';
}

export async function listAnalyticsRecords({ tenantId, type, personaId = null, limit = 500 } = {}) {
  const normalizedTenant = normalizeTenantId(tenantId);
  const records = await dataStore.list(
    COLLECTION,
    record => {
      if (!record) return false;
      if (normalizeTenantId(record.tenantId) !== normalizedTenant) return false;
      if (type && record.ai_type !== type) return false;
      if (personaId && record.persona && record.persona !== personaId) return false;
      return true;
    },
    { tenantId: normalizedTenant, personaId }
  );

  if (!Array.isArray(records)) {
    return [];
  }

  const sorted = [...records].sort((a, b) => {
    const aTime = new Date(a.usage_date || a.createdAt || 0).getTime();
    const bTime = new Date(b.usage_date || b.createdAt || 0).getTime();
    return bTime - aTime;
  });

  return limit > 0 ? sorted.slice(0, limit) : sorted;
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
  recordAnalyticsEvent
};

