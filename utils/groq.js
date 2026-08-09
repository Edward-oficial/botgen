const GROQ_KEYS = [
  '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',
  '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',
  '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',
  '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',
  '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',
  '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',
  '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',
  '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',
  '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',
  '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',
  // opcional: también la original
  // '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',
];

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const MODEL = 'llama-3.3-70b-versatile';

let keyIndex = 0;

function nextKey() {
  const key = GROQ_KEYS[keyIndex % GROQ_KEYS.length];
  keyIndex = (keyIndex + 1) % GROQ_KEYS.length;
  return key;
}

const EXAMPLE_PLUGIN = `import { mencionarATodos } from "../mentions.js";

export default {
  command: ["tagall", "todos"],
  category: "Grupo",
  description: "Menciona a todas las personas del grupo",
  run: async (sock, msg, args, context) => {
    const { chatId, esGrupo } = context;
    if (!esGrupo) return;

    const texto = args.length ? args.join(" ") : "Atencion a todas/os.";
    await mencionarATodos(sock, chatId, texto);
  },
};`;

 const SYSTEM_PROMPT = `Sos un generador de plugins para un bot de WhatsApp en Node.js con ESM (import/export), usando la libreria baileysx (misma API que Baileys estandar).

El bot NO usa prefijo. Cada mensaje se compara directo contra "command", sin ningun caracter delante.

Cada plugin es un archivo .js que va directo en la carpeta /plugins (sin subcarpetas) y exporta un objeto default con esta forma exacta:

${EXAMPLE_PLUGIN}

Reglas estrictas:
- "command" es siempre un array de strings en minusculas (uno o mas alias), nunca un string suelto.
- "category" es un string libre en español, ej: "General", "Multimedia", "Grupo", "Descargas", "Diversion".
- "run" recibe (sock, msg, args, context). "msg" es el mensaje crudo de baileysx. "args" son las palabras despues del comando. "context" tiene { chatId, sender, body, esGrupo, isSubBot, allPlugins, onMessage, onGroupParticipantsUpdate }.
- Los helpers disponibles para importar, todos ubicados un nivel arriba (../):
  - "../mentions.js": mencionarATodos(sock, chatId, texto), mencionarUsuario(sock, chatId, jid, texto), mencionarAutorDelMensaje(sock, msg, texto)
  - "../groupHelpers.js": esAdminDeGrupo(sock, chatId, jid), obtenerFotoPerfil(sock, jid), nombreUsuario(sock, jid), obtenerMencionado(msg), formatoUsuario(sock, chatId, jid)
  - "../media.js": downloadMediaMessage(msg, tipo, opciones) para descargar imagenes/videos/audios citados
  - "../decoracion.js": mono(texto), sansBold(texto) para estilizar texto en el mensaje
- Para responder texto simple: await sock.sendMessage(chatId, { text: "..." }, { quoted: msg });
- Para citar/descargar un mensaje respondido (reply), usa msg.message?.extendedTextMessage?.contextInfo?.quotedMessage.
- Nunca uses require, siempre import/export ESM.
- No inventes helpers que no esten en la lista de arriba; si necesitas algo que no existe ahi, resolvelo con codigo propio dentro del mismo plugin.
- No agregues comentarios en el codigo.

Cuando el usuario pida "menu", "menú", "ahora menu", "ayuda" o similar:
- SIEMPRE generá o actualizá un plugin llamado menu.js
- command: ["menu", "ayuda", "help"]
- category: "General"
- Debe listar TODOS los comandos de los plugins actuales usando allPlugins del context, agrupados por categoría
- Formato limpio, por ejemplo:

*Menú del bot*

*Grupo*
• tagall / todos
• admins

*General*
• menu / ayuda

- No inventes comandos que no existan en allPlugins
- Si ya existe menu.js, actualizalo con la lista completa actual

Devolves SOLO un JSON con esta forma exacta, sin texto extra, sin markdown:
{"plugins":[{"filename":"nombre.js","code":"contenido completo del archivo"}]}`;

async function callGroq(messages, attempt = 0) {
  if (attempt >= GROQ_KEYS.length) {
    throw new Error('Todas las keys de Groq dieron rate limit o error');
  }

  const key = nextKey();

  const res = await fetch(GROQ_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: MODEL,
      messages,
      response_format: { type: 'json_object' },
      temperature: 0.4,
      max_tokens: 8000,
    }),
  });

  if (res.status === 429) {
    // rate limit → probar siguiente key
    return callGroq(messages, attempt + 1);
  }

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Groq respondio ${res.status}: ${text}`);
  }

  const data = await res.json();
  const content = data.choices[0].message.content;
  return JSON.parse(content);
}

export async function chatUpdate(existingPlugins, instruction) {
  const existingBlock = existingPlugins.length
    ? `Plugins actuales del bot:\n\n${existingPlugins.map((p) => `--- \( {p.filename} ---\n \){p.code}`).join('\n\n')}`
    : 'Todavia no hay ningun plugin, este es el primer pedido.';

  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    {
      role: 'user',
      content: `\( {existingBlock}\n\nPedido nuevo del usuario:\n \){instruction}\n\nDevolve el array COMPLETO y actualizado de plugins: los que no cambiaron van igual (sin tocarlos), los modificados con su nueva version, y los nuevos que haga falta agregar. Si el usuario pide borrar o sacar un comando, no lo incluyas en la respuesta.`,
    },
  ];

  const result = await callGroq(messages);
  return result.plugins || [];
}

export async function fixPlugin(filename, code, errorMessage) {
  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    {
      role: 'user',
      content: `Este plugin "\( {filename}" tiene un error de sintaxis, corregilo. Devolve el JSON con un solo plugin corregido.\n\nCodigo:\n \){code}\n\nError:\n${errorMessage}`,
    },
  ];

  const result = await callGroq(messages);
  return result.plugins?.[0] || null;
}
