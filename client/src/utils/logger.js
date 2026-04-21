/**
 * Centralized logging utility for the application
 * Provides consistent logging with environment-aware behavior
 */

const LOG_LEVELS = {
  ERROR: 0,
  WARN: 1,
  INFO: 2,
  DEBUG: 3,
};

class Logger {
  constructor() {
    // Enable debug logs in development, only errors/warnings in production
    this.level = import.meta.env.DEV ? LOG_LEVELS.DEBUG : LOG_LEVELS.WARN;
    this.prefix = '[Stratum3D]';
  }

  /**
   * Format log message with timestamp and context
   * @private
   */
  _format(level, context, message, ...args) {
    const timestamp = new Date().toISOString().split('T')[1].split('.')[0];
    const prefix = context ? `${this.prefix}[${context}]` : this.prefix;
    return [`${timestamp} ${level} ${prefix}`, message, ...args];
  }

  /**
   * Log error message (always shown)
   * @param {string} context - Component or module name
   * @param {string} message - Error message
   * @param {...any} args - Additional arguments
   */
  error(context, message, ...args) {
    if (this.level >= LOG_LEVELS.ERROR) {
      console.error(...this._format('ERROR', context, message, ...args));
    }
  }

  /**
   * Log warning message
   * @param {string} context - Component or module name
   * @param {string} message - Warning message
   * @param {...any} args - Additional arguments
   */
  warn(context, message, ...args) {
    if (this.level >= LOG_LEVELS.WARN) {
      console.warn(...this._format('WARN', context, message, ...args));
    }
  }

  /**
   * Log info message (dev only by default)
   * @param {string} context - Component or module name
   * @param {string} message - Info message
   * @param {...any} args - Additional arguments
   */
  info(context, message, ...args) {
    if (this.level >= LOG_LEVELS.INFO) {
      console.log(...this._format('INFO', context, message, ...args));
    }
  }

  /**
   * Log debug message (dev only)
   * @param {string} context - Component or module name
   * @param {string} message - Debug message
   * @param {...any} args - Additional arguments
   */
  debug(context, message, ...args) {
    if (this.level >= LOG_LEVELS.DEBUG) {
      console.log(...this._format('DEBUG', context, message, ...args));
    }
  }

  /**
   * Log with timing information
   * @param {string} context - Component or module name
   * @param {string} label - Timer label
   * @returns {Function} End function to call when done
   */
  time(context, label) {
    const startTime = performance.now();
    this.debug(context, `⏱️ ${label} started`);
    
    return () => {
      const duration = (performance.now() - startTime).toFixed(2);
      this.debug(context, `⏱️ ${label} completed in ${duration}ms`);
    };
  }

  /**
   * Set log level manually
   * @param {'error'|'warn'|'info'|'debug'} level
   */
  setLevel(level) {
    const levelMap = {
      error: LOG_LEVELS.ERROR,
      warn: LOG_LEVELS.WARN,
      info: LOG_LEVELS.INFO,
      debug: LOG_LEVELS.DEBUG,
    };
    this.level = levelMap[level] ?? LOG_LEVELS.WARN;
  }
}

// Export singleton instance
export const logger = new Logger();

// Named exports for convenience
export const { error, warn, info, debug, time } = logger;
