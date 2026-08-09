const GROQ_API_KEY = process.env.GROQ_API_KEY || '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';
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const MODEL = 'llama-3.3-70b-versatile';

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

Devolves SOLO un JSON con esta forma exacta, sin texto extra, sin markdown:
{"plugins":[{"filename":"nombre.js","code":"contenido completo del archivo"}]}`;

async function callGroq(messages) {
  const res = await fetch(GROQ_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model: MODEL,
      messages,
      response_format: { type: 'json_object' },
      temperature: 0.4,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Groq respondio ${res.status}: ${text}`);
  }

  const data = await res.json();
  const content = data.choices[0].message.content;
  return JSON.parse(content);
}

export async function generatePlugins(specs) {
  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: `Especificaciones del bot:\n${specs}` },
  ];

  const result = await callGroq(messages);
  return result.plugins || [];
}

export async function fixPlugin(filename, code, errorMessage) {
  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    {
      role: 'user',
      content: `Este plugin "${filename}" tiene un error de sintaxis, corregilo. Devolve el JSON con un solo plugin corregido.\n\nCodigo:\n${code}\n\nError:\n${errorMessage}`,
    },
  ];

  const result = await callGroq(messages);
  return result.plugins?.[0] || null;
}
