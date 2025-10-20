import rateLimit from 'express-rate-limit';

const parsedApiKeys = (() => {
  try {
    return JSON.parse(process.env.API_KEYS || '{}');
  } catch (err) {
    return {};
  }
})();

export function authenticateRequest(req, res, next) {
  const providedKey = req.headers['x-api-key'] || req.query.apiKey;
  if (!providedKey) {
    return res.status(401).json({ success: false, error: 'API key required' });
  }

  const tenant = Object.keys(parsedApiKeys).find(
    tenantId => parsedApiKeys[tenantId] === providedKey
  );

  if (!tenant) {
    return res.status(403).json({ success: false, error: 'Invalid API key' });
  }

  req.tenantId = tenant;
  next();
}

export const apiRateLimiter = rateLimit({
  windowMs: parseInt(process.env.API_RATE_LIMIT_WINDOW_MS || '60000', 10),
  max: parseInt(process.env.API_RATE_LIMIT_MAX || '120', 10),
  standardHeaders: true,
  legacyHeaders: false
});

