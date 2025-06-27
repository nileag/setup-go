const core = require('@actions/core');
const github = require('@actions/github');
const cache = require('@actions/cache');

async function run() {
  try {
    // Only save cache on master branch
    const ref = github.context.ref;
    core.info(`Current ref: ${ref}`);
    
    if (ref !== 'refs/heads/master') {
      core.info('Not on master branch, skipping cache save');
      return;
    }

    // Only save if cache wasn't hit
    const cacheHit = core.getState('cache-hit') === 'true';
    core.info(`Cache hit: ${cacheHit}`);
    
    if (cacheHit) {
      core.info('Cache was hit, skipping cache save');
      return;
    }

    // Get cache configuration from state
    const cacheKey = core.getState('cache-key');
    const cachePaths = core.getState('cache-paths');

    if (!cacheKey || !cachePaths) {
      core.warning('Cache configuration not found in state, skipping save');
      return;
    }

    core.info(`Saving cache with key: ${cacheKey}`);
    core.info(`Cache paths: ${cachePaths.replace('\n', ', ')}`);

    // Save cache
    try {
      const paths = cachePaths.split('\n').filter(Boolean);
      
      core.info('Saving cache...');
      await cache.saveCache(paths, cacheKey);
      core.info('Cache saved successfully');
    } catch (error) {
      // Don't fail the action if cache save fails
      core.warning(`Cache save failed: ${error.message}`);
    }

  } catch (error) {
    // Don't fail the action for cache save issues
    core.warning(`Post action failed: ${error.message}`);
  }
}

run();