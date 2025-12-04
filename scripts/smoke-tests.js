// Automated smoke tests invoking key API endpoints with mocked data
import http from 'http';
import fs from 'fs';
import path from 'path';
import assert from 'assert/strict';

const BASE_URL = process.env.SMOKE_BASE_URL || 'http://localhost:3000';
const TENANT_ID = process.env.SMOKE_TENANT_ID || 'preview-company';
const SALES_PERSONA = process.env.SMOKE_SALES_PERSONA || 'sales';
const SUPPORT_PERSONA = process.env.SMOKE_SUPPORT_PERSONA || 'support';
const TEST_EMAIL = process.env.SMOKE_TEST_EMAIL || 'smoke@example.com';
const DEFAULT_PERSONA_IDS = ['sales', 'support', 'interview'];
const SALES_UPLOAD_FILES = [
  { path: 'examples/3_Pricing_Rates.xlsx', filename: '3_Pricing_Rates.xlsx', contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
  { path: 'examples/pdf/Employee_Brochure_MultiColumn.pdf', filename: 'Employee_Brochure_MultiColumn.pdf', contentType: 'application/pdf' }
];
const SUPPORT_UPLOAD_FILES = [
  { path: 'examples/1_Daily_Tracking.csv', filename: '1_Daily_Tracking.csv', contentType: 'text/csv' },
  { path: 'examples/4_Product_Catalog.txt', filename: '4_Product_Catalog.txt', contentType: 'text/plain' },
  { path: 'examples/pdf/Propose Network Topology - v3.drawio.pdf', filename: 'Propose Network Topology - v3.drawio.pdf', contentType: 'application/pdf' }
];

function log(step, message) {
  console.log(`✅ [${step}] ${message}`);
}

function request({ method, route, headers = {}, body }) {
  const payload = body ? JSON.stringify(body) : null;
  const options = new URL(route, BASE_URL);
  const requestOptions = {
    method,
    hostname: options.hostname,
    port: options.port,
    path: `${options.pathname}${options.search}`,
    headers: {
      'Content-Type': 'application/json',
      'x-tenant-id': TENANT_ID,
      ...headers,
    },
  };

  return new Promise((resolve, reject) => {
    const req = http.request(requestOptions, res => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = data ? JSON.parse(data) : null;
          if (res.statusCode >= 400) {
            const error = new Error(parsed?.error || `Request failed (${res.statusCode})`);
            error.response = parsed;
            error.statusCode = res.statusCode;
            reject(error);
          } else {
            resolve(parsed);
          }
        } catch (err) {
          reject(err);
        }
      });
    });

    req.on('error', reject);

    if (payload) {
      req.write(payload);
    }

    req.end();
  });
}

function buildMultipartPayload(files, persona) {
  const boundary = `----smokeTestBoundary${Date.now()}`;
  const buffers = [];

  files.forEach(({ path: filePath, filename, contentType }) => {
    const absolutePath = path.resolve(filePath);
    if (!fs.existsSync(absolutePath)) {
      throw new Error(`Missing smoke fixture: ${absolutePath}`);
    }
    const fileContents = fs.readFileSync(absolutePath);
    buffers.push(Buffer.from(`--${boundary}\r\n`));
    buffers.push(Buffer.from(`Content-Disposition: form-data; name="files"; filename="${filename}"\r\n`));
    buffers.push(Buffer.from(`Content-Type: ${contentType}\r\n\r\n`));
    buffers.push(fileContents);
    buffers.push(Buffer.from(`\r\n`));
  });

  if (persona) {
    buffers.push(Buffer.from(`--${boundary}\r\n`));
    buffers.push(Buffer.from('Content-Disposition: form-data; name="persona"\r\n\r\n'));
    buffers.push(Buffer.from(persona));
    buffers.push(Buffer.from(`\r\n`));
  }

  buffers.push(Buffer.from(`--${boundary}--\r\n`));
  return { boundary, payload: Buffer.concat(buffers) };
}

async function upload(files, persona) {
  const { boundary, payload } = buildMultipartPayload(files, persona);
  const options = new URL('/api/upload', BASE_URL);
  const requestOptions = {
    method: 'POST',
    hostname: options.hostname,
    port: options.port,
    path: `${options.pathname}${options.search}`,
    headers: {
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
      'Content-Length': payload.length,
      'x-tenant-id': TENANT_ID,
      ...(persona ? { 'x-persona-id': persona } : {})
    },
  };

  return new Promise((resolve, reject) => {
    const req = http.request(requestOptions, res => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = data ? JSON.parse(data) : null;
          if (res.statusCode >= 400) {
            reject(new Error(parsed?.error || `Upload failed (${res.statusCode})`));
          } else {
            resolve(parsed);
          }
        } catch (err) {
          reject(err);
        }
      });
    });

    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

async function verifyDefaultPersonas() {
  const randomTenant = `smoke-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const response = await request({
    method: 'GET',
    route: '/api/personas',
    headers: { 'x-tenant-id': randomTenant }
  });

  assert.equal(response?.success, true, 'Persona list should succeed for new tenant');
  const personas = Array.isArray(response?.data) ? response.data : [];
  assert.ok(personas.length >= DEFAULT_PERSONA_IDS.length, 'New tenant should receive default personas');
  const personaKeys = personas.map(persona => persona.personaId || persona.id);
  DEFAULT_PERSONA_IDS.forEach(expected => {
    assert.ok(personaKeys.includes(expected), `Default persona '${expected}' should be present`);
  });

  log('personas-defaults', `Default personas seeded for tenant ${randomTenant}`);
}

async function verifyManifest(persona) {
  const manifest = await request({ method: 'GET', route: '/api/status', headers: { 'x-persona-id': persona } });
  assert.equal(manifest?.success, true, `${persona} manifest should load`);
  const files = manifest?.manifest?.files || manifest?.files || [];
  assert.ok(files.length > 0, `${persona} manifest should contain files`);
  const hasVision = files.some(file => file.metadata?.visionArtifacts || file.metadata?.visionArtifacts?.parsedStorageKey || file.triage?.route === 'vision_pdf');
  assert.ok(hasVision, `${persona} manifest should include vision entries`);
  log(`${persona}-manifest`, `Manifest contains ${files.length} file(s) with vision coverage`);
}

async function runSmokeTests() {
  console.log('🚬 Starting persona smoke tests...');

  await verifyDefaultPersonas();

  // Status check (tenant baseline)
  await verifyManifest(SALES_PERSONA);

  // Sales upload & chat
  const salesUpload = await upload(SALES_UPLOAD_FILES, SALES_PERSONA);
  assert.equal(salesUpload?.success, true, 'Sales upload should succeed');
  log('sales-upload', 'Sales persona upload succeeded');

  await verifyManifest(SALES_PERSONA);

  const salesChat = await request({
    method: 'POST',
    route: '/api/chat',
    headers: { 'x-persona-id': SALES_PERSONA },
    body: {
      message: 'Summarize the latest asset inventory.',
      conversationHistory: [],
    },
  });
  assert.equal(salesChat?.success, true, 'Sales chat should respond successfully');
  log('sales-chat', 'Sales chat endpoint returned response');

  // Support upload & chat
  const supportUpload = await upload(SUPPORT_UPLOAD_FILES, SUPPORT_PERSONA);
  assert.equal(supportUpload?.success, true, 'Support upload should succeed');
  log('support-upload', 'Support persona upload succeeded');

  await verifyManifest(SUPPORT_PERSONA);

  const supportChat = await request({
    method: 'POST',
    route: '/api/chat',
    headers: { 'x-persona-id': SUPPORT_PERSONA },
    body: {
      message: 'How should I respond to a late delivery question?',
      conversationHistory: [],
    },
  });
  assert.equal(supportChat?.success, true, 'Support chat should respond successfully');
  log('support-chat', 'Support chat endpoint returned response');

  // Transcript list & analytics
  const transcripts = await request({ method: 'GET', route: '/api/transcripts', headers: { 'x-persona-id': SUPPORT_PERSONA } });
  assert.equal(transcripts?.success, true, 'Transcript list should succeed');
  log('transcripts', `Transcript list retrieved (${transcripts?.data?.length || 0}) entries`);

  const analytics = await request({
    method: 'POST',
    route: '/api/analytics',
    headers: { 'x-persona-id': SUPPORT_PERSONA },
    body: {
      ai_type: SUPPORT_PERSONA,
      usage_date: new Date().toISOString(),
      session_duration: 5,
      success: true,
      metadata: { source: 'smoke-test' },
    },
  });
  assert.equal(analytics?.success, true, 'Analytics event should succeed');
  log('analytics', 'Analytics event recorded');

  console.log('✅ Persona smoke tests passed');
}

runSmokeTests().catch(error => {
  console.error('❌ Smoke tests failed:', error);
  process.exitCode = 1;
});
