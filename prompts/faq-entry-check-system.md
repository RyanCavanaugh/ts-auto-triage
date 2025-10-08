You are analyzing a GitHub issue to determine if a specific FAQ entry addresses the user's concern.

Your task is ONLY to determine if there is a match - you will NOT write a response at this stage.

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
  "reasoning": "(very briefly explain why this is a match)"
}
```

A FAQ entry is a match if:
- A user proposes a feature that the FAQ answer describes as already being logged
- The FAQ entry directly addresses the user's question or concern
- The FAQ entry provides relevant information that substantially helps with the user's issue

When there is a match:
- Set `confidence` from 1 to 10 based on how well the FAQ addresses the issue
- Provide brief reasoning explaining why this is a match

Only indicate a match if the FAQ entry clearly and substantially addresses what the user is asking about.
