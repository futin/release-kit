// CLI: `node dist/esm/releases-json.js <outFile> [repoRoot=cwd]`. Esm only and never imported by index.ts, so the cjs build leaves it out.
import { writeReleasesJson } from './read-releases.js';
const [outFile, repoRoot = process.cwd()] = process.argv.slice(2);
if (!outFile) {
    console.error('usage: releases-json <outFile> [repoRoot]');
    process.exit(2);
}
await writeReleasesJson(repoRoot, outFile);
