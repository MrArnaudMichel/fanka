/**
 * @param {{ url?: string, model?: string, timeoutMs?: number }} [opts]
 */
export function createOllama({ url = 'http://localhost:11434', model = 'qwen3.5:latest', timeoutMs = 60000 } = {}) {
  let first = true;
  return {
    /** @param {string} prompt @returns {Promise<string>} */
    async chat(prompt) {
      // The first request loads the model, which takes much longer.
      const timeout = first ? Math.max(timeoutMs, 180000) : timeoutMs;
      const res = await fetch(`${url}/api/chat`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          model,
          stream: false,
          think: false,
          format: 'json',
          options: { temperature: 0.4 },
          messages: [{ role: 'user', content: prompt }],
        }),
        signal: AbortSignal.timeout(timeout),
      });
      if (!res.ok) throw new Error(`Ollama ${res.status}`);
      const body = await res.json();
      first = false;
      return String(body?.message?.content ?? '');
    },
  };
}
