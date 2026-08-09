import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';

export function checkSyntax(code) {
  const tmpFile = path.join(os.tmpdir(), `check-${crypto.randomBytes(6).toString('hex')}.mjs`);
  fs.writeFileSync(tmpFile, code);

  try {
    execSync(`node --check "${tmpFile}"`, { stdio: 'pipe' });
    fs.unlinkSync(tmpFile);
    return { valid: true };
  } catch (err) {
    fs.unlinkSync(tmpFile);
    return { valid: false, error: err.stderr?.toString() || err.message };
  }
}
