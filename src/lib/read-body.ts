export async function readBody(request: Pick<Request,'headers'|'body'>, limit: number) {
  if (Number(request.headers.get("content-length")) > limit) throw new Error("Request too large");
  const reader = request.body?.getReader(); if (!reader) throw new Error("Body required");
  const chunks: Uint8Array[] = []; let size = 0;
  try {for (;;) {const v = await reader.read(); if (v.done) break; size += v.value.length; if (size > limit) throw new Error("Request too large"); chunks.push(v.value);}} finally {await reader.cancel();}
  return Buffer.concat(chunks).toString("utf8");
}
