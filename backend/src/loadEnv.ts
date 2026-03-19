/**
 * Carrega .env o mais cedo possível (antes de config e rotas).
 * Deve ser o primeiro import em index.ts.
 */
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendDir = path.resolve(__dirname, '..');
const cwd = process.cwd();

// Prioridade: .env ao lado de package.json do backend (caminho absoluto, override para garantir)
const backendEnv = path.resolve(backendDir, '.env');
dotenv.config({ path: backendEnv, override: true });
dotenv.config({ path: path.resolve(cwd, '.env') });
dotenv.config({ path: path.resolve(cwd, 'backend', '.env') });
