import { describe, expect, it, vi } from 'vitest';
import sharp from 'sharp';

const mockGenerateContent = vi.fn();

vi.mock('@google/genai', () => {
  class MockGoogleGenAI {
    public models = {
      generateContent: mockGenerateContent,
    };
  }
  return {
    GoogleGenAI: MockGoogleGenAI,
    Type: {
      OBJECT: 'OBJECT',
      STRING: 'STRING',
      INTEGER: 'INTEGER',
      NUMBER: 'NUMBER',
      BOOLEAN: 'BOOLEAN',
    },
  };
});

import { ComplaintAnalyzer, createOfficialGeminiClient } from '../src/server/services/geminiService';

describe('Gemini Service, Caching, Multimodal Validation & Fallback', () => {
  it('calls official @google/genai client with multimodal image inlineData and caches repeated requests', async () => {
    mockGenerateContent.mockReset();
    mockGenerateContent.mockResolvedValue({
      text: JSON.stringify({
        category: 'ROAD_INFRASTRUCTURE',
        subcategory: 'POTHOLE',
        priority: 'HIGH',
        severity: 4,
        department: 'ROADS_PUBLIC_WORKS',
        public_impact: 'Disrupts bus lane.',
        explanation: 'Deep crater visible in road.',
        recommended_action: 'Dispatch asphalt patching crew.',
        confidence_estimate: 0.92,
        requires_human_review: false,
      }),
    });

    const jpgBuffer = await sharp({
      create: { width: 24, height: 18, channels: 3, background: { r: 120, g: 130, b: 140 } },
    })
      .jpeg()
      .toBuffer();
    const dataUrl = `data:image/jpeg;base64,${jpgBuffer.toString('base64')}`;

    const analyzer = new ComplaintAnalyzer({
      geminiApiKey: 'test-server-key',
      geminiModel: 'gemini-4-hydrogen',
    });

    const first = await analyzer.analyze({
      title: 'Deep pothole near main junction',
      description: 'Large pothole causing heavy traffic slowdown near school.',
      location: 'Anna Salai',
      userCategory: 'ROAD_INFRASTRUCTURE',
      language: 'en',
      imageDataUrl: dataUrl,
    });

    expect(first.source).toBe('GEMINI');
    expect(first.finalPriority).toBe('HIGH');
    expect(mockGenerateContent).toHaveBeenCalledTimes(1);

    // Second identical call hits SHA-256 cache without calling Gemini again
    const second = await analyzer.analyze({
      title: 'Deep pothole near main junction',
      description: 'Large pothole causing heavy traffic slowdown near school.',
      location: 'Anna Salai',
      userCategory: 'ROAD_INFRASTRUCTURE',
      language: 'en',
      imageDataUrl: dataUrl,
    });

    expect(second).toEqual(first);
    expect(mockGenerateContent).toHaveBeenCalledTimes(1);
  });

  it('retries once and falls back cleanly when Gemini returns empty text or invalid schema', async () => {
    mockGenerateContent.mockReset();
    mockGenerateContent.mockResolvedValue({ text: '   ' });

    const client = createOfficialGeminiClient('test-server-key');
    await expect(
      client.generateAnalysis(
        {
          title: 'Broken streetlight',
          description: 'Dark corner near bus shelter for three nights.',
          location: 'Adyar',
          userCategory: 'STREETLIGHTS',
          language: 'en',
        },
        'gemini-4-hydrogen'
      )
    ).rejects.toThrow('Empty response received from Gemini API');

    const badSchemaAnalyzer = new ComplaintAnalyzer({
      geminiApiKey: '',
      geminiModel: 'gemini-4-hydrogen',
      geminiClient: {
        async generateAnalysis() {
          return { invalid: true };
        },
      },
    });

    const fallback = await badSchemaAnalyzer.analyze({
      title: 'Broken water pipe on street',
      description: 'Drinking water leaking along the curb since morning.',
      location: 'Mylapore',
      userCategory: 'WATER_SUPPLY',
      language: 'en',
    });

    expect(fallback.source).toBe('FALLBACK');
    expect(fallback.requiresHumanReview).toBe(true);
    expect(fallback.department).toBe('WATER_RESOURCES');
  });
});
