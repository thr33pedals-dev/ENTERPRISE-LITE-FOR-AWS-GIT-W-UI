import crypto from 'node:crypto';

export function attachRequestContext(req, res, next) {
  req.context = {
    tenantId: req.tenantId || 'anonymous',
    requestId: req.headers['x-request-id'] || crypto.randomUUID(),
    receivedAt: Date.now()
  };

  res.setHeader('x-request-id', req.context.requestId);
  next();
}

