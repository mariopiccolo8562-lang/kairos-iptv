export async function resolve(specifier, context, nextResolve) {
  if (specifier === 'cloudflare:sockets') return { url: new URL('./cloudflare-sockets.mjs', import.meta.url).href, shortCircuit: true };
  return nextResolve(specifier, context);
}
