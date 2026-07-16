import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildTextoResumoWhatsApp,
  formatTimeShort,
  mesAnteriorReferenciaSaoPaulo,
  normalizeTime,
  slugifyNome,
} from '../services/aluguelSalasService.js';

describe('aluguelSalasService helpers', () => {
  it('slugifyNome gera slug estável', () => {
    assert.equal(slugifyNome('Sala do Teatro'), 'sala-do-teatro');
    assert.equal(slugifyNome('  Coworking 1  '), 'coworking-1');
  });

  it('normalizeTime completa segundos', () => {
    assert.equal(normalizeTime('9:05'), '09:05:00');
    assert.equal(normalizeTime('14:00:00'), '14:00:00');
  });

  it('formatTimeShort corta segundos', () => {
    assert.equal(formatTimeShort('14:30:00'), '14:30');
  });

  it('buildTextoResumoWhatsApp formata mensagem', () => {
    const texto = buildTextoResumoWhatsApp({
      mes: 5,
      ano: 2026,
      periodo_label: 'Maio de 2026',
      total_dias: 2,
      total_reservas: 2,
      por_sala: [
        {
          sala_id: 'x',
          sala_nome: 'Sala do Teatro',
          total_dias: 2,
          total_reservas: 2,
          itens: [
            { data: '2026-05-03', hora_inicio: '14:00', hora_fim: '18:00', titulo: 'Ensaio Cia X' },
            { data: '2026-05-10', hora_inicio: '09:00', hora_fim: '12:00', titulo: 'Workshop' },
          ],
        },
      ],
    });
    assert.match(texto, /Aluguel de salas – Maio de 2026/);
    assert.match(texto, /\*Sala do Teatro:\* 2 dia\(s\) \| 2 reserva\(s\)/);
    assert.match(texto, /03\/05 14:00–18:00 — Ensaio Cia X/);
    assert.match(texto, /10\/05 09:00–12:00 — Workshop/);
  });

  it('mesAnteriorReferenciaSaoPaulo retorna mês válido', () => {
    const r = mesAnteriorReferenciaSaoPaulo(new Date('2026-07-16T15:00:00Z'));
    assert.ok(r.mes >= 1 && r.mes <= 12);
    assert.ok(r.ano >= 2025);
  });
});
