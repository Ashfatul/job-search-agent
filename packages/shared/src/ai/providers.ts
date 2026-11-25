import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createGroq } from '@ai-sdk/groq';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { embed, type LanguageModel } from 'ai';

export interface ProviderCandidate {
  name: string;
  model: LanguageModel;
}

/**
 * Builds an ordered list of $0/month free-tier LLM providers:
 * 1. Google AI Studio (Gemini 3.5 Flash-Lite / 3.5 Flash / 2.5 Flash)
 * 2. Groq (GPT-OSS 120B / Qwen 3.8 27B / GPT-OSS 20B)
 * 3. OpenRouter (openrouter/free auto-router & active :free models)
 */
export function getFreeModelChain(): ProviderCandidate[] {
  const candidates: ProviderCandidate[] = [];

  const googleKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (googleKey) {
    const google = createGoogleGenerativeAI({ apiKey: googleKey });
    candidates.push({
      name: 'google:gemini-3.5-flash-lite',
      model: google('gemini-3.5-flash-lite'),
    });
    candidates.push({
      name: 'google:gemini-3.5-flash',
      model: google('gemini-3.5-flash'),
    });
    candidates.push({
      name: 'google:gemini-2.5-flash',
      model: google('gemini-2.5-flash'),
    });
  }

  const groqKey = process.env.GROQ_API_KEY;
  if (groqKey) {
    const groq = createGroq({ apiKey: groqKey });
    candidates.push({
      name: 'groq:openai/gpt-oss-120b',
      model: groq('openai/gpt-oss-120b'),
    });
    candidates.push({
      name: 'groq:qwen/qwen3.8-27b',
      model: groq('qwen/qwen3.8-27b'),
    });
    candidates.push({
      name: 'groq:openai/gpt-oss-20b',
      model: groq('openai/gpt-oss-20b'),
    });
  }

  const openrouterKey = process.env.OPENROUTER_API_KEY;
  if (openrouterKey) {
    const openrouter = createOpenAICompatible({
      name: 'openrouter',
      baseURL: 'https://openrouter.ai/api/v1',
      apiKey: openrouterKey,
      headers: {
        'HTTP-Referer': process.env.WEB_APP_URL ?? 'http://localhost:3000',
        'X-OpenRouter-Title': 'Job Search Bot',
      },
    });
    const freeModel = process.env.OPENROUTER_FREE_MODEL || 'openrouter/free';
    candidates.push({
      name: `openrouter:${freeModel}`,
      model: openrouter(freeModel),
    });
    if (freeModel !== 'google/gemma-4-31b-it:free') {
      candidates.push({
        name: 'openrouter:google/gemma-4-31b-it:free',
        model: openrouter('google/gemma-4-31b-it:free'),
      });
    }
  }

  return candidates;
}

/**
 * Runs an AI SDK call across the free provider fallback chain so transient
 * 429 rate limits or quota exhaustion on one free provider automatically fail over.
 */
export async function withFreeModelFallback<T>(
  runner: (model: LanguageModel, providerName: string) => Promise<T>,
): Promise<{ result: T; providerName: string }> {
  const chain = getFreeModelChain();
  if (chain.length === 0) {
    throw new Error(
      'No free LLM API key configured. Set GOOGLE_GENERATIVE_AI_API_KEY, GROQ_API_KEY, or OPENROUTER_API_KEY.',
    );
  }

  const errors: string[] = [];
  for (const candidate of chain) {
    try {
      const result = await runner(candidate.model, candidate.name);
      return { result, providerName: candidate.name };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`${candidate.name}: ${msg}`);
    }
  }

  throw new Error(`All free LLM providers failed:\n${errors.join('\n')}`);
}

/**
 * Generates a 768-dimension embedding via Google's free Gemini embedding model
 * for semantic "somewhat search" deduplication. Returns null if unavailable.
 */
export async function generateJobEmbedding(text: string): Promise<number[] | null> {
  const googleKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!googleKey || !text.trim()) return null;

  try {
    const google = createGoogleGenerativeAI({ apiKey: googleKey });
    const { embedding } = await embed({
      model: google.textEmbeddingModel('gemini-embedding-001'),
      value: text.slice(0, 6000),
      providerOptions: {
        google: {
          outputDimensionality: 768,
        },
      },
    });
    return embedding.length === 768 ? embedding : embedding.slice(0, 768);
  } catch {
    return null;
  }
}
