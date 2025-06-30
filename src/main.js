const core = require('@actions/core');
const exec = require('@actions/exec');
const github = require('@actions/github');
const cache = require('@actions/cache');
const setupGo = require('@actions/setup-go');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

async function getFileHash(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    return crypto.createHash('sha256').update(content).digest('hex').substring(0, 8);
  } catch (error) {
    core.warning(`Could not read ${filePath}: ${error.message}`);
    return 'missing';
  }
}

function buildRestoreKeys(runneros, goVersion, jobName, goSumHash) {
  return [
    `golang-${runneros}-${goVersion}-${jobName}-${goSumHash}`,
    `golang-${runneros}-${goVersion}-${jobName}`,
    `golang-${runneros}-${goVersion}`,
    `golang-${runneros}`
  ].join('\n');
}

async function run() {
  try {
    // Get and validate inputs
    const goVersionFile = core.getInput('go-version-file', { required: true });
    if (!goVersionFile) {
      throw new Error('go-version-file input is required');
    }
    
    const workingDirectory = core.getInput('working-directory') || '.';
    const jobName = core.getInput('job-name') || github.context.job;
    
    core.debug(`Working directory: ${workingDirectory}`);
    core.debug(`Job name: ${jobName}`);

    // Setup Go using actions/setup-go
    core.info('Setting up go...');
    
    // Use actions/setup-go to install Go (with caching disabled)
    const installedVersion = await setupGo.run({
      'go-version-file': goVersionFile,
      'check-latest': false,
      'cache': false
    });

    core.info(`Go version: ${installedVersion}`);
    core.setOutput('go-version', installedVersion);

    // Build cache configuration
    const runner = process.env.RUNNER_OS || 'Linux';
    const goSumPath = path.join(workingDirectory, 'go.sum');
    const goSumHash = await getFileHash(goSumPath);
    const cacheKey = `golang-${runner}-${installedVersion}-${jobName}-${goSumHash}`;
    const restoreKeys = buildRestoreKeys(runner, installedVersion, jobName, goSumHash);
    
    const cachePathsString = [
      '~/.cache/go-build',
      '~/go/pkg/mod'
    ].join('\n');

    core.debug(`Cache key: ${cacheKey}`);
    core.debug(`Cache paths: ${cachePathsString.replace('\n', ', ')}`);

    // Restore cache
    core.info('Restoring go cache...');
    const cachePaths = [
      path.join(process.env.HOME || process.env.USERPROFILE, '.cache', 'go-build'),
      path.join(process.env.HOME || process.env.USERPROFILE, 'go', 'pkg', 'mod')
    ];
    
    const restoreKeysArray = restoreKeys.split('\n').filter(Boolean);
    
    let cacheHit = false;
    let restoredKey = null;
    
    try {
      restoredKey = await cache.restoreCache(cachePaths, cacheKey, restoreKeysArray);
      cacheHit = restoredKey === cacheKey;
      
      core.info(`Cache restore result: ${restoredKey ? 'hit' : 'miss'}`);
      if (restoredKey) {
        core.info(`Restored cache key: ${restoredKey}`);
      }
    } catch (error) {
      core.warning(`Cache restore failed: ${error.message}`);
    }
    
    // Save state for post action
    core.saveState('cache-key', cacheKey);
    core.saveState('cache-paths', cachePaths.join('\n'));
    core.saveState('cache-hit', cacheHit.toString());
    
    core.setOutput('cache-hit', cacheHit.toString());
    core.info(`Cache operation completed. Hit: ${cacheHit}`);

  } catch (error) {
    core.setFailed(`Action failed: ${error.message}`);
  }
}

run();