// src/lib/llm.js
// Abstraccion del LLM — Claude directo o OpenRouter
// Cambiar de modelo = cambiar variable de entorno, nada mas

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
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || 'openai/gpt-4o-mini';

async function chat({ system, messages, maxTokens = 1000, temperature = 0.7 }) {
  if (USE_ANTHROPIC) {
    // Claude directo — SDK nativo
    const response = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: maxTokens,
      system,
      messages
    });
    return {
      content: response.content[0].text,
      modelo: CLAUDE_MODEL,
      motor: 'anthropic'
    };
  } else {
    // OpenRouter fallback
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

module.exports = { chat, USE_ANTHROPIC, CLAUDE_MODEL };