const Anthropic = require('@anthropic-ai/sdk');
const OpenAI = require('openai');

const USE_ANTHROPIC = !!process.env.ANTHROPIC_API_KEY;

const anthropic = USE_ANTHROPIC ? new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
}) : null;

const openrouter = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY,
  baseURL: 'https://openrouter.ai/api/v1',
  defaultHeaders: {
    'HTTP-Referer': 'http://localhost:3000',
    'X-Title': 'Jarvis OS'
  }
});

const CLAUDE_MODEL = 'claude-sonnet-4-5';
const CLAUDE_HAIKU = 'claude-haiku-4-5-20251001';
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || 'openai/gpt-4o-mini';

async function chat({ system, messages, maxTokens = 1000, temperature = 0.7, modelo = null }) {
  if (USE_ANTHROPIC) {
    // Permite override de modelo — Haiku para acciones, Sonnet para chat
    const modeloFinal = modelo || CLAUDE_MODEL;
    const response = await anthropic.messages.create({
      model: modeloFinal,
      max_tokens: maxTokens,
      system,
      messages
    });
    return {
      content: response.content[0].text,
      modelo: modeloFinal,
      motor: 'anthropic'
    };
  } else {
    const response = await openrouter.chat.completions.create({
      model: OPENROUTER_MODEL,
      temperature,
      max_tokens: maxTokens,
      messages: [
        { role: 'system', content: system },
        ...messages
      ]
    });
    return {
      content: response?.choices?.[0]?.message?.content || '',
      modelo: OPENROUTER_MODEL,
      motor: 'openrouter'
    };
  }
}

module.exports = { chat, USE_ANTHROPIC, CLAUDE_MODEL, CLAUDE_HAIKU };