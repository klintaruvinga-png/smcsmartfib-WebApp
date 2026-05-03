"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const FALLBACK_PATH_FILE = path.resolve(REPO_ROOT, "tests", "php", "php-cli-path.txt");
const DEFAULT_PHP_BIN = process.platform === "win32" ? "php.exe" : "php";
const PHP_TEST_SCRIPTS = [
    path.resolve(REPO_ROOT, "tests", "php", "test-execution-engine.php"),
    path.resolve(REPO_ROOT, "tests", "php", "test-webhook-contract.php"),
];

function resolvePhpPath() {
    const phpBin = (process.env.PHP_BIN || "").trim();
    if (phpBin) return phpBin;

    const phpCliPath = (process.env.PHP_CLI_PATH || "").trim();
    if (phpCliPath) return phpCliPath;
    if (fs.existsSync(FALLBACK_PATH_FILE)) {
        const filePath = fs.readFileSync(FALLBACK_PATH_FILE, "utf8").trim();
        if (filePath) {
            const looksLikeAbsolute = /^[a-zA-Z]:\\|^\//.test(filePath);
            if (!looksLikeAbsolute || fs.existsSync(filePath)) {
                return filePath;
            }
        }
    }
    return DEFAULT_PHP_BIN;
}

const phpPath = resolvePhpPath();

if (!phpPath) {
    console.error(
        [
            "PHP CLI is not configured.",
            "Set PHP_BIN (preferred) / PHP_CLI_PATH, or create tests/php/php-cli-path.txt with a PHP CLI path.",
            "Example:",
            '  $env:PHP_CLI_PATH = "C:\\\\php\\\\php.exe"',
        ].join("\n"),
    );
    process.exit(2);
}

for (const scriptPath of PHP_TEST_SCRIPTS) {
    const result = spawnSync(phpPath, [scriptPath], {
        cwd: REPO_ROOT,
        stdio: "inherit",
    });

    if (result.error) {
        console.error(result.error.message);
        process.exit(1);
    }
    if (result.status !== 0) {
        process.exit(result.status == null ? 1 : result.status);
    }
}

process.exit(0);
