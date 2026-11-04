function resolveApiUrl(): string {
  if (typeof window !== 'undefined' && window.location) {
    const host = window.location.hostname;
    // Production Cloudflare deployment
    if (host === 'checkpoint.dlsud-ilt.workers.dev') {
      return 'https://ilt-checkpoint-prod.onrender.com/api/v1';
    }
    // Dev branch and preview deployments (*-checkpoint.dlsud-ilt.workers.dev)
    if (
      host.includes('dev-checkpoint') ||
      host.endsWith('checkpoint.dlsud-ilt.workers.dev')
    ) {
      return 'https://ilt-checkpoint-dev.onrender.com/api/v1';
    }
    // Local development fallback
    if (host === 'localhost' || host === '127.0.0.1') {
      return 'http://localhost:5000/api/v1';
    }
  }
  return 'https://ilt-checkpoint-dev.onrender.com/api/v1';
}

export const environment = {
  production: true,
  get apiUrl(): string {
    return resolveApiUrl();
  },
};
