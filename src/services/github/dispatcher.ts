import { logger } from '../../utils/logger';

export async function triggerGitHubAction(): Promise<boolean> {
  try {
    const githubToken = process.env.GITHUB_ACTION_TOKEN;
    const githubRepo = process.env.GITHUB_ACTION_REPO; // Format: "username/repo-name"

    if (githubToken === undefined || githubToken === '') {
      logger.warn('GITHUB_ACTION_TOKEN not configured, skipping GitHub Action trigger');
      return false;
    }

    if (githubRepo === undefined || githubRepo === '') {
      logger.warn('GITHUB_ACTION_REPO not configured, skipping GitHub Action trigger');
      return false;
    }

    const [owner, repo] = githubRepo.split('/');

    if (owner === undefined || repo === undefined) {
      logger.error('Invalid GITHUB_ACTION_REPO format. Expected: "username/repo-name"');
      return false;
    }

    const response = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/dispatches`,
      {
        method: 'POST',
        headers: {
          Accept: 'application/vnd.github.v3+json',
          Authorization: `Bearer ${githubToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          event_type: 'process_queue',
          client_payload: {
            triggered_at: new Date().toISOString()
          }
        })
      }
    );

    if (response.status === 204) {
      logger.info('GitHub Action triggered successfully');
      return true;
    }

    logger.error(`Failed to trigger GitHub Action: ${response.status} ${response.statusText}`);
    return false;

  } catch (error) {
    logger.error(`Error triggering GitHub Action: ${error instanceof Error ? error.message : String(error)}`);
    return false;
  }
}
