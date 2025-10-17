import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(path.join(__dirname, '..'));

export function resolveArtifactPath(relativePath) {
  if (!relativePath) return null;
  if (path.isAbsolute(relativePath)) {
    return relativePath;
  }
  return path.resolve(PROJECT_ROOT, relativePath);
}

export function loadJsonIfExists(targetPath) {
  if (!targetPath) return null;
  try {
    if (!fs.existsSync(targetPath)) return null;
    const raw = fs.readFileSync(targetPath, 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    console.warn(`Unable to load JSON from ${targetPath}:`, err.message);
    return null;
  }
}

export function buildVisionExcerpt(payload) {
  if (!payload || typeof payload !== 'object') return '';

  const lines = [];
  const meta = payload.document_metadata || {};
  if (meta.title || meta.detected_type) {
    lines.push(`Title: ${meta.title || 'Unknown'}`);
    lines.push(`Type: ${meta.detected_type || 'unspecified'}, Pages: ${meta.pages ?? 'n/a'}`);
  }

  const sections = payload.hierarchical_content?.sections || [];
  if (sections.length > 0) {
    const topSections = sections.slice(0, 3).map(section => {
      const childCount = section.subsections?.length || 0;
      return `${section.section_id || 'n/a'} (${childCount} subsections)`;
    });
    lines.push(`Top Sections: ${topSections.join('; ')}`);
  }

  const tables = payload.structured_data_tables?.tables || [];
  if (tables.length > 0) {
    lines.push(`Tables extracted: ${tables.length}`);
  }

  const clauses = payload.terms_conditions_clauses?.clauses || [];
  if (clauses.length > 0) {
    const topClauses = clauses.slice(0, 3).map(clause => clause.clause_number || 'n/a');
    lines.push(`Clauses: ${topClauses.join(', ')}${clauses.length > 3 ? '...' : ''}`);
  }

  return lines.join('\n');
}

export function renderVisionContext(payload) {
  if (!payload || typeof payload !== 'object') {
    return '';
  }

  const lines = [];
  const meta = payload.document_metadata || {};
  lines.push(JSON.stringify({
    title: meta.title || 'Unknown',
    detected_type: meta.detected_type || 'unspecified',
    pages: meta.pages ?? null,
    source: payload.source || null,
    generated_at: payload.metadata?.generated_at || null
  }, null, 2));

  const sections = payload.hierarchical_content?.sections || [];
  if (sections.length > 0) {
    lines.push('\nSections:');
    sections.forEach(section => {
      lines.push(`- ${section.section_id || 'n/a'}: ${section.section_title || ''}`);
      (section.subsections || []).slice(0, 5).forEach(sub => {
        lines.push(`  - ${sub.subsection_id || 'n/a'} (${(sub.items || []).length} items)`);
      });
    });
  }

  const tables = payload.structured_data_tables?.tables || [];
  if (tables.length > 0) {
    lines.push('\nTables (first 3):');
    tables.slice(0, 3).forEach(table => {
      lines.push(`- ${table.table_title || 'Table'} | rows=${(table.rows || []).length}`);
    });
  }

  return lines.join('\n');
}
