import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { generatePlugins, fixPlugin } from './utils/groq.js';
import { checkSyntax } from './utils/syntaxCheck.js';
import { buildZip } from './utils/buildZip.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

function slugify(text) {
  return text
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'mi-bot';
}

app.post('/generate', async (req, res) => {
  const { botName, creator, ownerNumber, specs } = req.body || {};

  if (!botName || !specs) {
    return res.status(400).json({ status: false, error: 'Falta el nombre del bot o las especificaciones' });
  }

  try {
    let plugins = await generatePlugins(specs);

    if (!plugins.length) {
      return res.status(500).json({ status: false, error: 'Groq no devolvio ningun plugin' });
    }

    const validated = [];

    for (let plugin of plugins) {
      let check = checkSyntax(plugin.code);
      let attempts = 0;

      while (!check.valid && attempts < 2) {
        const fixed = await fixPlugin(plugin.filename, plugin.code, check.error);
        if (!fixed) break;
        plugin = fixed;
        check = checkSyntax(plugin.code);
        attempts += 1;
      }

      if (check.valid) {
        validated.push(plugin);
      } else {
        console.log(`plugin descartado por error de sintaxis: ${plugin.filename}`);
      }
    }

    if (!validated.length) {
      return res.status(500).json({ status: false, error: 'Ningun plugin generado paso la validacion de sintaxis' });
    }

    const zipBuffer = buildZip({
      botName,
      pkgName: slugify(botName),
      creator: creator || 'Generado con Duan Botgen',
      ownerNumber: ownerNumber || '50400000000',
      plugins: validated,
    });

    res.set('Content-Type', 'application/zip');
    res.set('Content-Disposition', `attachment; filename="${slugify(botName)}.zip"`);
    res.send(zipBuffer);
  } catch (err) {
    res.status(500).json({ status: false, error: err.message });
  }
});

app.use((req, res) => {
  res.status(404).json({ status: false, error: 'No encontrado' });
});

app.listen(PORT, () => console.log(`Generador de bots corriendo en el puerto ${PORT}`));
