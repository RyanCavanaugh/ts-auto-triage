/**
 * Parse FAQ markdown file into individual FAQ entries
 */

export interface FAQEntry {
  /** The title/question of the FAQ entry (h3 heading) */
  title: string;
  /** The full content of the FAQ entry including the title */
  content: string;
}

/**
 * Parse FAQ markdown into individual sections based on h3 (###) headings
 * @param faqContent The raw markdown content of the FAQ file
 * @returns Array of FAQ entries
 */
export function parseFAQ(faqContent: string): FAQEntry[] {
  const entries: FAQEntry[] = [];
  
  // Split by ### headings (h3)
  const sections = faqContent.split(/^### /m);
  
  // Skip the first section (everything before the first ###)
  for (let i = 1; i < sections.length; i++) {
    const section = sections[i];
    if (!section) continue;
    
    // Extract title (first line) and content
    const lines = section.split('\n');
    const title = lines[0]?.trim() ?? '';
    
    if (title) {
      entries.push({
        title,
        content: `### ${section}`,
      });
    }
  }
  
  return entries;
}
