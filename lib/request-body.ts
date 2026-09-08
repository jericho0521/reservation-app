export class RequestBodyError extends Error {
  constructor(message: string, public status = 413) { super(message); }
}

export async function readLimitedBody(request: Request, maxBytes: number): Promise<Uint8Array> {
  const declared = request.headers.get('content-length');
  if (declared && (!/^\d+$/.test(declared) || Number(declared) > maxBytes)) throw new RequestBodyError('Request body is too large');
  const reader = request.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        throw new RequestBodyError('Request body is too large');
      }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const result = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.length; }
  return result;
}

export async function readLimitedFormData(request: Request) {
  const bytes = await readLimitedBody(request, 21 * 1024 * 1024);
  return new Response(bytes as BodyInit, { headers: { 'Content-Type': request.headers.get('content-type') ?? '' } }).formData();
}

export async function readLimitedJson(request: Request, maxBytes = 64 * 1024): Promise<unknown> {
  return JSON.parse(new TextDecoder().decode(await readLimitedBody(request, maxBytes)));
}
