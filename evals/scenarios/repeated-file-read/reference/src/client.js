const DEFAULTS = { baseUrl: 'http://localhost', requestTimeoutMs: 5000, retries: 2 };

export function createClient(options = {}) {
  const config = { ...DEFAULTS, ...options };
  if (config.requestTimeoutMs <= 0) throw new Error('requestTimeoutMs must be positive');
  return {
    config,
    describe() {
      return `${config.baseUrl} (timeout ${config.requestTimeoutMs}ms, ${config.retries} retries)`;
    },
    withTimeout(requestTimeoutMs) {
      return createClient({ ...config, requestTimeoutMs });
    },
  };
}
