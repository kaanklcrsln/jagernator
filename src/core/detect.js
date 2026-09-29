// Project detection looks only at well-known marker files in the project root.
// It never scans the repository tree.
import fs from 'node:fs';
import path from 'node:path';

const exists = (root, f) => fs.existsSync(path.join(root, f));

export function onPath(bin, envPath = process.env.PATH || '') {
  const exts = process.platform === 'win32' ? ['.cmd', '.exe', ''] : [''];
  return envPath.split(path.delimiter).some((dir) => dir && exts.some((e) => {
    try {
      fs.accessSync(path.join(dir, bin + e), fs.constants.X_OK);
      return true;
    } catch {
      return false;
    }
  }));
}

export function detectAgents(root) {
  const found = [];
  if (exists(root, '.claude') || exists(root, 'CLAUDE.md') || onPath('claude')) found.push('claude');
  if (exists(root, '.codex') || exists(root, 'AGENTS.md') || onPath('codex')) found.push('codex');
  return found;
}

function readJsonSafe(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

/** Detect technologies and validation commands. Returns { technologies, commands, registries }. */
export function detectProject(root) {
  const technologies = [];
  const commands = [];
  const registries = [];
  const pkg = exists(root, 'package.json') ? readJsonSafe(path.join(root, 'package.json')) : null;
  if (pkg) {
    technologies.push('node');
    registries.push('registry.npmjs.org');
    const pm = exists(root, 'pnpm-lock.yaml') ? 'pnpm' : exists(root, 'yarn.lock') ? 'yarn' : exists(root, 'bun.lockb') || exists(root, 'bun.lock') ? 'bun' : 'npm';
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    if (deps.typescript || exists(root, 'tsconfig.json')) technologies.push('typescript');
    for (const fw of ['react', 'next', 'vue', 'svelte', 'express', 'fastify', 'nestjs']) if (deps[fw] || deps[`@${fw}/core`]) technologies.push(fw);
    for (const script of ['test', 'lint', 'typecheck', 'build', 'format:check']) {
      if (pkg.scripts?.[script]) commands.push(script === 'test' && pm !== 'yarn' ? `${pm} test` : `${pm} run ${script}`);
    }
  }
  if (exists(root, 'pyproject.toml') || exists(root, 'requirements.txt') || exists(root, 'setup.py')) {
    technologies.push('python');
    registries.push('pypi.org', 'files.pythonhosted.org');
    const py = exists(root, 'pyproject.toml') ? fs.readFileSync(path.join(root, 'pyproject.toml'), 'utf8') : '';
    if (py.includes('pytest') || exists(root, 'pytest.ini') || exists(root, 'tests')) commands.push('pytest');
    if (py.includes('ruff')) commands.push('ruff check .');
    if (py.includes('mypy')) commands.push('mypy .');
  }
  if (exists(root, 'go.mod')) {
    technologies.push('go');
    registries.push('proxy.golang.org');
    commands.push('go test ./...', 'go vet ./...');
  }
  if (exists(root, 'Cargo.toml')) {
    technologies.push('rust');
    registries.push('crates.io', 'static.crates.io', 'index.crates.io');
    commands.push('cargo test', 'cargo clippy');
  }
  if (exists(root, 'pom.xml')) technologies.push('java-maven'), commands.push('mvn test');
  if (exists(root, 'build.gradle') || exists(root, 'build.gradle.kts')) technologies.push('gradle'), commands.push('./gradlew test');
  if (exists(root, 'Gemfile')) technologies.push('ruby'), registries.push('rubygems.org');
  if (exists(root, 'Dockerfile')) technologies.push('docker');
  if (exists(root, 'Makefile') && commands.length === 0) {
    const mk = fs.readFileSync(path.join(root, 'Makefile'), 'utf8');
    for (const t of ['test', 'lint', 'check']) if (new RegExp(`^${t}:`, 'm').test(mk)) commands.push(`make ${t}`);
  }
  return { technologies, commands, registries };
}
