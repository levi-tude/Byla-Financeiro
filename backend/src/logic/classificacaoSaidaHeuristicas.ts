/**
 * Padrões de texto no extrato (pessoa + descrição) → linhas típicas do CONTROLE.
 * Complementa match por planilha de pagamentos e regras explícitas.
 */

/** Pilates Mari: instrutora/pagamento óbvio sem a palavra "PILATES" na descrição do banco. */
export function hayIndicaPilatesMari(hay: string): boolean {
  const pilatesExplicito =
    hay.includes('PILATES') && (hay.includes('MARI') || hay.includes('MARINA') || hay.includes('MARINO'));
  if (pilatesExplicito) return true;
  if (!hay.includes('MARINA')) return false;
  return (
    hay.includes('MELO') ||
    hay.includes('RODRIGUES') ||
    hay.includes('STUDIO') ||
    hay.includes('INSTRUT') ||
    hay.includes('PROFESS') ||
    hay.includes('HONOR') ||
    hay.includes('PILATES')
  );
}

/** Telefonia / banda larga (evita colidir com energia). */
export function hayIndicaTelecom(hay: string): boolean {
  if (hay.includes('ENEL') || hay.includes('CEMIG') || hay.includes('ENERGIA') || hay.includes('LUZ')) return false;
  return (
    hay.includes('TELEFONICA') ||
    hay.includes('TELEFON') ||
    hay.includes('TELECOM') ||
    hay.includes('VIVO') ||
    hay.includes('CLARO') ||
    hay.includes('TIM ') ||
    hay.startsWith('TIM ') ||
    hay.includes(' OI ') ||
    hay.startsWith('OI ') ||
    hay.includes('EMBRATEL') ||
    hay.includes('SERCOMTEL') ||
    hay.includes('ALGAR') ||
    hay.includes('GVT') ||
    hay.includes('NET CLARO') ||
    hay.includes('OI MOVEL') ||
    hay.includes('NEXTEL')
  );
}

export function hayIndicaSeguro(hay: string): boolean {
  return (
    hay.includes('SEGURO') ||
    hay.includes('SULAMERICA') ||
    hay.includes('SUL AMERICA') ||
    hay.includes('PORTO SEGURO') ||
    hay.includes('MAPFRE') ||
    hay.includes('ALLIANZ') ||
    hay.includes('HDI') ||
    hay.includes('TOKIO') ||
    hay.includes('AZUL SEGURO') ||
    hay.includes('BRADESCO SEGURO') ||
    hay.includes('ITAU SEGURO') ||
    hay.includes('SOMPO') ||
    hay.includes('MITSUI')
  );
}
