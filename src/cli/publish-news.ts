#!/usr/bin/env node

import { readFile, readdir } from 'fs/promises';
import { join, basename } from 'path';
import * as jsonc from 'jsonc-parser';
import { 
  createConsoleLogger, 
  getGitHubAuthToken,
  createAuthenticatedOctokit,
  parseRepoRef,
} from '../lib/utils.js';
import { ConfigSchema } from '../lib/schemas.js';

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
    const authToken = getGitHubAuthToken();
    const octokit = await createAuthenticatedOctokit();
    
    // Get authenticated user info
    const { data: user } = await octokit.rest.users.getAuthenticated();
    logger.info(`Publishing as: ${user.login}`);

    // Process each repository
    let failedRepos: string[] = [];
    for (const [owner, repo] of repos) {
      logger.info(`Publishing news reports for: ${owner}/${repo}`);

      // Find all markdown files in the reports directory
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
        logger.warn(`No markdown reports found in ${reportsDir}`);
        failedRepos.push(`${owner}/${repo}`);
        continue;
      }

      logger.info(`Found ${reportFiles.length} report(s) to publish`);

      // Get all existing gists for the user
      const { data: gists } = await octokit.rest.gists.list({
        per_page: 100,
      });

      // Process each report file
      for (const reportFile of reportFiles) {
        const fileName = basename(reportFile);
        const gistFileName = `${owner}-${repo}-${fileName}`;
        const reportContent = await readFile(reportFile, 'utf-8');

        // Extract title from the first line of the report
        const firstLine = reportContent.split('\n')[0] ?? '';
        const gistDescription = firstLine.startsWith('#') 
          ? firstLine.replace(/^#+\s*/, '').trim()
          : `Activity Report for ${owner}/${repo} - ${fileName.replace('.md', '')}`;

        // Find existing gist with this filename
        const existingGist = gists.find(gist => 
          Object.keys(gist.files ?? {}).includes(gistFileName)
        );

        if (existingGist) {
          // Update existing gist
          logger.info(`Updating existing gist: ${gistFileName} (${existingGist.id})`);
          try {
            const { data: updatedGist } = await octokit.rest.gists.update({
              gist_id: existingGist.id,
              description: gistDescription,
              files: {
                [gistFileName]: {
                  content: reportContent,
                },
              },
            });
            logger.info(`✓ Updated gist: ${updatedGist.html_url}`);
          } catch (error) {
            logger.error(`Failed to update gist ${existingGist.id}: ${error}`);
            failedRepos.push(`${owner}/${repo}`);
          }
        } else {
          // Create new gist
          logger.info(`Creating new gist: ${gistFileName}`);
          try {
            const { data: newGist } = await octokit.rest.gists.create({
              description: gistDescription,
              public: false,
              files: {
                [gistFileName]: {
                  content: reportContent,
                },
              },
            });
            logger.info(`✓ Created gist: ${newGist.html_url}`);
          } catch (error) {
            logger.error(`Failed to create gist: ${error}`);
            failedRepos.push(`${owner}/${repo}`);
          }
        }
      }

      logger.info(`Completed publishing reports for ${owner}/${repo}`);
    }

    if (failedRepos.length > 0) {
      logger.warn(`Failed to process ${failedRepos.length} repository(ies): ${failedRepos.join(', ')}`);
      process.exit(1);
    }
    logger.info(`All repositories processed successfully`);

  } catch (error) {
    logger.error(`Failed to publish news: ${error}`);
    process.exit(1);
  }
}

main().catch(console.error);
