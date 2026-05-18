/** Provedores OpenAI-compatíveis usados no Relatório Final (URL sem barra final). */
export const IA_API_PRESETS = [
  {
    id: 'openai',
    label: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    modeloSugerido: 'gpt-4o-mini',
  },
  {
    id: 'openrouter',
    label: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    modeloSugerido: 'openai/gpt-4o-mini',
  },
  {
    id: 'freetheai',
    label: 'Free The AI',
    baseUrl: 'https://api.freetheai.xyz/v1',
    modeloSugerido: 'gpt-4o-mini',
  },
] as const;
