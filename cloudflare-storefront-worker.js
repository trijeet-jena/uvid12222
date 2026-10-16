/* Serve the storefront from Worker assets and forward API requests to the
   existing store API Worker on the same public origin. */

export default {
  async fetch(request, env) {
    const incoming = new URL(request.url);
    if (incoming.pathname.startsWith("/api/") || incoming.pathname.startsWith("/uploads/")) {
      return env.STORE_API.fetch(request);
    }

    return env.ASSETS.fetch(request);
  }
};
