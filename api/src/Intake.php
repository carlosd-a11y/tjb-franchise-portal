<?php
declare(strict_types=1);

/**
 * Pure intake helpers. No network and no secrets.
 * Kept in sync with src/lib/normalize.ts and firestore.rules.
 */

final class IntakeHttpException extends RuntimeException
{
    public function __construct(public int $status, string $message)
    {
        parent::__construct($message);
    }
}

interface IntakeStore
{
    /** @return list<array<string, mixed>> */
    public function locationsByAddress(string $normalized): array;

    /** @return list<array<string, mixed>> */
    public function rejectionsByAddress(string $normalized): array;

    /** @return list<array<string, mixed>> */
    public function rejectionsByZip(string $zip): array;

    /** @param array<string, mixed> $fields */
    public function createLocation(array $fields): string;
}

function intake_normalize_part(string $value): string
{
    $value = strtolower(trim($value));
    $value = str_replace('&', ' and ', $value);
    $value = preg_replace('/[^a-z0-9 -]/', ' ', $value) ?? '';
    $value = preg_replace('/\s+/', ' ', $value) ?? '';
    return trim($value);
}

function intake_zip5(string $zip): string
{
    if (preg_match('/\d{5}/', $zip, $match) === 1) {
        return $match[0];
    }
    return '';
}

function intake_normalize_address(string $address, string $city, string $state, string $zip): string
{
    return implode('|', [
        intake_normalize_part($address),
        intake_normalize_part($city),
        intake_normalize_part($state),
        intake_zip5($zip),
    ]);
}

/**
 * @param array<string, string> $keys
 */
function intake_source_for_key(array $keys, string $provided): ?string
{
    foreach ($keys as $key => $source) {
        if (!is_string($key) || !is_string($source)) {
            continue;
        }
        if (strlen($key) !== strlen($provided) || !hash_equals($key, $provided)) {
            continue;
        }
        if (preg_match('/^[a-z0-9-]{1,24}$/', $source) !== 1) {
            return null;
        }
        return $source;
    }
    return null;
}

/**
 * @param array<string, mixed> $payload
 * @return array{ok: true, location: array<string, mixed>}|array{ok: false, error: string}
 */
function intake_validate(array $payload): array
{
    $allowed = ['address', 'city', 'state', 'zip', 'sqft', 'rent', 'lat', 'lng'];
    foreach (array_keys($payload) as $key) {
        if (!in_array($key, $allowed, true)) {
            return ['ok' => false, 'error' => 'Unknown field.'];
        }
    }
    foreach (['address', 'city', 'state', 'zip', 'sqft', 'rent'] as $required) {
        if (!array_key_exists($required, $payload)) {
            return ['ok' => false, 'error' => 'Missing ' . $required . '.'];
        }
    }

    $address = intake_clean_string($payload['address'], 200);
    $city = intake_clean_string($payload['city'], 80);
    $state = is_string($payload['state']) ? strtoupper(trim($payload['state'])) : '';
    $zipRaw = is_string($payload['zip']) ? trim($payload['zip']) : '';
    if ($address === null || $city === null) {
        return ['ok' => false, 'error' => 'Address and city are required.'];
    }
    if (preg_match('/^[A-Z]{2}$/', $state) !== 1) {
        return ['ok' => false, 'error' => 'State must be 2 letters.'];
    }
    if (preg_match('/^\d{5}(-\d{4})?$/', $zipRaw) !== 1) {
        return ['ok' => false, 'error' => 'ZIP must be 5 digits.'];
    }
    $zip = substr($zipRaw, 0, 5);
    if (!is_int($payload['sqft']) || $payload['sqft'] < 1 || $payload['sqft'] > 1000000) {
        return ['ok' => false, 'error' => 'Sq ft must be a whole number.'];
    }
    if (!is_int($payload['rent']) || $payload['rent'] < 0 || $payload['rent'] > 10000000) {
        return ['ok' => false, 'error' => 'Rent must be whole dollars.'];
    }

    $lat = null;
    $lng = null;
    $hasLat = array_key_exists('lat', $payload) && $payload['lat'] !== null;
    $hasLng = array_key_exists('lng', $payload) && $payload['lng'] !== null;
    if ($hasLat || $hasLng) {
        if (!is_numeric($payload['lat'] ?? null) || !is_numeric($payload['lng'] ?? null)) {
            return ['ok' => false, 'error' => 'Latitude and longitude must both be numbers.'];
        }
        $lat = (float) $payload['lat'];
        $lng = (float) $payload['lng'];
        if ($lat < -90 || $lat > 90 || $lng < -180 || $lng > 180) {
            return ['ok' => false, 'error' => 'Coordinates are out of range.'];
        }
    }

    $normalized = intake_normalize_address($address, $city, $state, $zip);
    if ($normalized === '' || strlen($normalized) > 300 || preg_match('/^[a-z0-9| -]+$/', $normalized) !== 1) {
        return ['ok' => false, 'error' => 'That address cannot be saved.'];
    }

    return ['ok' => true, 'location' => [
        'address' => $address,
        'city' => $city,
        'state' => $state,
        'zip' => $zip,
        'normalizedAddress' => $normalized,
        'lat' => $lat,
        'lng' => $lng,
        'sqft' => $payload['sqft'],
        'rent' => $payload['rent'],
    ]];
}

function intake_clean_string(mixed $value, int $max): ?string
{
    if (!is_string($value)) {
        return null;
    }
    $clean = trim(preg_replace('/\s+/', ' ', $value) ?? '');
    if ($clean === '' || strlen($clean) > $max) {
        return null;
    }
    return $clean;
}

/**
 * @param list<array<string, mixed>> $byAddress
 * @param list<array<string, mixed>> $byZip
 * @return list<array<string, mixed>>
 */
function intake_warnings(string $normalized, array $byAddress, array $byZip): array
{
    $out = [];
    $seen = [];
    foreach ($byAddress as $row) {
        $id = (string) ($row['id'] ?? '');
        $seen[$id] = true;
        $out[] = intake_warning_row($row, 'address');
    }
    foreach ($byZip as $row) {
        $id = (string) ($row['id'] ?? '');
        if (isset($seen[$id]) || ($row['normalizedAddress'] ?? '') === $normalized) {
            continue;
        }
        $out[] = intake_warning_row($row, 'zip');
    }
    return $out;
}

/**
 * @param array<string, mixed> $row
 * @return array<string, mixed>
 */
function intake_warning_row(array $row, string $match): array
{
    return [
        'id' => $row['id'] ?? null,
        'match' => $match,
        'reasonCode' => $row['reasonCode'] ?? null,
        'reasonText' => $row['reasonText'] ?? null,
        'zip' => $row['zip'] ?? null,
    ];
}

function intake_rate_allow(string $file, string $bucket, int $limit, int $window = 3600): bool
{
    $handle = fopen($file, 'c+');
    if ($handle === false) {
        throw new IntakeHttpException(500, 'Intake is not configured');
    }
    try {
        if (!flock($handle, LOCK_EX)) {
            throw new IntakeHttpException(500, 'Intake is not configured');
        }
        $raw = stream_get_contents($handle);
        $data = is_string($raw) && $raw !== '' ? json_decode($raw, true) : [];
        if (!is_array($data)) {
            $data = [];
        }
        $now = time();
        $hits = [];
        foreach ($data[$bucket] ?? [] as $stamp) {
            if (is_int($stamp) && $stamp > $now - $window) {
                $hits[] = $stamp;
            }
        }
        $allowed = count($hits) < $limit;
        if ($allowed) {
            $hits[] = $now;
        }
        $data[$bucket] = $hits;
        rewind($handle);
        ftruncate($handle, 0);
        fwrite($handle, json_encode($data) ?: '{}');
        fflush($handle);
        return $allowed;
    } finally {
        flock($handle, LOCK_UN);
        fclose($handle);
    }
}

/**
 * @param array<string, mixed> $fields
 */
function intake_log(string $file, array $fields): void
{
    unset($fields['apiKey'], $fields['authorization'], $fields['private_key']);
    $fields['ts'] = gmdate('c');
    $dir = dirname($file);
    if (!is_dir($dir)) {
        return;
    }
    file_put_contents($file, json_encode($fields, JSON_UNESCAPED_SLASHES) . "\n", FILE_APPEND | LOCK_EX);
}

/**
 * @param array<string, mixed> $config
 * @return array{0: int, 1: array<string, mixed>}
 */
function intake_process(array $config, string $apiKey, string $rawBody, IntakeStore $store, string $clientIp = 'unknown'): array
{
    $log = (string) ($config['log_file'] ?? '');
    $rateFile = (string) ($config['rate_limit_file'] ?? '');
    $limit = (int) ($config['rate_limit_per_hour'] ?? 60);
    if ($limit < 1) {
        $limit = 60;
    }
    $keys = $config['api_keys'] ?? [];
    if (!is_array($keys)) {
        $keys = [];
    }

    if ($rateFile !== '') {
        $ipBucket = 'ip:' . hash('sha256', $clientIp);
        if (!intake_rate_allow($rateFile, $ipBucket, max($limit * 4, 30))) {
            if ($log !== '') {
                intake_log($log, ['result' => 'rate_limited', 'scope' => 'ip']);
            }
            return [429, ['ok' => false, 'error' => 'Rate limit exceeded']];
        }
    }

    /** @var array<string, string> $keys */
    $source = intake_source_for_key($keys, $apiKey);
    if ($source === null) {
        if ($log !== '') {
            intake_log($log, ['result' => 'unauthorized']);
        }
        return [401, ['ok' => false, 'error' => 'Unauthorized']];
    }

    if ($rateFile !== '' && !intake_rate_allow($rateFile, 'key:' . hash('sha256', $apiKey), $limit)) {
        if ($log !== '') {
            intake_log($log, ['result' => 'rate_limited', 'source' => $source]);
        }
        return [429, ['ok' => false, 'error' => 'Rate limit exceeded']];
    }

    if (strlen($rawBody) > 8192) {
        return [413, ['ok' => false, 'error' => 'Body too large']];
    }

    try {
        $decoded = json_decode($rawBody, true, 16, JSON_THROW_ON_ERROR);
    } catch (Throwable) {
        return [400, ['ok' => false, 'error' => 'Invalid JSON']];
    }
    if (!is_array($decoded)) {
        return [400, ['ok' => false, 'error' => 'Body must be a JSON object.']];
    }

    $validated = intake_validate($decoded);
    if (!$validated['ok']) {
        if ($log !== '') {
            intake_log($log, ['result' => 'invalid', 'source' => $source]);
        }
        return [400, ['ok' => false, 'error' => $validated['error']]];
    }

    $location = $validated['location'];
    $normalized = (string) $location['normalizedAddress'];
    $warnings = intake_warnings(
        $normalized,
        $store->rejectionsByAddress($normalized),
        $store->rejectionsByZip((string) $location['zip']),
    );
    $existing = $store->locationsByAddress($normalized);
    if ($existing !== []) {
        if ($log !== '') {
            intake_log($log, ['result' => 'duplicate', 'source' => $source, 'normalizedAddress' => $normalized]);
        }
        return [409, [
            'ok' => false,
            'error' => 'duplicate',
            'id' => $existing[0]['id'] ?? null,
            'rejectionWarnings' => $warnings,
        ]];
    }

    $now = gmdate('Y-m-d\TH:i:s\Z');
    $fields = $location + [
        'source' => 'bot:' . $source,
        'status' => 'pool',
        'claimedBy' => null,
        'claimedByName' => null,
        'claimedAt' => null,
        'passReason' => null,
        'createdBy' => 'bot:' . $source,
        'createdAt' => $now,
        'lastActivityAt' => $now,
    ];
    $id = $store->createLocation($fields);
    if ($log !== '') {
        intake_log($log, [
            'result' => 'created',
            'source' => $source,
            'id' => $id,
            'normalizedAddress' => $normalized,
            'warnings' => count($warnings),
        ]);
    }
    return [201, [
        'ok' => true,
        'id' => $id,
        'duplicate' => false,
        'rejectionWarnings' => $warnings,
    ]];
}

function intake_request_key(): string
{
    $header = (string) ($_SERVER['HTTP_AUTHORIZATION'] ?? '');
    if (preg_match('/^Bearer\s+(\S+)$/i', $header, $match) === 1) {
        return $match[1];
    }
    return (string) ($_SERVER['HTTP_X_API_KEY'] ?? '');
}

/**
 * @return array<string, mixed>
 */
function intake_load_config(): array
{
    $path = getenv('TJ_INTAKE_CONFIG') ?: '';
    if ($path === '' || !is_file($path)) {
        throw new IntakeHttpException(500, 'Intake is not configured');
    }
    $config = require $path;
    if (!is_array($config)) {
        throw new IntakeHttpException(500, 'Intake is not configured');
    }
    foreach (['project_id', 'service_account_json', 'api_keys', 'log_file', 'rate_limit_file'] as $key) {
        if (!isset($config[$key]) || $config[$key] === '' || $config[$key] === []) {
            throw new IntakeHttpException(500, 'Intake is not configured');
        }
    }
    if (preg_match('/^[a-z][a-z0-9-]{3,40}$/', (string) $config['project_id']) !== 1) {
        throw new IntakeHttpException(500, 'Intake is not configured');
    }
    if (!is_file((string) $config['service_account_json'])) {
        throw new IntakeHttpException(500, 'Intake is not configured');
    }
    return $config;
}
