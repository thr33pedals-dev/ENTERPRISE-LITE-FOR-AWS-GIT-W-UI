/**
 * Structured Logger for Enterprise Lite
 * Outputs JSON logs for CloudWatch compatibility
 */

const LOG_LEVELS = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3
};

const currentLevel = LOG_LEVELS[process.env.LOG_LEVEL?.toLowerCase()] ?? LOG_LEVELS.info;

function formatLog(level, message, meta = {}) {
  const timestamp = new Date().toISOString();
  
  const logEntry = {
    timestamp,
    level,
    message,
    service: 'enterprise-lite',
    environment: process.env.NODE_ENV || 'development',
    ...meta
  };

  // Add request context if available
  if (meta.tenantId) logEntry.tenantId = meta.tenantId;
  if (meta.personaId) logEntry.personaId = meta.personaId;
  if (meta.companyId) logEntry.companyId = meta.companyId;
  if (meta.requestId) logEntry.requestId = meta.requestId;
  if (meta.userId) logEntry.userId = meta.userId;

  // Handle errors specially
  if (meta.error instanceof Error) {
    logEntry.error = {
      name: meta.error.name,
      message: meta.error.message,
      stack: meta.error.stack
    };
    delete meta.error;
  }

  return JSON.stringify(logEntry);
}

function shouldLog(level) {
  return LOG_LEVELS[level] <= currentLevel;
}

const logger = {
  error(message, meta = {}) {
    if (shouldLog('error')) {
      console.error(formatLog('error', message, meta));
    }
  },

  warn(message, meta = {}) {
    if (shouldLog('warn')) {
      console.warn(formatLog('warn', message, meta));
    }
  },

  info(message, meta = {}) {
    if (shouldLog('info')) {
      console.log(formatLog('info', message, meta));
    }
  },

  debug(message, meta = {}) {
    if (shouldLog('debug')) {
      console.log(formatLog('debug', message, meta));
    }
  },

  /**
   * Create a child logger with preset context
   */
  child(context = {}) {
    return {
      error: (msg, meta = {}) => logger.error(msg, { ...context, ...meta }),
      warn: (msg, meta = {}) => logger.warn(msg, { ...context, ...meta }),
      info: (msg, meta = {}) => logger.info(msg, { ...context, ...meta }),
      debug: (msg, meta = {}) => logger.debug(msg, { ...context, ...meta })
    };
  },

  /**
   * Log API request (for middleware)
   */
  request(req, res, duration) {
    const meta = {
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      tenantId: req.tenantId,
      personaId: req.personaId,
      userAgent: req.headers['user-agent'],
      ip: req.ip || req.headers['x-forwarded-for']
    };

    if (res.statusCode >= 500) {
      logger.error('Request failed', meta);
    } else if (res.statusCode >= 400) {
      logger.warn('Request error', meta);
    } else {
      logger.info('Request completed', meta);
    }
  },

  /**
   * Log billing/usage event
   */
  usage(event, meta = {}) {
    logger.info(`Usage: ${event}`, {
      ...meta,
      eventType: 'usage',
      billingEvent: true
    });
  },

  /**
   * Log authentication event
   */
  auth(event, meta = {}) {
    logger.info(`Auth: ${event}`, {
      ...meta,
      eventType: 'auth'
    });
  }
};

export default logger;

/**
 * Express middleware for request logging
 */
export function requestLoggerMiddleware(req, res, next) {
  const start = Date.now();
  
  // Generate request ID
  req.requestId = req.headers['x-request-id'] || 
    `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  res.setHeader('x-request-id', req.requestId);

  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.request(req, res, duration);
  });

  next();
}
