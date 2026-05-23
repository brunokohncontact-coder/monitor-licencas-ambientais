// classificador.js
// Modulo puro de classificacao de gravidade por regras deterministicas.
// Sem rede, sem estado, sem efeitos colaterais.

function normalizar(str) {
  return String(str || '').toLowerCase()
    .replace(/[áàâãä]/g, 'a').replace(/[éèêë]/g, 'e')
    .replace(/[íìîï]/g, 'i').replace(/[óòôõö]/g, 'o')
    .replace(/[úùûü]/g, 'u').replace(/ç/g, 'c').replace(/ñ/g, 'n');
}

function classificarPublicacao(pub) {
  const tipo  = String(pub && pub.tipo   || '');
  const titulo = String(pub && pub.titulo || '');
  const resumo = String(pub && pub.resumo || '');
  const texto  = normalizar(tipo + ' ' + titulo + ' ' + resumo);

  // Regra 1: gravidade critica — embargo, interdicao, suspensao/cassacao de licenca
  const palavrasCriticas = [
    'embargo', 'embargada', 'embargado',
    'interdicao', 'interditada', 'interditado',
    'suspensao de licenca', 'cassacao de licenca'
  ];
  if (palavrasCriticas.some(p => texto.includes(p))) {
    return {
      gravidade:  'critica',
      prazo:      'Imediato — verifique urgentemente',
      acao:       'Contatar advogado ambiental imediatamente',
      explicacao: 'Medida restritiva emitida pelo orgao ambiental. Pode implicar paralisacao de operacoes. Acao urgente necessaria.'
    };
  }

  // Regra 2: gravidade alta — auto de infracao
  const palavrasAltas = ['auto de infracao', 'autuacao', 'infracao ambiental'];
  if (palavrasAltas.some(p => texto.includes(p))) {
    return {
      gravidade:  'alta',
      prazo:      '20 dias corridos para apresentar defesa administrativa',
      acao:       'Apresentar defesa administrativa',
      explicacao: 'Auto de infracao emitido pelo orgao ambiental. O prazo de defesa e de 20 dias corridos a partir da data de publicacao.'
    };
  }

  // Regra 3: gravidade alta — notificacao (sem licenca concedida/aprovada/expedida/emitida)
  const licencaConcedidaExpressoes = [
    'licenca concedida', 'licenca aprovada', 'licenca expedida', 'licenca emitida'
  ];
  if (texto.includes('notificacao') && !licencaConcedidaExpressoes.some(p => texto.includes(p))) {
    return {
      gravidade:  'alta',
      prazo:      'Verificar prazo indicado na publicacao',
      acao:       'Responder a notificacao dentro do prazo estabelecido',
      explicacao: 'Notificacao emitida pelo orgao ambiental. Verifique o prazo de resposta na publicacao original.'
    };
  }

  // Regra 4: gravidade media — renovacao de licenca (renovacao + licenca|lo|li|lp)
  if (texto.includes('renovacao') && (
    texto.includes('licenca') ||
    /\blo\b/.test(texto) ||
    /\bli\b/.test(texto) ||
    /\blp\b/.test(texto)
  )) {
    return {
      gravidade:  'media',
      prazo:      'Requerer renovacao com 120 dias de antecedencia do vencimento',
      acao:       'Verificar data de vencimento e requerer renovacao preventiva',
      explicacao: 'Publicacao relacionada a renovacao de licenca. Verifique se o prazo de renovacao esta proximo para evitar operacao sem licenca.'
    };
  }

  // Regra 5: gravidade media — exigencia ou condicionante
  const palavrasMedia = ['complementacao', 'exigencia', 'condicionante'];
  if (palavrasMedia.some(p => texto.includes(p))) {
    return {
      gravidade:  'media',
      prazo:      'Verificar prazo indicado na publicacao',
      acao:       'Atender as exigencias ou condicionantes no prazo',
      explicacao: 'Exigencia ou condicionante emitida pelo orgao ambiental. Requer acao dentro do prazo estabelecido.'
    };
  }

  // Regra 6: gravidade media — Portaria/Resolucao (campo tipo ORIGINAL, sem normalizar)
  const palavrasNormativa = ['Portaria', 'Resolucao', 'Resolução', 'Instrucao Normativa', 'Instrução'];
  if (palavrasNormativa.some(p => tipo.includes(p))) {
    return {
      gravidade:  'media',
      prazo:      'Verificar aplicabilidade e prazo de adequacao',
      acao:       'Avaliar impacto da norma na operacao da empresa',
      explicacao: 'Portaria ou resolucao publicada por orgao ambiental. Avalie se a norma afeta diretamente a operacao ou as licencas da empresa.'
    };
  }

  // Regra 7: gravidade baixa — licenca concedida/aprovada/expedida/emitida ou concessao de licenca
  const licencaOk = ['licenca concedida', 'licenca aprovada', 'licenca expedida', 'licenca emitida', 'concessao de licenca'];
  if (licencaOk.some(p => texto.includes(p))) {
    return {
      gravidade:  'baixa',
      prazo:      'Nenhuma acao imediata',
      acao:       'Arquivar e atualizar registros de compliance',
      explicacao: 'Licenca concedida pelo orgao ambiental. Verifique as condicionantes estabelecidas no ato e arquive o documento.'
    };
  }

  // Regra 8: fallback — qualquer outra publicacao
  return {
    gravidade:  'baixa',
    prazo:      'Verificar se requer acao',
    acao:       'Consultar a publicacao original',
    explicacao: 'Publicacao relacionada ao monitoramento ambiental da empresa. Verifique o documento original para determinar se requer acao.'
  };
}

module.exports = { classificarPublicacao };
