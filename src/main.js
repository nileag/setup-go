const core = require('@actions/core');
const exec = require('@actions/exec');
const github = require('@actions/github');
const cache = require('@actions/cache');
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
    
    // Validate working directory exists
    if (!fs.existsSync(workingDirectory)) {
      throw new Error(`Working directory does not exist: ${workingDirectory}`);
    }

    core.info(`Setting up Go with version file: ${goVersionFile}`);
    core.info(`Working directory: ${workingDirectory}`);
    core.info(`Job name: ${jobName}`);

    // Setup Go using actions/setup-go functionality
    core.info('Setting up Go...');
    
    // First, install Go using the version from go.mod
    const goModPath = path.resolve(workingDirectory, goVersionFile);
    if (!fs.existsSync(goModPath)) {
      throw new Error(`Go version file not found: ${goModPath}`);
    }
    
    // Read Go version from go.mod
    const goModContent = fs.readFileSync(goModPath, 'utf8');
    const goVersionMatch = goModContent.match(/^go\s+([0-9.]+)/m);
    if (!goVersionMatch) {
      throw new Error(`Could not find Go version in ${goVersionFile}`);
    }
    
    const goVersion = goVersionMatch[1];
    core.info(`Found Go version ${goVersion} in ${goVersionFile}`);
    
    // Download and install Go
    const platform = process.platform;
    const arch = process.arch === 'x64' ? 'amd64' : process.arch;
    const osName = platform === 'win32' ? 'windows' : platform === 'darwin' ? 'darwin' : 'linux';
    const ext = platform === 'win32' ? 'zip' : 'tar.gz';
    
    const goUrl = `https://dl.google.com/go/go${goVersion}.${osName}-${arch}.${ext}`;
    const goRoot = path.join(process.env.HOME || process.env.USERPROFILE, 'go-install', goVersion);
    
    // Check if Go is already installed
    const goBin = path.join(goRoot, 'bin', platform === 'win32' ? 'go.exe' : 'go');
    
    if (!fs.existsSync(goBin)) {
      core.info(`Installing Go ${goVersion} to ${goRoot}`);
      
      // Create installation directory
      fs.mkdirSync(path.dirname(goRoot), { recursive: true });
      
      // Download Go
      const downloadPath = path.join(process.env.RUNNER_TEMP || '/tmp', `go${goVersion}.${ext}`);
      await exec.exec('curl', ['-L', '-o', downloadPath, goUrl]);
      
      // Extract Go
      if (ext === 'tar.gz') {
        await exec.exec('tar', ['-xzf', downloadPath, '-C', path.dirname(goRoot)]);
        await exec.exec('mv', [path.join(path.dirname(goRoot), 'go'), goRoot]);
      } else {
        await exec.exec('unzip', [downloadPath, '-d', path.dirname(goRoot)]);
        await exec.exec('mv', [path.join(path.dirname(goRoot), 'go'), goRoot]);
      }
      
      // Clean up download
      fs.unlinkSync(downloadPath);
    }
    
    // Add Go to PATH
    core.addPath(path.join(goRoot, 'bin'));
    
    // Set GOROOT
    core.exportVariable('GOROOT', goRoot);
    
    // Verify installation
    const versionOutput = await exec.getExecOutput('go', ['version']);
    const installedVersion = versionOutput.stdout.match(/go([0-9.]+)/)?.[1];
    if (!installedVersion) {
      throw new Error('Failed to verify Go installation');
    }

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

    core.info(`Cache key: ${cacheKey}`);
    core.info(`Cache paths: ${cachePathsString.replace('\n', ', ')}`);

    // Restore cache
    core.info('Restoring Go cache...');
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