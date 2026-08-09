import AdmZip from 'adm-zip';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const baseDir = path.join(__dirname, '..', 'base');

function addDirToZip(zip, dirPath, zipPath, replacements) {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    const entryZipPath = zipPath ? `${zipPath}/${entry.name}` : entry.name;

    if (entry.isDirectory()) {
      addDirToZip(zip, fullPath, entryZipPath, replacements);
    } else {
      let content = fs.readFileSync(fullPath, 'utf8');
      for (const [key, value] of Object.entries(replacements)) {
        content = content.split(key).join(value);
      }
      zip.addFile(entryZipPath, Buffer.from(content, 'utf8'));
    }
  }
}

export function buildZip({ botName, pkgName, creator, ownerNumber, plugins }) {
  const zip = new AdmZip();

  const replacements = {
    __BOT_NAME__: botName,
    __PKG_NAME__: pkgName,
    __CREATOR__: creator,
    __OWNER_NUMBER__: ownerNumber,
  };

  addDirToZip(zip, baseDir, '', replacements);

  for (const plugin of plugins) {
    const flatName = path.basename(plugin.filename).replace(/[^a-zA-Z0-9._-]/g, '');
    zip.addFile(`plugins/${flatName}`, Buffer.from(plugin.code, 'utf8'));
  }

  return zip.toBuffer();
}
