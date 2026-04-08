import './loadEnv.js';
import express from 'express';
import cors from 'cors';
import { randomUUID } from 'crypto';
import { config } from './config.js';
import apiRoutes from './routes/api.js';
import { log } from './services/logger.js';

const app = express();
const corsOrigins = config.corsOrigin;
function corsOriginHandler(origin: string | undefined, cb: (err: Error | null, allow?: boolean) => void) {
  if (!origin) return cb(null, true);
  if (corsOrigins.includes(origin)) return cb(null, true);
  if (origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:')) return cb(null, true);
  return cb(null, false);
}
app.use(cors({ origin: corsOriginHandler, optionsSuccessStatus: 200 }));
/** Default Express ~100kb → 413 Payload Too Large no POST montar-linhas (n8n envia muitas linhas). */
const jsonBodyLimit = (process.env.BYLA_JSON_BODY_LIMIT ?? '32mb').trim() || '32mb';
app.use(express.json({ limit: jsonBodyLimit }));
app.use((req, res, next) => {
  const startedAt = Date.now();
  const requestId = randomUUID();
  res.setHeader('x-request-id', requestId);
  (req as express.Request & { requestId?: string }).requestId = requestId;
  res.on('finish', () => {
    log('info', {
      msg: 'http_request',
      requestId,
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      latencyMs: Date.now() - startedAt,
    });
  });
  next();
});

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'byla-backend' });
});

app.use('/api', apiRoutes);

app.listen(config.port, () => {
  log('info', { msg: `Byla backend listening on http://localhost:${config.port}` });
  if (config.geminiApiKey) {
    log('info', { msg: 'GEMINI_API_KEY: carregada (relatórios com IA)' });
  }
  if (config.groqApiKey) {
    log('info', { msg: 'GROQ_API_KEY: carregada (fallback IA quando Gemini atinge limite)' });
  }
  if (config.openaiApiKey) {
    log('info', { msg: 'OPENAI_API_KEY: carregada (relatórios com IA)' });
  }
  if (!config.geminiApiKey && !config.groqApiKey && !config.openaiApiKey) {
    log('warn', {
      msg: 'Relatórios: adicione GEMINI_API_KEY, GROQ_API_KEY ou OPENAI_API_KEY no .env para gerar texto com IA.',
    });
  }
});
