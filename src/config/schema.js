export const AGENTS = ['claude', 'codex', 'generic'];
export const CORE_SKILLS = [
  'debugging',
  'testing',
  'code-review',
  'refactoring',
  'architecture',
  'security',
  'git',
  'context-optimization',
  'network-safety',
];

// Hostname, optional leading "*." wildcard, or the pseudo-destination "web-search".
const DESTINATION = /^(web-search|(\*\.)?[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*)$/;
const NAME = /^[a-z0-9][a-z0-9-]*$/;
const requiredOptional = { type: 'string', enum: ['required', 'optional'], default: 'required' };
const destinations = {
  type: 'array',
  unique: true,
  default: [],
  items: { type: 'string', pattern: DESTINATION, patternHint: 'is not a hostname, *.hostname, or web-search' },
};

export const configSchema = {
  type: 'object',
  props: {
    version: { type: 'integer', enum: [1] },
    profile: { type: 'string', enum: ['senior-engineer'], default: 'senior-engineer' },
    agents: { type: 'array', unique: true, default: ['generic'], items: { type: 'string', enum: AGENTS } },
    skills: {
      type: 'object',
      default: {},
      props: {
        enabled: { type: 'array', unique: true, default: CORE_SKILLS, items: { type: 'string', pattern: NAME } },
      },
    },
    workflow: {
      type: 'object',
      default: {},
      props: { planning: requiredOptional, verification: requiredOptional, diff_review: requiredOptional },
    },
    security: {
      type: 'object',
      default: {},
      props: {
        network: { type: 'string', enum: ['deny-by-default', 'ask'], default: 'deny-by-default' },
        secret_detection: { type: 'string', enum: ['enabled', 'disabled'], default: 'enabled' },
        external_source_upload: { type: 'string', enum: ['deny', 'ask'], default: 'deny' },
        sensitive_files: { type: 'string', enum: ['deny', 'ask'], default: 'deny' },
        allowed_destinations: destinations,
        allowed_mcp_servers: { type: 'array', unique: true, default: [], items: { type: 'string' } },
      },
    },
    context: {
      type: 'object',
      default: {},
      props: {
        incremental_reads: { type: 'boolean', default: true },
        cache_metadata: { type: 'boolean', default: true },
        avoid_duplicate_reads: { type: 'boolean', default: true },
        large_file_bytes: { type: 'integer', min: 1024, default: 100000 },
      },
    },
    enforcement: {
      type: 'object',
      default: {},
      props: { claude_hooks: { type: 'boolean', default: true } },
    },
    plugins: {
      type: 'map',
      default: {},
      keyPattern: NAME,
      values: {
        type: 'object',
        props: {
          enabled: { type: 'boolean', default: false },
          approved_destinations: destinations,
        },
      },
    },
  },
};
