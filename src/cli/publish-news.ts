#!/usr/bin/env node

import { readFile, readdir } from 'fs/promises';
import { join } from 'path';
import * as jsonc from 'jsonc-parser';
import { 
  createConsoleLogger, 
  getGitHubAuthToken,
  createAuthenticatedOctokit,
  parseRepoRef,
} from '../lib/utils.js';
import { ConfigSchema } from '../lib/schemas.js';

interface PublishedReport {
  date: string; // YYYY-MM-DD format
  gistUrl: string;
  filename: string;
}

/**
 * Sanitize a filename for use in a gist URL anchor.
 * GitHub replaces special characters with hyphens in file anchors.
 */
function sanitizeFilenameForUrl(filename: string): string {
  return filename.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase();
}

/**
 * Parse existing news-index.md content to extract report links.
 * Returns a map of date -> gist URL for existing reports.
 */
function parseNewsIndex(content: string | undefined): Map<string, string> {
  const links = new Map<string, string>();
  if (!content) {
    return links;
  }
  
  const linkRegex = /^-\s*\[(\d{4}-\d{2}-\d{2})\]\(([^)]+)\)/gm;
  
  let match: RegExpExecArray | null;
  while ((match = linkRegex.exec(content)) !== null) {
    const date = match[1];
    const url = match[2];
    if (date && url) {
      links.set(date, url);
    }
  }
  
  return links;
}

/**
 * Build the content for news-index.md from a list of reports.
 * Reports should be sorted by date descending (newest first).
 */
function buildNewsIndexContent(owner: string, repo: string, reports: PublishedReport[]): string {
  const header = `# News Reports for ${owner}/${repo}\n\n`;
  const links = reports.map(r => `- [${r.date}](${r.gistUrl})`).join('\n');
  return header + links + '\n';
}

async function main() {
  const logger = createConsoleLogger();
  
  try {
    // Load configuration first
    const configContent = await readFile('config.jsonc', 'utf-8');
    const config = ConfigSchema.parse(jsonc.parse(configContent));

    // Parse command line arguments
    const args = process.argv.slice(2);
    let repos: Array<[owner: string, repo: string]> = [];

    if (args.length === 0) {
      // No arguments - use config repos
      if (!config.github.repos || config.github.repos.length === 0) {
        console.error('Usage: publish-news [<owner/repo>...]');
        console.error('Example: publish-news Microsoft/TypeScript');
        console.error('Example: publish-news Microsoft/TypeScript facebook/react');
        console.error('');
        console.error('Or configure default repositories in config.jsonc under github.repos');
        process.exit(1);
      }
      repos = config.github.repos.map(r => parseRepoRef(r));
      logger.info(`Using repos from config: ${config.github.repos.join(', ')}`);
    } else {
      // Use repos from arguments
      repos = args.map(repoInput => parseRepoRef(repoInput));
    }

    // Create authenticated Octokit client
    const octokit = await createAuthenticatedOctokit();
    
    // Get authenticated user info to find their gists
    const { data: user } = await octokit.rest.users.getAuthenticated();
    logger.info(`Publishing as user: ${user.login}`);

    // Process each repository
    let failedRepos: string[] = [];
    for (const [owner, repo] of repos) {
      logger.info(`Publishing newspaper reports for: ${owner}/${repo}`);

      const reportsDir = `.reports/${owner.toLowerCase()}/${repo.toLowerCase()}`;
      let reportFiles: string[] = [];
      
      try {
        const files = await readdir(reportsDir);
        reportFiles = files.filter(f => f.endsWith('.md')).map(f => join(reportsDir, f));
      } catch {
        logger.warn(`No reports found in ${reportsDir}. Run make-news first.`);
        failedRepos.push(`${owner}/${repo}`);
        continue;
      }

      if (reportFiles.length === 0) {
        logger.warn(`No report files found in ${reportsDir}`);
        failedRepos.push(`${owner}/${repo}`);
        continue;
      }

      logger.info(`Found ${reportFiles.length} report(s) to publish`);

      // Fetch all existing gists for the authenticated user
      const { data: gists } = await octokit.rest.gists.list({
        per_page: 100, // Fetch up to 100 gists
      });

      logger.info(`Found ${gists.length} existing gist(s) for user ${user.login}`);

      // Track published reports for this repository
      const publishedReports: PublishedReport[] = [];

      // Process each report file
      for (const reportFile of reportFiles) {
        const filename = reportFile.split('/').pop();
        if (!filename) continue;

        const content = await readFile(reportFile, 'utf-8');
        
        // Create a descriptive gist filename with dot separators
        // filename is already in YYYY-MM-DD.md format
        const gistFilename = `${owner}.${repo}.${filename}`;
        const dateStr = filename.replace('.md', ''); // Extract YYYY-MM-DD
        const gistDescription = `Daily report for ${owner}/${repo} - ${dateStr}`;

        // Check if a gist with this filename already exists
        const existingGist = gists.find(g => 
          g.files && Object.keys(g.files).includes(gistFilename)
        );

        let gistUrl: string;

        if (existingGist) {
          // Update existing gist
          logger.info(`Updating existing gist: ${existingGist.id} (${gistFilename})`);
          
          await octokit.rest.gists.update({
            gist_id: existingGist.id,
            description: gistDescription,
            files: {
              [gistFilename]: {
                content,
              },
            },
          });

          logger.info(`Updated gist: ${existingGist.html_url}`);
          gistUrl = `${existingGist.html_url}#file-${sanitizeFilenameForUrl(gistFilename)}`;
        } else {
          // Create new gist
          logger.info(`Creating new gist for ${gistFilename}`);
          
          const { data: newGist } = await octokit.rest.gists.create({
            description: gistDescription,
            public: false,
            files: {
              [gistFilename]: {
                content,
              },
            },
          });

          logger.info(`Created gist: ${newGist.html_url}`);
          gistUrl = `${newGist.html_url}#file-${sanitizeFilenameForUrl(gistFilename)}`;
        }

        // Track this published report
        publishedReports.push({
          date: dateStr,
          gistUrl,
          filename: gistFilename,
        });
      }

      logger.info(`Successfully published ${reportFiles.length} report(s) for ${owner}/${repo}`);

      // Now create or update the news-index.md gist
      logger.info(`Creating/updating news index for ${owner}/${repo}`);
      
      const indexFilename = `${owner}.${repo}.news-index.md`;
      const indexDescription = `News index for ${owner}/${repo}`;
      
      // Check if news-index already exists
      const existingIndexGist = gists.find(g =>
        g.files && Object.keys(g.files).includes(indexFilename)
      );

      // Build map of all reports (existing + new)
      const allReports = new Map<string, string>();

      // First, parse existing index if it exists
      if (existingIndexGist && existingIndexGist.files) {
        const existingFile = existingIndexGist.files[indexFilename];
        // The content property may not be typed, but it exists at runtime when fetching gists
        const fileContent = existingFile ? (existingFile as { content?: string }).content : undefined;
        if (fileContent) {
          const existingLinks = parseNewsIndex(fileContent);
          existingLinks.forEach((url, date) => allReports.set(date, url));
          logger.info(`Found ${existingLinks.size} existing report(s) in index`);
        }
      }

      // Add/update with newly published reports
      for (const report of publishedReports) {
        allReports.set(report.date, report.gistUrl);
      }

      // Sort by date descending (newest first)
      const sortedReports: PublishedReport[] = Array.from(allReports.entries())
        .sort((a, b) => b[0].localeCompare(a[0])) // Sort dates descending
        .map(([date, gistUrl]) => ({ date, gistUrl, filename: '' }));

      const indexContent = buildNewsIndexContent(owner, repo, sortedReports);

      if (existingIndexGist) {
        // Update existing index gist
        logger.info(`Updating existing news index: ${existingIndexGist.id}`);
        
        await octokit.rest.gists.update({
          gist_id: existingIndexGist.id,
          description: indexDescription,
          files: {
            [indexFilename]: {
              content: indexContent,
            },
          },
        });

        logger.info(`Updated news index: ${existingIndexGist.html_url}`);
      } else {
        // Create new index gist
        logger.info(`Creating new news index for ${owner}/${repo}`);
        
        const { data: newIndexGist } = await octokit.rest.gists.create({
          description: indexDescription,
          public: false,
          files: {
            [indexFilename]: {
              content: indexContent,
            },
          },
        });

        logger.info(`Created news index: ${newIndexGist.html_url}`);
      }
    }

    if (failedRepos.length > 0) {
      logger.warn(`Failed to process ${failedRepos.length} repository(ies): ${failedRepos.join(', ')}`);
    }
    logger.info(`All repositories processed. Success: ${repos.length - failedRepos.length}/${repos.length}`);

  } catch (error) {
    logger.error(`Failed to publish newspaper reports: ${error}`);
    process.exit(1);
  }
}

main().catch(console.error);
