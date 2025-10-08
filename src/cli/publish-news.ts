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

      // Process each report file
      for (const reportFile of reportFiles) {
        const filename = reportFile.split('/').pop();
        if (!filename) continue;

        const content = await readFile(reportFile, 'utf-8');
        
        // Create a descriptive gist filename
        const gistFilename = `${owner}-${repo}-${filename}`;
        const gistDescription = `Daily report for ${owner}/${repo} - ${filename.replace('.md', '')}`;

        // Check if a gist with this filename already exists
        const existingGist = gists.find(g => 
          g.files && Object.keys(g.files).includes(gistFilename)
        );

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
        }
      }

      logger.info(`Successfully published ${reportFiles.length} report(s) for ${owner}/${repo}`);
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
