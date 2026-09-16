// envscan-cli.config.js
// Place a file with this name (or a .envscan-clirc.json) in your project
// root and envscan-cli will pick it up automatically. CLI flags always
// override values set here.

export default {
  // Variable names to exclude from all checks. Supports a trailing
  // wildcard, e.g. "LEGACY_*" matches LEGACY_TOKEN, LEGACY_URL, etc.
  ignore: [],

  // Path to your .env.example file, relative to the scanned directory.
  exampleFile: '.env.example',

  // Suppress UNUSED warnings by default (same as --ignore-unused).
  ignoreUnused: false,

  // Scan real .env values for things that look like live credentials.
  secretDetection: true,
};
