import { describe, it } from 'node:test';
import assert from 'node:assert';
import { classificarSaidaCompleta } from './classificacaoSaidaBanco.js';
import type { EntidadeByla } from '../domain/funcionariosByla.js';

const planilhaLinhas = [
  { titulo: 'Saídas Fixas', label: 'Funcionários', valor: 5000 },
  { titulo: 'Saídas Parceiros', label: 'Pilates Mari', valor: 3000 },
  { titulo: 'Saídas Fixas', label: 'Energia', valor: 100 },
];

const planilhaComTeatro = [
  ...planilhaLinhas,
  { titulo: 'Saídas Parceiros', label: 'Teatro', valor: 0 },
  { titulo: 'Saídas Parceiros', label: 'Teatro Infantil', valor: 0 },
];

describe('classificarSaidaCompleta', () => {
  it('prioriza linha com nome da pessoa no CONTROLE em vez da agregada Funcionários', () => {
    const linhasComNome = [
      { titulo: 'Saídas Fixas', label: 'Funcionários', valor: 5000 },
      { titulo: 'Saídas Fixas', label: 'Luciana — honorários', valor: 1200 },
    ];
    const ent: EntidadeByla[] = [{ nome: 'Luciana', funcao: 'Equipe', aliases: [] }];
    const r = classificarSaidaCompleta('LUCIANA COSTA', 'PIX', 500, linhasComNome, ent);
    assert.strictEqual(r.regra, 'nome_na_planilha');
    assert.ok(r.linha_planilha_ref?.includes('Luciana'));
    assert.ok(!r.linha_planilha_ref?.toLowerCase().includes('funcion'));
  });

  it('regra funcionario quando nome bate no extrato e existe linha Funcionários', () => {
    const ent: EntidadeByla[] = [{ nome: 'Nilson', funcao: 'Equipe', aliases: ['NILSON'] }];
    const r = classificarSaidaCompleta('JOSE NILSON ALVES', 'PIX', 500, planilhaLinhas, ent);
    assert.strictEqual(r.regra, 'funcionario');
    assert.ok(r.linha_planilha_ref?.includes('Funcion'));
    assert.strictEqual(r.detalhe, 'Nilson');
  });

  it('regra match_controle quando descrição indica conta de luz (ENEL → Energia)', () => {
    const ent: EntidadeByla[] = [];
    const r = classificarSaidaCompleta('ENEL', 'Fatura', 198.88, planilhaLinhas, ent);
    assert.strictEqual(r.regra, 'match_controle');
    assert.ok(r.linha_planilha_ref?.includes('Energia'));
  });

  it('funcionario com linha Funcionarios sem acento', () => {
    const linhas = [{ titulo: 'Fixas', label: 'Funcionarios', valor: 1 }];
    const ent: EntidadeByla[] = [{ nome: 'Ana', funcao: 'Equipe', aliases: [] }];
    const r = classificarSaidaCompleta('ANA SILVA', 'PIX', 100, linhas, ent);
    assert.strictEqual(r.regra, 'funcionario');
    assert.ok(r.linha_planilha_ref?.includes('Funcion'));
  });

  it('teatro (unificado) via índice planilha pagamentos — match pagador', () => {
    const ent: EntidadeByla[] = [];
    const indice = [
      { kind: 'teatro_unificado' as const, aba: 'TEATRO INFANTIL', nomes: ['Maria Pais', 'Filho Aluno'] },
    ];
    const r = classificarSaidaCompleta('MARIA PAIS', 'PIX MENSALIDADE', 200, planilhaComTeatro, ent, {
      indicePagadorControle: indice,
    });
    assert.strictEqual(r.regra, 'pagador_planilha_controle');
    assert.ok(r.linha_planilha_ref?.includes('Teatro'));
  });

  it('pilates mari por heurística Marina de Melo Rodrigues (sem índice) — match_controle', () => {
    const ent: EntidadeByla[] = [];
    const r = classificarSaidaCompleta('MARINA DE MELO RODRIGUES', 'PIX', 1200, planilhaLinhas, ent);
    assert.strictEqual(r.regra, 'match_controle');
    assert.ok(r.linha_planilha_ref?.includes('Pilates'));
  });

  it('telecom quando extrato indica operadora e existe linha no CONTROLE', () => {
    const ent: EntidadeByla[] = [];
    const linhas = [
      ...planilhaLinhas,
      { titulo: 'Saídas Fixas', label: 'Telefone / Internet', valor: 0 },
    ];
    const r = classificarSaidaCompleta('TELEFONICA BRASIL', 'Fatura', 99, linhas, ent);
    assert.strictEqual(r.regra, 'match_controle');
    assert.ok(r.linha_planilha_ref?.includes('Telefone') || r.linha_planilha_ref?.includes('Internet'));
  });

  it('seguro quando extrato indica seguradora e existe linha Seguro', () => {
    const ent: EntidadeByla[] = [];
    const linhas = [
      ...planilhaLinhas,
      { titulo: 'Saídas Fixas', label: 'Seguros', valor: 0 },
    ];
    const r = classificarSaidaCompleta('PORTO SEGURO', 'Mensalidade', 450, linhas, ent);
    assert.strictEqual(r.regra, 'match_controle');
    assert.ok(r.linha_planilha_ref?.includes('Seguro'));
  });

  it('pilates mari via índice planilha pagamentos (ex.: pagamento à Marina)', () => {
    const ent: EntidadeByla[] = [];
    const planilhaPilates = [
      ...planilhaLinhas,
      { titulo: 'Saídas Parceiros', label: 'Pilates Mari', valor: 0 },
    ];
    const indice = [{ kind: 'pilates_mari' as const, aba: 'PILATES', nomes: ['Marina Professora'] }];
    const r = classificarSaidaCompleta('MARINA PROFESSORA', 'PIX HONORARIO', 800, planilhaPilates, ent, {
      indicePagadorControle: indice,
    });
    assert.strictEqual(r.regra, 'pagador_planilha_controle');
    assert.ok(r.linha_planilha_ref?.includes('Pilates'));
  });
});
