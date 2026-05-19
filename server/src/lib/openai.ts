import OpenAI from 'openai';

// Single shared OpenAI client + default model. Previously instantiated in
// seven places with identical config; consolidating avoids drift and makes
// the model / base URL / key swappable from one spot.
export const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
export const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';
