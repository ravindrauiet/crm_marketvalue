// Client-side helper: read a fetch() response as JSON. When the server returns an HTML error
// page instead (e.g. a hosting timeout / 502), produce a readable message instead of
// "Unexpected token '<' … is not valid JSON".
export async function readJson(res: Response, context = 'request'): Promise<any> {
  const text = await res.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    const timedOut = res.status === 502 || res.status === 504 || /timed?\s*out|gateway/i.test(text);
    const tooLarge = res.status === 413;
    const reason = tooLarge
      ? 'the file is too large for the server'
      : timedOut
        ? 'the server took too long to process it (try a smaller file, e.g. one month at a time)'
        : `the server returned an unexpected response (HTTP ${res.status})`;
    return { error: `Could not process ${context}: ${reason}.` };
  }
}
