import type { GenerateJson } from './types.js';

/** Real Gemini transport using the official Google GenAI SDK (loaded lazily to keep cold starts fast). */
export function geminiTransport(apiKey: string, model: string): GenerateJson {
  let client: Promise<import('@google/genai').GoogleGenAI> | undefined;
  return async ({ system, prompt, schema, signal }) => {
    client ??= import('@google/genai').then(
      ({ GoogleGenAI }) => new GoogleGenAI({ apiKey, apiVersion: 'v1beta' }),
    );
    const ai = await client;
    const res = await ai.models.generateContent({
      model,
      contents: prompt,
      config: {
        systemInstruction: system,
        responseMimeType: 'application/json',
        responseJsonSchema: schema,
        temperature: 0.2,
        maxOutputTokens: 1024,
        abortSignal: signal,
      },
    });
    if (!res.text) throw new Error('Empty Gemini response');
    return res.text;
  };
}
