import './loadEnv.js';
import express from 'express';
import cors from 'cors';
import { config } from './config.js';
import apiRoutes from './routes/api.js';

const app = express();
const corsOrigins = config.corsOrigin;
function corsOriginHandler(origin: string | undefined, cb: (err: Error | null, allow?: boolean) => void) {
  if (!origin) return cb(null, true);
  if (corsOrigins.includes(origin)) return cb(null, true);
  if (origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:')) return cb(null, true);
  return cb(null, false);
}
app.use(cors({ origin: corsOriginHandler, optionsSuccessStatus: 200 }));
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'byla-backend' });
});

app.use('/api', apiRoutes);

app.listen(config.port, () => {
  console.log(`Byla backend listening on http://localhost:${config.port}`);
  if (config.geminiApiKey) {
    console.log('GEMINI_API_KEY: carregada (relatórios com IA)');
  }
  if (config.groqApiKey) {
    console.log('GROQ_API_KEY: carregada (fallback IA quando Gemini atinge limite)');
  }
  if (config.openaiApiKey) {
    console.log('OPENAI_API_KEY: carregada (relatórios com IA)');
  }
  if (!config.geminiApiKey && !config.groqApiKey && !config.openaiApiKey) {
    console.log('Relatórios: sem chave de IA; será usado texto automático (sem IA). Adicione GEMINI_API_KEY ou GROQ_API_KEY no .env para IA.');
  }
});
