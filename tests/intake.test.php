<?php
declare(strict_types=1);

require_once __DIR__ . '/../api/src/Intake.php';
require_once __DIR__ . '/../api/src/FirestoreRest.php';

$failures = 0;

function check(bool $condition, string $message): void
{
    global $failures;
    if ($condition) {
        echo "ok  {$message}\n";
        return;
    }
    $failures++;
    echo "FAIL {$message}\n";
}

final class FakeStore implements IntakeStore
{
    /** @param list<array<string, mixed>> $locations */
    /** @param list<array<string, mixed>> $rejections */
    public function __construct(
        public array $locations = [],
        public array $rejections = [],
        public array $created = [],
    ) {
    }

    public function locationsByAddress(string $normalized): array
    {
        return array_values(array_filter(
            $this->locations,
            static fn (array $row): bool => ($row['normalizedAddress'] ?? '') === $normalized,
        ));
    }

    public function rejectionsByAddress(string $normalized): array
    {
        return array_values(array_filter(
            $this->rejections,
            static fn (array $row): bool => ($row['normalizedAddress'] ?? '') === $normalized,
        ));
    }

    public function rejectionsByZip(string $zip): array
    {
        return array_values(array_filter(
            $this->rejections,
            static fn (array $row): bool => ($row['zip'] ?? '') === $zip,
        ));
    }

    public function createLocation(array $fields): string
    {
        $this->created[] = $fields;
        return 'loc-new';
    }
}

function tempConfig(int $limit = 100): array
{
    $dir = sys_get_temp_dir() . '/tjb-intake-' . bin2hex(random_bytes(4));
    mkdir($dir);
    return [
        'dir' => $dir,
        'project_id' => 'demo-tropical-juice',
        'service_account_json' => $dir . '/sa.json',
        'api_keys' => ['test-key-1234567890' => 'muse'],
        'rate_limit_per_hour' => $limit,
        'log_file' => $dir . '/intake.log',
        'rate_limit_file' => $dir . '/rate.json',
    ];
}

function body(array $extra = []): string
{
    return json_encode(array_merge([
        'address' => '100 Demo Harbor Dr.',
        'city' => 'Miami',
        'state' => 'fl',
        'zip' => '33139',
        'sqft' => 1450,
        'rent' => 8200,
    ], $extra), JSON_THROW_ON_ERROR);
}

$norm = intake_normalize_address('100 Demo Harbor Dr.', 'Miami', 'FL', '33139-1234');
check($norm === '100 demo harbor dr|miami|fl|33139', 'normalize matches the TypeScript form');
check(intake_normalize_address('A & B Plaza', 'St. Pete', 'fl', '33701') === 'a and b plaza|st pete|fl|33701', 'ampersand and punctuation fold');

$store = new FakeStore();
$config = tempConfig();
[$status, $payload] = intake_process($config, 'test-key-1234567890', body(), $store, '10.0.0.8');
check($status === 201 && ($payload['id'] ?? '') === 'loc-new', 'creates a pool location');
check(($store->created[0]['source'] ?? '') === 'bot:muse', 'source comes from the API key, not the body');
check(($store->created[0]['status'] ?? '') === 'pool', 'bot rows land in the pool');
check(($store->created[0]['createdBy'] ?? '') === 'bot:muse', 'createdBy is the bot source');
$log = (string) file_get_contents($config['log_file']);
check(!str_contains($log, 'test-key-1234567890'), 'logs do not contain the API key');
check(str_contains($log, 'muse'), 'logs record the source name');

$dup = new FakeStore(locations: [[
    'id' => 'loc-existing',
    'normalizedAddress' => '100 demo harbor dr|miami|fl|33139',
]]);
[$status, $payload] = intake_process(tempConfig(), 'test-key-1234567890', body(), $dup, '10.0.0.9');
check($status === 409 && ($payload['id'] ?? '') === 'loc-existing' && $dup->created === [], 'duplicate normalized address is not written again');

$warn = new FakeStore(rejections: [[
    'id' => 'rej-zip',
    'normalizedAddress' => '8 mythic ave|example harbor|fl|33139',
    'zip' => '33139',
    'reasonCode' => 'visibility',
    'reasonText' => 'FAKE demo row.',
]]);
[$status, $payload] = intake_process(tempConfig(), 'test-key-1234567890', body(), $warn, '10.0.0.10');
check($status === 201 && ($payload['rejectionWarnings'][0]['match'] ?? '') === 'zip', 'zip match is returned as a warning and the row is still created');

$addressHit = new FakeStore(rejections: [[
    'id' => 'rej-address',
    'normalizedAddress' => '100 demo harbor dr|miami|fl|33139',
    'zip' => '33139',
    'reasonCode' => 'rent',
    'reasonText' => 'FAKE',
]]);
[$status, $payload] = intake_process(tempConfig(), 'nope', body(), $addressHit, '10.0.0.11');
check($status === 401 && $addressHit->created === [], 'unknown API key is rejected');

[$status] = intake_process(tempConfig(), 'test-key-1234567890', '{"address":"x","nope":1}', new FakeStore(), '10.0.0.12');
check($status === 400, 'unknown fields are rejected');

[$status] = intake_process(tempConfig(), 'test-key-1234567890', body(['sqft' => 12.5]), new FakeStore(), '10.0.0.13');
check($status === 400, 'fractional sqft is rejected');

$limited = tempConfig(2);
$bucket = new FakeStore();
$first = intake_process($limited, 'test-key-1234567890', body(), $bucket, '10.1.0.1')[0];
$second = intake_process($limited, 'test-key-1234567890', body(['address' => '200 Sample Bay Rd', 'city' => 'Tampa', 'zip' => '33602']), $bucket, '10.1.0.1')[0];
$third = intake_process($limited, 'test-key-1234567890', body(['address' => '9 River Fake Blvd', 'city' => 'Jacksonville', 'zip' => '32202']), $bucket, '10.1.0.1')[0];
check($first === 201 && $second === 201 && $third === 429 && count($bucket->created) === 2, 'per-key rate limit blocks the third write');

$encoded = RestFirestore::encodeFields([
    'address' => '1 Demo St',
    'sqft' => 1200,
    'lat' => 25.7,
    'claimedBy' => null,
    'createdAt' => '2026-01-01T00:00:00Z',
]);
check(($encoded['sqft']['integerValue'] ?? '') === '1200', 'sqft is encoded as an integer');
check(isset($encoded['lat']['doubleValue']), 'latitude is encoded as a double');
check(array_key_exists('nullValue', $encoded['claimedBy']), 'null claim fields stay null');
check(($encoded['createdAt']['timestampValue'] ?? '') === '2026-01-01T00:00:00Z', 'timestamps use timestampValue');

$example = (string) file_get_contents(__DIR__ . '/../api/config.example.php');
check(str_contains($example, 'replace-me-with-a-long-random-string'), 'example config has a placeholder key');
check(!str_contains($example, 'BEGIN PRIVATE KEY'), 'example config has no private key');
check(!str_contains((string) file_get_contents(__DIR__ . '/../api/intake.php'), 'BEGIN PRIVATE KEY'), 'endpoint has no embedded key');

echo $failures === 0 ? "php tests passed\n" : "php tests failed: {$failures}\n";
exit($failures === 0 ? 0 : 1);
