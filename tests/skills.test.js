import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { CORE_SKILLS } from '../src/config/schema.js';
import { discoverSkills, loadSkill, parseFrontmatter, readSkillMeta, skillReferences } from '../src/skills/registry.js';
import { REPO, tmpProject } from './helpers.js';

test('all core skills exist with valid metadata', () => {
  const skills = discoverSkills(path.join(REPO, 'skills'));
  assert.deepEqual(skills.map((s) => s.name).sort(), [...CORE_SKILLS].sort());
  for (const s of skills) {
    assert.deepEqual(s.errors, [], s.name);
    assert.ok(s.description.length > 40, `${s.name} needs a useful description`);
    assert.match(s.description, /Use (when|before|at)/, `${s.name} description should say when to use it`);
  }
});

test('frontmatter parsing', () => {
  const { meta, body } = parseFrontmatter('---\nname: x\ndescription: does y\n---\n# Body\n');
  assert.deepEqual(meta, { name: 'x', description: 'does y' });
  assert.equal(body, '# Body\n');
  assert.equal(parseFrontmatter('# none').meta, null);
});

test('invalid skills are reported, not thrown', () => {
  const root = tmpProject({
    'skills/good/SKILL.md': '---\nname: good\ndescription: fine\n---\nx',
    'skills/mismatch/SKILL.md': '---\nname: other\ndescription: d\n---\n',
    'skills/nodesc/SKILL.md': '---\nname: nodesc\n---\n',
    'skills/nofront/SKILL.md': '# hi',
    'skills/empty/README.md': 'x',
  });
  const byName = Object.fromEntries(discoverSkills(path.join(root, 'skills')).map((s) => [s.name, s.errors]));
  assert.deepEqual(byName.good, []);
  assert.match(byName.mismatch.join(), /does not match/);
  assert.match(byName.nodesc.join(), /missing description/);
  assert.match(byName.nofront.join(), /missing frontmatter/);
  assert.match(byName.empty.join(), /missing SKILL.md/);
});

test('discovery reads metadata only; full content and references load on demand', () => {
  const big = 'x'.repeat(50000);
  const root = tmpProject({ 's/one/SKILL.md': `---\nname: one\ndescription: first\n---\n${big}`, 's/one/references/r.md': 'ref' });
  const [meta] = discoverSkills(path.join(root, 's'));
  assert.equal(Object.hasOwn(meta, 'body'), false);
  assert.equal(JSON.stringify(meta).length < 1000, true);
  assert.equal(loadSkill(meta).length > 50000, true);
  assert.deepEqual(skillReferences(meta), ['references/r.md']);
  assert.deepEqual(readSkillMeta(path.join(root, 's/one'), 'x').errors, []);
});
