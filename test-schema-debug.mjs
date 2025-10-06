import { zodResponseFormat } from 'openai/helpers/zod.js';
import { z } from 'zod';

// Test the FAQEntryMatchSchema
const FAQEntryMatchSchema = z.discriminatedUnion('match', [
  z.object({
    match: z.literal('no'),
  }),
  z.object({
    match: z.literal('yes'),
    confidence: z.number().min(1).max(10),
    writeup: z.string(),
  }),
]);

const format = zodResponseFormat(FAQEntryMatchSchema, "response");
console.log('Generated schema:', JSON.stringify(format.json_schema, null, 2));
