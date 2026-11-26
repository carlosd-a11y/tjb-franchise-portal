<?php
declare(strict_types=1);

require_once __DIR__ . '/Intake.php';

/**
 * Firestore REST client using a service-account JWT. Credentials stay on disk.
 */
final class RestFirestore implements IntakeStore
{
    /** @param array<string, mixed> $config */
    public function __construct(private array $config)
    {
    }

    public function locationsByAddress(string $normalized): array
    {
        return $this->query('locations', 'normalizedAddress', $normalized);
    }

    public function rejectionsByAddress(string $normalized): array
    {
        return $this->query('rejections', 'normalizedAddress', $normalized);
    }

    public function rejectionsByZip(string $zip): array
    {
        return $this->query('rejections', 'zip', $zip);
    }

    public function createLocation(array $fields): string
    {
        $url = $this->documentsUrl() . '/locations';
        $response = $this->request('POST', $url, ['fields' => self::encodeFields($fields)]);
        $name = (string) ($response['name'] ?? '');
        $id = basename($name);
        if ($id === '' || $id === 'locations') {
            throw new IntakeHttpException(502, 'Could not write to Firestore');
        }
        return $id;
    }

    /**
     * @param array<string, mixed> $fields
     * @return array<string, array<string, mixed>>
     */
    public static function encodeFields(array $fields): array
    {
        $out = [];
        foreach ($fields as $key => $value) {
            if (!is_string($key)) {
                continue;
            }
            if (in_array($key, ['createdAt', 'lastActivityAt'], true) && is_string($value)) {
                $out[$key] = ['timestampValue' => $value];
                continue;
            }
            $out[$key] = self::encodeValue($value);
        }
        return $out;
    }

    /**
     * @return array<string, mixed>
     */
    public static function encodeValue(mixed $value): array
    {
        if ($value === null) {
            return ['nullValue' => null];
        }
        if (is_int($value)) {
            return ['integerValue' => (string) $value];
        }
        if (is_float($value)) {
            return ['doubleValue' => $value];
        }
        if (is_bool($value)) {
            return ['booleanValue' => $value];
        }
        if (is_string($value)) {
            return ['stringValue' => $value];
        }
        throw new InvalidArgumentException('Unsupported field type');
    }

    /**
     * @param array<string, mixed>|null $document
     * @return array<string, mixed>|null
     */
    public static function decodeDocument(?array $document): ?array
    {
        if ($document === null || !isset($document['name'], $document['fields']) || !is_array($document['fields'])) {
            return null;
        }
        $row = ['id' => basename((string) $document['name'])];
        foreach ($document['fields'] as $key => $value) {
            if (is_string($key) && is_array($value)) {
                $row[$key] = self::decodeValue($value);
            }
        }
        return $row;
    }

    /**
     * @param array<string, mixed> $value
     */
    public static function decodeValue(array $value): mixed
    {
        if (array_key_exists('stringValue', $value)) {
            return $value['stringValue'];
        }
        if (array_key_exists('integerValue', $value)) {
            return (int) $value['integerValue'];
        }
        if (array_key_exists('doubleValue', $value)) {
            return (float) $value['doubleValue'];
        }
        if (array_key_exists('booleanValue', $value)) {
            return (bool) $value['booleanValue'];
        }
        if (array_key_exists('nullValue', $value)) {
            return null;
        }
        if (array_key_exists('timestampValue', $value)) {
            return $value['timestampValue'];
        }
        return null;
    }

    /**
     * @return list<array<string, mixed>>
     */
    private function query(string $collection, string $field, string $value): array
    {
        $response = $this->request('POST', $this->documentsUrl() . ':runQuery', [
            'structuredQuery' => [
                'from' => [['collectionId' => $collection]],
                'where' => [
                    'fieldFilter' => [
                        'field' => ['fieldPath' => $field],
                        'op' => 'EQUAL',
                        'value' => ['stringValue' => $value],
                    ],
                ],
                'limit' => 10,
            ],
        ]);
        $rows = [];
        foreach ($response as $item) {
            if (!is_array($item)) {
                continue;
            }
            $decoded = self::decodeDocument(isset($item['document']) && is_array($item['document']) ? $item['document'] : null);
            if ($decoded !== null) {
                $rows[] = $decoded;
            }
        }
        return $rows;
    }

    private function documentsUrl(): string
    {
        $project = rawurlencode((string) $this->config['project_id']);
        return 'https://firestore.googleapis.com/v1/projects/' . $project . '/databases/(default)/documents';
    }

    /**
     * @param array<string, mixed>|null $body
     * @return array<mixed>
     */
    private function request(string $method, string $url, ?array $body = null): array
    {
        if (!function_exists('curl_init')) {
            throw new IntakeHttpException(500, 'Intake is not configured');
        }
        $token = $this->accessToken();
        $ch = curl_init($url);
        if ($ch === false) {
            throw new IntakeHttpException(502, 'Could not write to Firestore');
        }
        $headers = [
            'Authorization: Bearer ' . $token,
            'Content-Type: application/json',
        ];
        curl_setopt_array($ch, [
            CURLOPT_CUSTOMREQUEST => $method,
            CURLOPT_HTTPHEADER => $headers,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => 15,
        ]);
        if ($body !== null) {
            curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($body, JSON_UNESCAPED_SLASHES));
        }
        $raw = curl_exec($ch);
        $status = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        curl_close($ch);
        if (!is_string($raw) || $status < 200 || $status >= 300) {
            error_log('intake firestore HTTP ' . $status);
            throw new IntakeHttpException(502, 'Could not write to Firestore');
        }
        $decoded = json_decode($raw, true);
        return is_array($decoded) ? $decoded : [];
    }

    private function accessToken(): string
    {
        $cache = (string) ($this->config['token_cache_file'] ?? '');
        if ($cache !== '' && is_file($cache)) {
            $saved = json_decode((string) file_get_contents($cache), true);
            if (is_array($saved) && isset($saved['token'], $saved['exp']) && is_string($saved['token']) && (int) $saved['exp'] > time() + 60) {
                return $saved['token'];
            }
        }
        $path = (string) $this->config['service_account_json'];
        $account = json_decode((string) file_get_contents($path), true);
        if (!is_array($account) || !isset($account['client_email'], $account['private_key'])) {
            throw new IntakeHttpException(500, 'Intake is not configured');
        }
        $now = time();
        $header = self::base64url((string) json_encode(['alg' => 'RS256', 'typ' => 'JWT']));
        $claim = self::base64url((string) json_encode([
            'iss' => $account['client_email'],
            'scope' => 'https://www.googleapis.com/auth/datastore',
            'aud' => 'https://oauth2.googleapis.com/token',
            'iat' => $now,
            'exp' => $now + 3600,
        ]));
        $unsigned = $header . '.' . $claim;
        $signature = '';
        if (!openssl_sign($unsigned, $signature, (string) $account['private_key'], OPENSSL_ALGO_SHA256)) {
            throw new IntakeHttpException(500, 'Intake is not configured');
        }
        $jwt = $unsigned . '.' . self::base64url($signature);
        $ch = curl_init('https://oauth2.googleapis.com/token');
        if ($ch === false) {
            throw new IntakeHttpException(502, 'Could not write to Firestore');
        }
        curl_setopt_array($ch, [
            CURLOPT_POST => true,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => 15,
            CURLOPT_HTTPHEADER => ['Content-Type: application/x-www-form-urlencoded'],
            CURLOPT_POSTFIELDS => http_build_query([
                'grant_type' => 'urn:ietf:params:oauth:grant-type:jwt-bearer',
                'assertion' => $jwt,
            ]),
        ]);
        $raw = curl_exec($ch);
        $status = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        curl_close($ch);
        $decoded = is_string($raw) ? json_decode($raw, true) : null;
        if ($status !== 200 || !is_array($decoded) || !isset($decoded['access_token']) || !is_string($decoded['access_token'])) {
            error_log('intake token HTTP ' . $status);
            throw new IntakeHttpException(502, 'Could not write to Firestore');
        }
        if ($cache !== '') {
            file_put_contents($cache, json_encode(['token' => $decoded['access_token'], 'exp' => $now + 3000]), LOCK_EX);
            @chmod($cache, 0600);
        }
        return $decoded['access_token'];
    }

    private static function base64url(string $value): string
    {
        return rtrim(strtr(base64_encode($value), '+/', '-_'), '=');
    }
}
