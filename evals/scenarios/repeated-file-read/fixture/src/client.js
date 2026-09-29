const DEFAULTS = { baseUrl: 'http://localhost', timeoutMs: 5000, retries: 2 };

export function createClient(options = {}) {
  const config = { ...DEFAULTS, ...options };
  if (config.timeoutMs <= 0) throw new Error('timeoutMs must be positive');
  return {
    config,
    describe() {
      return `${config.baseUrl} (timeout ${config.timeoutMs}ms, ${config.retries} retries)`;
    },
    withTimeout(timeoutMs) {
      return createClient({ ...config, timeoutMs });
    },
  };
}
