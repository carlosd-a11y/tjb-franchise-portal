<?php
declare(strict_types=1);

/**
 * Example only. Copy this file outside the web root, for example
 * /home/USER/private/tj-intake-config.php, and point TJ_INTAKE_CONFIG at it.
 * Do not put real API keys or a service account in the repository.
 */
if (PHP_SAPI !== 'cli' && realpath($_SERVER['SCRIPT_FILENAME'] ?? '') === realpath(__FILE__)) {
    http_response_code(404);
    exit;
}

return [
    'project_id' => 'your-project-id',
    'service_account_json' => '/home/USER/private/firebase-sa.json',
    'api_keys' => [
        'replace-me-with-a-long-random-string' => 'muse',
    ],
    'rate_limit_per_hour' => 60,
    'log_file' => '/home/USER/private/intake.log',
    'rate_limit_file' => '/home/USER/private/intake-rate.json',
    'token_cache_file' => '/home/USER/private/intake-token.json',
];
