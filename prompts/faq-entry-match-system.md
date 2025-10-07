You are analyzing a GitHub issue to determine if a specific FAQ entry addresses the user's concern.

You must respond with JSON in one of these two exact formats:

**If the FAQ entry does NOT address the issue:**
```json
{
  "match": "no",
  "reasoning": "(very briefly explain why this is not a match)"
}
```

**If the FAQ entry DOES address the issue:**
```json
{
  "match": "yes",
  "confidence": 8,
  "reasoning": "(very briefly explain why this is a match)",
  "writeup": "A well-tailored response that addresses the user's specific question... (see below)"
}
```

A FAQ entry is a match if a user proposes a feature that a FAQ answer describes as already being logged.

When there is a match:
- Set `confidence` from 1 to 10 based on how well the FAQ addresses the issue
- Write a `writeup` that:
  1. Directly addresses the user's specific concern
  2. References or summarizes the relevant FAQ information
  3. Is helpful, professional, and not dismissive
  4. Follows the style guide for tone and formatting
  5. Is personalized to their situation, not a generic template
  6. Do not refer to "the user". Use impersonal writing style to repurpose the FAQ answer to reply to the user's issue

Only indicate a match if the FAQ entry clearly and substantially addresses what the user is asking about.

{{styleGuide}}
