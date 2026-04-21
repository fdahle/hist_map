/**
 * Development utilities for debugging and testing
 * Only enabled in development mode
 */

import { logger } from './logger';
import { getAllMetrics } from './performance';

/**
 * Enable development mode helpers
 * Adds useful debugging functions to window object
 */
export function enableDevMode() {
  if (!import.meta.env.DEV) return;

  // Add debug helpers to window
  window.__stratum3D__ = {
    logger,
    
    // Get all performance metrics
    getMetrics: () => {
      const metrics = getAllMetrics();
      console.table(metrics);
      return metrics;
    },
    
    // Toggle log level
    setLogLevel: (level) => {
      logger.setLevel(level);
      logger.info('DevTools', `Log level set to: ${level}`);
    },
    
    // Get current app version and build info
    getInfo: () => {
      return {
        version: __APP_VERSION__ || 'dev',
        buildTime: __BUILD_TIME__ || new Date().toISOString(),
        mode: import.meta.env.MODE,
        dev: import.meta.env.DEV,
      };
    },
    
    // Force reload config
    reloadConfig: () => {
      window.location.reload();
    },
  };

  logger.info('DevTools', 'Development mode enabled. Access debug tools via window.__stratum3D__');
}

/**
 * Log component lifecycle events (for debugging)
 * @param {string} component - Component name
 * @param {string} event - Lifecycle event name
 * @param {any} data - Optional data
 */
export function logLifecycle(component, event, data) {
  if (!import.meta.env.DEV) return;
  logger.debug('Lifecycle', `${component}.${event}`, data);
}

/**
 * Assert a condition in development mode
 * @param {boolean} condition - Condition to check
 * @param {string} message - Error message if condition fails
 */
export function devAssert(condition, message) {
  if (!import.meta.env.DEV) return;
  if (!condition) {
    logger.error('Assert', message);
    throw new Error(`Assertion failed: ${message}`);
  }
}

export default { enableDevMode, logLifecycle, devAssert };
