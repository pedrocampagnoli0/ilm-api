/**
 * Motor de cálculo da avaliação online: transforma as respostas item a item
 * (avaliacao_online_resposta) nos MESMOS campos que o lançamento manual grava
 * em resultado_avaliacao — mesmos códigos, mesmo domínio (ver
 * lermais-auth/src/domain/avaliacao/campos.ts, que é a fonte da verdade dos
 * códigos aceitos pela RPC upsert_resultados_avaliacao_batch).
 *
 * IMPORTANTE — por que `nivel_leitura` não vem de "acertou/errou": a fluência
 * de leitura é julgada pela professora OUVINDO a criança ler (widget "Área da
 * professora" na tela — botões de nível 1-4, já no valor final 1-based igual
 * ao código do banco). Não existe heurística de acerto de clique para isso.
 * `nivel_escrita` e `escreve_nome` exigem amostra em PAPEL e não entram aqui
 * de forma alguma — continuam só no lançamento manual (ver
 * AvaliacaoOnlineService.concluir, que preserva os valores já salvos desses
 * dois campos ao gravar).
 */

export type CicloGrupo = 'ei2' | 'f1' | 'f2';

export function cicloGrupoDoNome(cicloNome: string): CicloGrupo | null {
  if (/^ed_infantil/i.test(cicloNome)) return 'ei2';
  if (cicloNome === 'fundamental_1') return 'f1';
  if (cicloNome === 'fundamental_2') return 'f2';
  return null;
}

export interface RespostaAgg {
  bloco: string;
  tipo: string;
  correta: boolean | null;
  valor: unknown;
  tempo_ms: number | null;
}

function contaCorretas(respostas: RespostaAgg[], bloco: string): number {
  return respostas.filter((r) => r.bloco === bloco && r.correta === true).length;
}

function totalRespondidas(respostas: RespostaAgg[], bloco: string): number {
  return respostas.filter((r) => r.bloco === bloco).length;
}

/** "Metade ou mais dos itens do sub-bloco vale 1 ponto" — 1 se ok*2 >= total, senão 0. */
function ponto(respostas: RespostaAgg[], bloco: string): number {
  const total = totalRespondidas(respostas, bloco);
  if (total === 0) return 0;
  return contaCorretas(respostas, bloco) * 2 >= total ? 1 : 0;
}

/** Faixa 1-based: n <= cortes[0] -> 1, n <= cortes[1] -> 2, ... senão length+1. */
function faixaUmBased(n: number, cortes: number[]): number {
  for (let i = 0; i < cortes.length; i++) {
    if (n <= cortes[i]) return i + 1;
  }
  return cortes.length + 1;
}

/**
 * Nível de leitura (1-4): moda dos valores `valor.nivel` (já 1-based, mesmo
 * código do banco) registrados pela professora nesse bloco. Empate resolvido
 * pelo menor nível (mesmo critério do protótipo: não arredondar para cima).
 * `null` quando a professora não avaliou nenhum item desse bloco.
 */
function nivelDe(respostas: RespostaAgg[], bloco: string): number | null {
  const contagem = new Map<number, number>();
  for (const r of respostas) {
    if (r.bloco !== bloco) continue;
    const v = (r.valor as { nivel?: unknown } | null)?.nivel;
    if (typeof v !== 'number') continue;
    contagem.set(v, (contagem.get(v) ?? 0) + 1);
  }
  if (contagem.size === 0) return null;
  let melhor: number | null = null;
  for (const [v, c] of contagem) {
    if (melhor === null) { melhor = v; continue; }
    const cMelhor = contagem.get(melhor)!;
    if (c > cMelhor || (c === cMelhor && v < melhor)) melhor = v;
  }
  return melhor;
}

/** PPM = palavras / (tempo total em minutos), somado sobre os itens tipo "paragrafo" do bloco. */
function ppmDoBloco(respostas: RespostaAgg[], bloco: string): number | null {
  let palavras = 0;
  let ms = 0;
  for (const r of respostas) {
    if (r.bloco !== bloco || r.tipo !== 'paragrafo') continue;
    const p = (r.valor as { palavras?: unknown } | null)?.palavras;
    if (typeof p === 'number') palavras += p;
    if (typeof r.tempo_ms === 'number') ms += r.tempo_ms;
  }
  if (!ms || !palavras) return null;
  return Math.round(palavras / (ms / 60000));
}

export interface ResultadoCalculado {
  [campo: string]: number | null;
}

/**
 * Calcula os campos de resultado_avaliacao deriváveis das respostas da
 * avaliação online, para o grupo de ciclo indicado. Campos fora do domínio
 * automatizável (nivel_escrita, escreve_nome) NUNCA aparecem aqui — quem
 * grava (AvaliacaoOnlineService.concluir) preserva o que já existir para eles.
 */
export function calcularResultado(
  grupo: CicloGrupo,
  respostas: RespostaAgg[],
): ResultadoCalculado {
  if (grupo === 'ei2') {
    const nomesLetras = faixaUmBased(contaCorretas(respostas, 'nome_letra'), [5, 15]);
    const sonsLetras = faixaUmBased(contaCorretas(respostas, 'som_letra'), [5, 20]);
    const nivelLeitura = nivelDe(respostas, 'palavras');
    const fonologica =
      ponto(respostas, 'palavras_frase') + ponto(respostas, 'silabas') +
      ponto(respostas, 'rima') + ponto(respostas, 'aliteracao');
    const fonemica = Math.min(2, contaCorretas(respostas, 'descubra'));

    return {
      ei2_nomes_letras: totalRespondidas(respostas, 'nome_letra') ? nomesLetras : null,
      ei2_sons_letras: totalRespondidas(respostas, 'som_letra') ? sonsLetras : null,
      ei2_nivel_leitura: nivelLeitura,
      ei2_consciencia_fonologica: fonologica,
      ei2_consciencia_fonemica: fonemica,
    };
  }

  if (grupo === 'f1') {
    const nivelLeitura = nivelDe(respostas, 'frases') ?? nivelDe(respostas, 'palavras');
    const fonologica = ponto(respostas, 'silabas') + ponto(respostas, 'rima');
    const fonemica = ponto(respostas, 'aliteracao') + ponto(respostas, 'descubra');
    const compreensaoFrases =
      contaCorretas(respostas, 'compreensao') + contaCorretas(respostas, 'cloze');

    return {
      f1_nivel_leitura: nivelLeitura,
      f1_consciencia_fonologica: fonologica,
      f1_consciencia_fonemica: fonemica,
      f1_compreensao_frases: Math.min(5, compreensaoFrases),
    };
  }

  // f2
  const nivelLeitura =
    nivelDe(respostas, 'texto') ?? nivelDe(respostas, 'frases') ?? nivelDe(respostas, 'palavras');
  const compreensaoFrases =
    contaCorretas(respostas, 'compreensao') + contaCorretas(respostas, 'cloze');
  const compreensaoTexto = contaCorretas(respostas, 'quiz');
  const ppm = ppmDoBloco(respostas, 'texto');

  const resultado: ResultadoCalculado = {
    f2_nivel_leitura: nivelLeitura,
    f2_compreensao_frases: Math.min(5, compreensaoFrases),
    f2_compreensao_texto: Math.min(5, compreensaoTexto),
  };
  if (ppm !== null) resultado.ppm = ppm;
  return resultado;
}
