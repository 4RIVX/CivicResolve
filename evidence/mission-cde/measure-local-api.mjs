import { createApp } from '../../src/server/app.ts';
import { createEmptyPublicStats } from '../../src/server/services/firestoreRestClient.ts';
import request from 'supertest';

const stats = createEmptyPublicStats();
let mockStoreReads = 0;
const app = createApp({
  disableRateLimit: true,
  config: {
    port: 3100,
    nodeEnv: 'development',
    geminiApiKey: '',
    geminiModel: 'benchmark',
    adminEmails: new Set(),
    firebaseProjectId: '',
    firestoreDatabaseId: '(default)',
    allowedOrigins: new Set(),
  },
  dataStore: {
    getPublicAggregateStats: async () => {
      mockStoreReads += 1;
      return stats;
    },
  },
});

const routes = ['/api/health', '/api/public/statistics', '/api/public/trends'];
const percentile = (values, p) => values[Math.min(values.length - 1, Math.ceil(values.length * p) - 1)];
const result = {};

for (const route of routes) {
  for (let i = 0; i < 20; i += 1) {
    await request(app).get(route).expect(200);
  }

  const samples = [];
  for (let i = 0; i < 200; i += 1) {
    const start = performance.now();
    await request(app).get(route).expect(200);
    samples.push(performance.now() - start);
  }

  samples.sort((a, b) => a - b);
  result[route] = {
    samples: samples.length,
    p50_ms: Number(percentile(samples, 0.5).toFixed(3)),
    p95_ms: Number(percentile(samples, 0.95).toFixed(3)),
    p99_ms: Number(percentile(samples, 0.99).toFixed(3)),
  };
}

console.log(
  JSON.stringify(
    {
      scope: 'in-process Express + supertest; no network, Firestore, or Gemini; dataStore is an in-memory stub',
      mockStoreReadsForCachedEndpoints: mockStoreReads,
      routes: result,
    },
    null,
    2
  )
);
