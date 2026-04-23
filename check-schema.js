const fs = require('fs');
const schema = JSON.parse(fs.readFileSync('./schema.json', 'utf8'));

const files = [
  'customer-dashboard.html',
  'interpreter-dashboard.html',
  'admin-dashboard.html',
  'supabase-config.js',
  'admin-data.js',
  'interpreter-network.js',
  'interpreter-app.js',
  'payment-data.js',
  'api/assign.js',
  'api/respond-inquiry.js',
  'api/direct-inquiry.js',
  'api/admin-app.js',
  'api/admin-inquiries.js',
  'api/cases.js',
  'api/file-url.js',
  'api/interpreters.js',
  'api/my-contracts.js',
  'api/my-inquiries.js',
  'api/reviews.js',
  'api/verify-pw.js',
  'script.js'
];

const issues = [];

function scanChains(src, file) {
  const fromRe = /\.from\(['"]([^'"\)]+)['"]\)/g;
  const matches = [];
  let m;
  while ((m = fromRe.exec(src)) !== null) {
    matches.push({ idx: m.index, table: m[1], endIdx: m.index + m[0].length });
  }

  for (let i = 0; i < matches.length; i++) {
    const mm = matches[i];
    const table = mm.table;
    if (!schema[table]) continue;
    const validCols = new Set(schema[table]);
    // Chain ends at next .from() OR 600 chars, whichever is first
    const nextStart = i + 1 < matches.length ? matches[i + 1].idx : src.length;
    const windowEnd = Math.min(mm.endIdx + 1500, nextStart);
    const chain = src.substring(mm.endIdx, windowEnd);
    const lineNum = src.substring(0, mm.idx).split('\n').length;

    // Extract method calls in chain by walking
    // Simple: find .method(...) patterns by balanced-paren matching
    const methods = [];
    let p = 0;
    while (p < chain.length) {
      const dotMatch = chain.substring(p).match(/^\s*\.([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/);
      if (!dotMatch) break;
      const mname = dotMatch[1];
      const openParenAt = p + dotMatch[0].length - 1;
      // find matching close paren
      let depth = 1;
      let end = -1;
      let inStr = null;
      for (let j = openParenAt + 1; j < chain.length; j++) {
        const ch = chain[j];
        if (inStr) {
          if (ch === '\\') { j++; continue; }
          if (ch === inStr) inStr = null;
          continue;
        }
        if (ch === '"' || ch === "'" || ch === '`') { inStr = ch; continue; }
        if (ch === '(') depth++;
        else if (ch === ')') { depth--; if (depth === 0) { end = j; break; } }
      }
      if (end < 0) break;
      const args = chain.substring(openParenAt + 1, end);
      methods.push({ name: mname, args });
      p = end + 1;
    }

    // Inspect each method
    for (const met of methods) {
      const mname = met.name;
      const args = met.args;

      if (/^(eq|neq|gt|gte|lt|lte|like|ilike|is|in|contains|containedBy|order|filter|rangeGt|rangeGte|rangeLt|rangeLte)$/.test(mname)) {
        // First arg is column name (string)
        const colMatch = args.match(/^\s*['"]([^'"]+)['"]/);
        if (!colMatch) continue;
        const col = colMatch[1].split('.')[0].split('(')[0].trim();
        if (!validCols.has(col)) {
          issues.push({ file, line: lineNum, table, col, op: mname });
        }
      } else if (mname === 'insert' || mname === 'update' || mname === 'upsert') {
        // First arg is object {...} or array [{...}]
        // Extract the first balanced {...}
        let braceStart = args.indexOf('{');
        if (braceStart < 0) continue;
        let d = 0, end = -1, inStr = null;
        for (let j = braceStart; j < args.length; j++) {
          const ch = args[j];
          if (inStr) {
            if (ch === '\\') { j++; continue; }
            if (ch === inStr) inStr = null;
            continue;
          }
          if (ch === '"' || ch === "'" || ch === '`') { inStr = ch; continue; }
          if (ch === '{') d++;
          else if (ch === '}') { d--; if (d === 0) { end = j; break; } }
        }
        if (end < 0) continue;
        const body = args.substring(braceStart, end + 1);
        // Top-level keys only
        const keys = [];
        let dd = 0;
        let expectKey = true;
        let keyStart = -1;
        let inS = null;
        for (let j = 0; j < body.length; j++) {
          const ch = body[j];
          if (inS) {
            if (ch === '\\') { j++; continue; }
            if (ch === inS) inS = null;
            continue;
          }
          if (ch === '"' || ch === "'" || ch === '`') {
            if (dd === 1 && expectKey) { inS = ch; keyStart = j + 1; }
            else inS = ch;
            continue;
          }
          if (ch === '{') { dd++; if (dd === 1) expectKey = true; continue; }
          if (ch === '[' || ch === '(') { dd++; continue; }
          if (ch === '}') { dd--; continue; }
          if (ch === ']' || ch === ')') { dd--; continue; }
          if (dd === 1) {
            if (expectKey && keyStart < 0 && /[a-zA-Z_$]/.test(ch)) { keyStart = j; }
            else if (keyStart >= 0 && ch === ':') {
              let k = body.substring(keyStart, j).trim();
              // strip quotes
              k = k.replace(/^['"`]|['"`]$/g, '');
              if (/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(k)) keys.push(k);
              keyStart = -1;
              expectKey = false;
            }
            else if (ch === ',') { expectKey = true; keyStart = -1; }
          }
        }
        for (const k of keys) {
          if (!validCols.has(k)) {
            issues.push({ file, line: lineNum, table, col: k, op: mname });
          }
        }
      }
    }
  }
}

for (const f of files) {
  let src;
  try { src = fs.readFileSync(f, 'utf8'); } catch (e) { continue; }
  scanChains(src, f);
}

// dedup
const byKey = {};
for (const iss of issues) {
  const k = iss.table + '.' + iss.col + ' (' + iss.op + ')';
  if (!byKey[k]) byKey[k] = [];
  byKey[k].push(iss.file + ':' + iss.line);
}

console.log('=== Column mismatches ===');
const keys = Object.keys(byKey).sort();
if (keys.length === 0) {
  console.log('(none)');
} else {
  console.log('Total unique mismatches:', keys.length);
  for (const k of keys) {
    console.log(k);
    byKey[k].slice(0, 6).forEach(r => console.log('  ' + r));
  }
}
