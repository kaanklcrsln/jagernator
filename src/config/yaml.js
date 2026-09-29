// Minimal YAML subset parser for Jagernator config files.
// Supported: block mappings, block sequences, scalars (plain, quoted),
// flow sequences of scalars ([a, b]), empty flow mapping ({}), comments.
// Anything else (anchors, multi-line strings, tags) is rejected with an error.

export class YamlError extends Error {
  constructor(message, line) {
    super(line ? `line ${line}: ${message}` : message);
    this.line = line;
  }
}

function stripComment(text) {
  let quote = null;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quote) {
      if (c === quote) quote = null;
    } else if (c === '"' || c === "'") {
      quote = c;
    } else if (c === '#' && (i === 0 || /\s/.test(text[i - 1]))) {
      return text.slice(0, i);
    }
  }
  return text;
}

function tokenize(src) {
  const lines = [];
  src.split(/\r?\n/).forEach((raw, idx) => {
    const lineNo = idx + 1;
    const leading = raw.match(/^[ \t]*/)[0];
    if (leading.includes('\t')) throw new YamlError('tabs are not allowed for indentation', lineNo);
    const text = stripComment(raw).trimEnd();
    if (text.trim() === '' || text.trim() === '---') return;
    if (/^\s*(&|\*|!|\||>)/.test(text.replace(/^\s*-\s*/, '').replace(/^[^:]+:\s*/, ''))) {
      throw new YamlError('anchors, tags and block scalars are not supported', lineNo);
    }
    lines.push({ indent: leading.length, text: text.trim(), lineNo });
  });
  return lines;
}

const isSeqItem = (t) => t === '-' || t.startsWith('- ');

function parseKey(text, lineNo) {
  const m = text.match(/^("(?:[^"\\]|\\.)*"|'(?:[^']|'')*'|[^:'"]+?)\s*:(?:\s+(.*)|$)/);
  if (!m) throw new YamlError(`expected "key: value", got "${text}"`, lineNo);
  const key = m[1].startsWith('"') || m[1].startsWith("'") ? parseScalar(m[1], lineNo) : m[1];
  return { key: String(key), rest: m[2] === undefined ? '' : m[2].trim() };
}

export function parseScalar(text, lineNo) {
  const t = text.trim();
  if (t.startsWith('"')) {
    try {
      return JSON.parse(t);
    } catch {
      throw new YamlError(`invalid double-quoted string: ${t}`, lineNo);
    }
  }
  if (t.startsWith("'")) {
    if (!t.endsWith("'") || t.length < 2) throw new YamlError(`invalid single-quoted string: ${t}`, lineNo);
    return t.slice(1, -1).replace(/''/g, "'");
  }
  if (t.startsWith('[')) {
    if (!t.endsWith(']')) throw new YamlError(`unterminated flow sequence: ${t}`, lineNo);
    const inner = t.slice(1, -1).trim();
    if (inner === '') return [];
    return inner.split(',').map((s) => {
      if (/[[\]{}]/.test(s)) throw new YamlError('nested flow collections are not supported', lineNo);
      return parseScalar(s, lineNo);
    });
  }
  if (t.startsWith('{')) {
    if (t.replace(/\s/g, '') === '{}') return {};
    throw new YamlError('only empty flow mappings ({}) are supported', lineNo);
  }
  if (t === 'true') return true;
  if (t === 'false') return false;
  if (t === 'null' || t === '~' || t === '') return null;
  if (/^-?\d+$/.test(t)) return Number.parseInt(t, 10);
  if (/^-?\d+\.\d+$/.test(t)) return Number.parseFloat(t);
  return t;
}

function parseNode(lines, i, indent) {
  return isSeqItem(lines[i].text) ? parseSeq(lines, i, indent) : parseMap(lines, i, indent);
}

function parseValueAfterKey(lines, i, indent) {
  // Called after a "key:" line with no inline value; i points at the next line.
  if (i < lines.length && lines[i].indent > indent) return parseNode(lines, i, lines[i].indent);
  if (i < lines.length && lines[i].indent === indent && isSeqItem(lines[i].text)) return parseSeq(lines, i, indent);
  return [null, i];
}

function parseMap(lines, i, indent) {
  const obj = {};
  while (i < lines.length && lines[i].indent === indent && !isSeqItem(lines[i].text)) {
    const { text, lineNo } = lines[i];
    const { key, rest } = parseKey(text, lineNo);
    if (Object.hasOwn(obj, key)) throw new YamlError(`duplicate key "${key}"`, lineNo);
    i++;
    if (rest !== '') {
      obj[key] = parseScalar(rest, lineNo);
    } else {
      [obj[key], i] = parseValueAfterKey(lines, i, indent);
    }
  }
  if (i < lines.length && lines[i].indent > indent) throw new YamlError('unexpected indentation', lines[i].lineNo);
  return [obj, i];
}

function parseSeq(lines, i, indent) {
  const arr = [];
  while (i < lines.length && lines[i].indent === indent && isSeqItem(lines[i].text)) {
    const { lineNo } = lines[i];
    const rest = lines[i].text.slice(1).trim();
    if (rest === '') {
      i++;
      if (i < lines.length && lines[i].indent > indent) {
        let v;
        [v, i] = parseNode(lines, i, lines[i].indent);
        arr.push(v);
      } else arr.push(null);
    } else if (/^("[^"]*"|'[^']*'|[^'"[{][^:]*?)\s*:(\s|$)/.test(rest)) {
      // "- key: value" starts an inline mapping item.
      const childIndent = indent + (lines[i].text.length - rest.length);
      lines[i] = { indent: childIndent, text: rest, lineNo };
      let v;
      [v, i] = parseMap(lines, i, childIndent);
      arr.push(v);
    } else {
      arr.push(parseScalar(rest, lineNo));
      i++;
    }
  }
  if (i < lines.length && lines[i].indent > indent) throw new YamlError('unexpected indentation', lines[i].lineNo);
  return [arr, i];
}

export function parseYaml(src) {
  const lines = tokenize(src);
  if (lines.length === 0) return null;
  if (lines[0].indent !== 0) throw new YamlError('document must start at column 0', lines[0].lineNo);
  const [value, i] = parseNode(lines, 0, 0);
  if (i < lines.length) throw new YamlError('unexpected content', lines[i].lineNo);
  return value;
}
