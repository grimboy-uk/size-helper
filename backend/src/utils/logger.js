/**
 * Contextual Logger Utility
 * Provides structured logging with levels and context
 */

const LOG_LEVELS = {
  ERROR: 0,
  WARN: 1,
  INFO: 2,
  DEBUG: 3,
};

const LOG_PREFIXES = {
  ERROR: '❌',
  WARN: '⚠️',
  INFO: 'ℹ️',
  DEBUG: '🔍',
};

function getLogLevel() {
  const env = process.env.NODE_ENV || 'development';
  const configuredLevel = process.env.LOG_LEVEL?.toUpperCase();

  if (configuredLevel && LOG_LEVELS[configuredLevel] !== undefined) {
    return LOG_LEVELS[configuredLevel];
  }

  return env === 'production' ? LOG_LEVELS.INFO : LOG_LEVELS.DEBUG;
}

function formatMessage(level, context, message, data) {
  const timestamp = new Date().toISOString();
  const prefix = LOG_PREFIXES[level] || '';
  const contextStr = context ? `[${context}]` : '';

  let output = `${timestamp} ${prefix} ${level} ${contextStr} ${message}`;

  if (data !== undefined) {
    if (typeof data === 'object') {
      output += '\n' + JSON.stringify(data, null, 2);
    } else {
      output += ' ' + data;
    }
  }

  return output;
}

function log(level, context, message, data) {
  const currentLevel = getLogLevel();
  const messageLevel = LOG_LEVELS[level];

  if (messageLevel > currentLevel) {
    return;
  }

  const formattedMessage = formatMessage(level, context, message, data);

  switch (level) {
    case 'ERROR':
      console.error(formattedMessage);
      break;
    case 'WARN':
      console.warn(formattedMessage);
      break;
    default:
      console.log(formattedMessage);
  }
}

/**
 * Create a logger instance with a specific context
 * @param {string} context - The context/category for this logger
 * @returns {Object} Logger instance with error, warn, info, debug methods
 */
export function createLogger(context) {
  return {
    error: (message, data) => log('ERROR', context, message, data),
    warn: (message, data) => log('WARN', context, message, data),
    info: (message, data) => log('INFO', context, message, data),
    debug: (message, data) => log('DEBUG', context, message, data),

    // Convenience methods for common contexts
    request: (message, data) => log('DEBUG', `${context}:Request`, message, data),
    db: (message, data) => log('DEBUG', `${context}:DB`, message, data),
    api: (message, data) => log('DEBUG', `${context}:API`, message, data),
  };
}

// Default logger instance
export const logger = createLogger('App');

export default logger;
