// Tiny declarative validator. Schemas are plain objects:
//   { type: 'object'|'array'|'string'|'integer'|'boolean'|'map', ... }
// object: props {name: schema}; props without a default are required; unknown keys are errors.
// map:    arbitrary keys, each validated against `values`.
// array:  items, unique.  string: enum, pattern.  integer: enum, min.  any: default.
// Returns a new value with defaults applied; errors are collected, never thrown.

const typeOf = (v) => (v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v);

export function validate(value, schema, path = '', errors = []) {
  const at = path || '(root)';
  if ((value === undefined || value === null) && schema.default !== undefined) {
    // Validate the default too, so nested defaults ({} → { network: ... }) are filled in.
    value = structuredClone(schema.default);
  }
  if (value === undefined || value === null) {
    errors.push(`${at}: is required`);
    return value;
  }
  switch (schema.type) {
    case 'object': {
      if (typeOf(value) !== 'object') {
        errors.push(`${at}: expected a mapping, got ${typeOf(value)}`);
        return value;
      }
      const out = {};
      for (const key of Object.keys(value)) {
        if (!schema.props[key]) errors.push(`${path ? path + '.' : ''}${key}: unknown key`);
      }
      for (const [key, sub] of Object.entries(schema.props)) {
        const child = `${path ? path + '.' : ''}${key}`;
        if (value[key] === undefined && sub.default === undefined) {
          errors.push(`${child}: is required`);
          continue;
        }
        out[key] = validate(value[key], sub, child, errors);
      }
      return out;
    }
    case 'map': {
      if (typeOf(value) !== 'object') {
        errors.push(`${at}: expected a mapping, got ${typeOf(value)}`);
        return value;
      }
      const out = {};
      for (const [key, v] of Object.entries(value)) {
        if (schema.keyPattern && !schema.keyPattern.test(key)) errors.push(`${at}: invalid key "${key}"`);
        out[key] = validate(v, schema.values, `${path}.${key}`, errors);
      }
      return out;
    }
    case 'array': {
      if (!Array.isArray(value)) {
        errors.push(`${at}: expected a list, got ${typeOf(value)}`);
        return value;
      }
      const out = value.map((v, i) => validate(v, schema.items, `${path}[${i}]`, errors));
      if (schema.unique && new Set(out.map((v) => JSON.stringify(v))).size !== out.length) {
        errors.push(`${at}: contains duplicate entries`);
      }
      return out;
    }
    case 'string':
      if (typeof value !== 'string') errors.push(`${at}: expected a string, got ${typeOf(value)}`);
      else if (schema.enum && !schema.enum.includes(value)) errors.push(`${at}: must be one of ${schema.enum.join(', ')} (got "${value}")`);
      else if (schema.pattern && !schema.pattern.test(value)) errors.push(`${at}: "${value}" ${schema.patternHint || 'has an invalid format'}`);
      return value;
    case 'integer':
      if (!Number.isInteger(value)) errors.push(`${at}: expected an integer, got ${typeOf(value)}`);
      else if (schema.enum && !schema.enum.includes(value)) errors.push(`${at}: must be one of ${schema.enum.join(', ')}`);
      else if (schema.min !== undefined && value < schema.min) errors.push(`${at}: must be >= ${schema.min}`);
      return value;
    case 'boolean':
      if (typeof value !== 'boolean') errors.push(`${at}: expected true or false, got ${typeOf(value)}`);
      return value;
    default:
      throw new Error(`validate: unknown schema type ${schema.type}`);
  }
}
