import { calcularResultado, cicloGrupoDoNome, type RespostaAgg } from './scoring';

function r(bloco: string, tipo: string, correta: boolean | null, valor: unknown = {}, tempo_ms: number | null = null): RespostaAgg {
  return { bloco, tipo, correta, valor, tempo_ms };
}

describe('cicloGrupoDoNome', () => {
  it('mapeia os nomes de ciclo do banco para o grupo de campos', () => {
    expect(cicloGrupoDoNome('ed_infantil_1')).toBe('ei2');
    expect(cicloGrupoDoNome('ed_infantil_2')).toBe('ei2');
    expect(cicloGrupoDoNome('fundamental_1')).toBe('f1');
    expect(cicloGrupoDoNome('fundamental_2')).toBe('f2');
    expect(cicloGrupoDoNome('outra_coisa')).toBeNull();
  });
});

describe('calcularResultado — ei2', () => {
  it('nivel_leitura usa o valor 1-based direto da professora, sem deslocamento', () => {
    // Bug do protótipo (nunca ligado a um backend real) era subtrair 1 aqui.
    const respostas = [r('palavras', 'leitura', null, { nivel: 3 })];
    expect(calcularResultado('ei2', respostas).ei2_nivel_leitura).toBe(3);
  });

  it('nivel_leitura é a moda, com empate resolvido para o menor nível', () => {
    const respostas = [
      r('palavras', 'leitura', null, { nivel: 2 }),
      r('palavras', 'leitura', null, { nivel: 3 }),
    ];
    expect(calcularResultado('ei2', respostas).ei2_nivel_leitura).toBe(2);
  });

  it('nomes_letras e sons_letras usam faixa 1-based (não 0-based)', () => {
    const respostas = [
      ...Array.from({ length: 4 }, () => r('nome_letra', 'escolha', true)),
      ...Array.from({ length: 2 }, () => r('nome_letra', 'escolha', false)),
      ...Array.from({ length: 22 }, () => r('som_letra', 'escolha', true)),
    ];
    const out = calcularResultado('ei2', respostas);
    expect(out.ei2_nomes_letras).toBe(1); // 4 acertos <= 5 -> faixa 1
    expect(out.ei2_sons_letras).toBe(3); // 22 acertos > 20 -> faixa 3
  });

  it('consciencia_fonologica soma 1 ponto por sub-bloco com >=50% de acerto', () => {
    const respostas = [
      r('palavras_frase', 'beads', true), r('palavras_frase', 'beads', true), // 2/2 -> ponto
      r('silabas', 'beads', false), r('silabas', 'beads', false),             // 0/2 -> sem ponto
      r('rima', 'escolha', true), r('rima', 'escolha', false),                // 1/2 -> ponto
      // aliteracao sem respostas -> sem ponto
    ];
    expect(calcularResultado('ei2', respostas).ei2_consciencia_fonologica).toBe(2);
  });

  it('campos sem nenhuma resposta no bloco voltam null (não 0/1 falso)', () => {
    expect(calcularResultado('ei2', []).ei2_nivel_leitura).toBeNull();
    expect(calcularResultado('ei2', []).ei2_nomes_letras).toBeNull();
  });
});

describe('calcularResultado — f1', () => {
  it('usa nivel de "frases", com fallback para "palavras"', () => {
    expect(calcularResultado('f1', [r('frases', 'leitura', null, { nivel: 4 })]).f1_nivel_leitura).toBe(4);
    expect(calcularResultado('f1', [r('palavras', 'leitura', null, { nivel: 1 })]).f1_nivel_leitura).toBe(1);
  });

  it('compreensao_frases soma compreensao + cloze, no máximo 5', () => {
    const respostas = [
      r('compreensao', 'figura', true), r('compreensao', 'figura', true),
      r('cloze', 'cloze', true), r('cloze', 'cloze', true), r('cloze', 'cloze', true),
    ];
    expect(calcularResultado('f1', respostas).f1_compreensao_frases).toBe(5);
  });
});

describe('calcularResultado — f2', () => {
  it('ppm soma palavras/tempo de todos os paragrafos do bloco "texto"', () => {
    const respostas = [
      r('texto', 'paragrafo', null, { palavras: 30 }, 30_000),
      r('texto', 'paragrafo', null, { palavras: 30 }, 30_000),
    ];
    // 60 palavras em 60s = 60 ppm
    expect(calcularResultado('f2', respostas).ppm).toBe(60);
  });

  it('omite ppm do resultado quando não há tempo registrado', () => {
    expect(calcularResultado('f2', []).ppm).toBeUndefined();
  });

  it('compreensao_texto vem do bloco quiz', () => {
    const respostas = [
      r('quiz', 'quiz', true), r('quiz', 'quiz', true), r('quiz', 'quiz', false),
    ];
    expect(calcularResultado('f2', respostas).f2_compreensao_texto).toBe(2);
  });
});
