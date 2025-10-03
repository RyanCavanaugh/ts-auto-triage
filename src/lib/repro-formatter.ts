import type { ReproSteps, CompilerReproSteps, LSReproSteps, BugClassification, BugRevalidation } from './schemas.js';

export interface ReproFormatter {
  formatClassification(classification: BugClassification): string;
  formatReproSteps(reproSteps: ReproSteps): string;
  formatValidation(validation: BugRevalidation): string;
  formatFullReport(
    classification: BugClassification,
    reproSteps: ReproSteps | null,
    validation: BugRevalidation | null
  ): string;
}

export function createReproFormatter(): ReproFormatter {
  return {
    formatClassification(classification: BugClassification): string {
      let output = `# Bug Classification\n\n`;
      output += `**Type:** ${classification.bugType}\n\n`;
      output += `**Reasoning:** ${classification.reasoning}\n\n`;
      return output;
    },

    formatReproSteps(reproSteps: ReproSteps): string {
      if (reproSteps.type === 'compiler-repro') {
        return formatCompilerReproSteps(reproSteps);
      } else {
        return formatLSReproSteps(reproSteps);
      }
    },

    formatValidation(validation: BugRevalidation): string {
      let output = `# Bug Validation\n\n`;
      output += `**Status:** ${validation.bug_status}\n\n`;
      output += `**Relevant Output:**\n\`\`\`\n${validation.relevant_output}\n\`\`\`\n\n`;
      output += `**Reasoning:** ${validation.reasoning}\n\n`;
      return output;
    },

    formatFullReport(
      classification: BugClassification,
      reproSteps: ReproSteps | null,
      validation: BugRevalidation | null
    ): string {
      let report = `# Reproduction Report\n\n`;
      
      report += `## Classification\n\n`;
      report += `**Type:** ${classification.bugType}\n\n`;
      report += `**Reasoning:** ${classification.reasoning}\n\n`;

      if (classification.bugType === 'unknown') {
        report += `No reproduction steps were generated because the bug type could not be determined.\n`;
        return report;
      }

      if (reproSteps) {
        report += `## Reproduction Steps\n\n`;
        report += formatReproStepsSection(reproSteps);
      }

      if (validation) {
        report += `\n## Validation Results\n\n`;
        report += `**Bug Status:** ${validation.bug_status}\n\n`;
        report += `**Relevant Output:**\n\`\`\`\n${validation.relevant_output}\n\`\`\`\n\n`;
        report += `**Reasoning:** ${validation.reasoning}\n\n`;
      }

      return report;
    },
  };
}

function formatCompilerReproSteps(reproSteps: CompilerReproSteps): string {
  let output = `# Compiler Reproduction Steps\n\n`;
  
  output += `## Files\n\n`;
  for (const [filename, content] of Object.entries(reproSteps.fileMap)) {
    output += `### ${filename}\n\n`;
    output += `\`\`\`typescript\n${content}\n\`\`\`\n\n`;
  }

  output += `## Command Line\n\n`;
  output += `\`\`\`bash\ntsc ${reproSteps.cmdLineArgs.join(' ')}\n\`\`\`\n\n`;

  output += `## Verification Instructions\n\n`;
  output += `${reproSteps.instructions}\n\n`;

  return output;
}

function formatLSReproSteps(reproSteps: LSReproSteps): string {
  let output = `# Language Service Reproduction Steps\n\n`;
  
  output += `## Twoslash File\n\n`;
  output += `\`\`\`typescript\n${reproSteps.twoslash}\n\`\`\`\n\n`;

  output += `## Verification Instructions\n\n`;
  output += `${reproSteps.instructions}\n\n`;

  return output;
}

function formatReproStepsSection(reproSteps: ReproSteps): string {
  if (reproSteps.type === 'compiler-repro') {
    let output = `**Type:** Compiler Bug\n\n`;
    
    output += `### Files\n\n`;
    for (const [filename, content] of Object.entries(reproSteps.fileMap)) {
      output += `**${filename}:**\n\`\`\`typescript\n${content}\n\`\`\`\n\n`;
    }

    output += `### Command\n\`\`\`bash\ntsc ${reproSteps.cmdLineArgs.join(' ')}\n\`\`\`\n\n`;
    output += `### Verification\n${reproSteps.instructions}\n\n`;
    
    return output;
  } else {
    let output = `**Type:** Language Service Bug\n\n`;
    
    output += `### Twoslash Content\n\`\`\`typescript\n${reproSteps.twoslash}\n\`\`\`\n\n`;
    output += `### Verification\n${reproSteps.instructions}\n\n`;
    
    return output;
  }
}
