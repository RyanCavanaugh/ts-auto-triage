import { describe, test, expect } from '@jest/globals';
import { parseFAQ } from './faq-parser.js';

describe('FAQ Parser', () => {
  test('should parse FAQ with multiple h3 sections', () => {
    const faqContent = `# Frequently Asked Questions

Some intro text.

### Question 1

Answer to question 1.

### Question 2

Answer to question 2.

Some more content.
`;

    const entries = parseFAQ(faqContent);

    expect(entries).toHaveLength(2);
    expect(entries[0]!.title).toBe('Question 1');
    expect(entries[0]!.content).toContain('### Question 1');
    expect(entries[0]!.content).toContain('Answer to question 1');
    
    expect(entries[1]!.title).toBe('Question 2');
    expect(entries[1]!.content).toContain('### Question 2');
    expect(entries[1]!.content).toContain('Answer to question 2');
  });

  test('should handle FAQ with no h3 sections', () => {
    const faqContent = `# FAQ

Just intro text, no sections.
`;

    const entries = parseFAQ(faqContent);

    expect(entries).toHaveLength(0);
  });

  test('should handle empty FAQ', () => {
    const faqContent = '';

    const entries = parseFAQ(faqContent);

    expect(entries).toHaveLength(0);
  });

  test('should parse real-world FAQ format', () => {
    const faqContent = `# Frequently Asked Questions

### Why isn't my issue being processed?

> Q: I submitted an issue yesterday but haven't seen any automated response. Is the system working?

The automated triage system processes issues in batches.

### How does the duplicate detection work?

> Q: The bot marked my issue as a duplicate, but I think it's different. What should I do?

The duplicate detection uses semantic similarity analysis.
`;

    const entries = parseFAQ(faqContent);

    expect(entries).toHaveLength(2);
    expect(entries[0]!.title).toBe("Why isn't my issue being processed?");
    expect(entries[0]!.content).toContain('automated triage system');
    
    expect(entries[1]!.title).toBe('How does the duplicate detection work?');
    expect(entries[1]!.content).toContain('semantic similarity');
  });

  test('should preserve markdown formatting in content', () => {
    const faqContent = `# FAQ

### Can you add nominal types?

See suggestion #202

### Why doesn't \`typeof T\` work?

Code example:
\`\`\`ts
function foo<T>() {
  typeof T; // error
}
\`\`\`

Generics are erased.
`;

    const entries = parseFAQ(faqContent);

    expect(entries).toHaveLength(2);
    expect(entries[0]!.content).toContain('See suggestion #202');
    expect(entries[1]!.content).toContain('```ts');
    expect(entries[1]!.content).toContain('Generics are erased');
  });
});
