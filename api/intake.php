<?php
declare(strict_types=1);

require_once __DIR__ . '/src/Intake.php';
require_once __DIR__ . '/src/FirestoreRest.php';

if (realpath($_SERVER['SCRIPT_FILENAME'] ?? '') !== realpath(__FILE__)) {
    return;
}

try {
    header('Content-Type: application/json; charset=utf-8');
    header('X-Content-Type-Options: nosniff');
    header('Cache-Control: no-store');
    if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST') {
        http_response_code(405);
        echo json_encode(['ok' => false, 'error' => 'POST JSON only']);
        return;
    }
    $contentType = (string) ($_SERVER['CONTENT_TYPE'] ?? $_SERVER['HTTP_CONTENT_TYPE'] ?? '');
    if ($contentType !== '' && !str_contains(strtolower($contentType), 'application/json')) {
        http_response_code(415);
        echo json_encode(['ok' => false, 'error' => 'Content-Type must be application/json']);
        return;
    }
    $config = intake_load_config();
    $raw = file_get_contents('php://input');
    $store = new RestFirestore($config);
    [$status, $body] = intake_process(
        $config,
        intake_request_key(),
        $raw === false ? '' : $raw,
        $store,
        (string) ($_SERVER['REMOTE_ADDR'] ?? 'unknown'),
    );
    http_response_code($status);
    echo json_encode($body, JSON_UNESCAPED_SLASHES);
} catch (IntakeHttpException $error) {
    if (!headers_sent()) {
        header('Content-Type: application/json; charset=utf-8');
        http_response_code($error->status);
    }
    echo json_encode(['ok' => false, 'error' => $error->getMessage()]);
} catch (Throwable $error) {
    error_log('intake ' . $error::class);
    if (!headers_sent()) {
        header('Content-Type: application/json; charset=utf-8');
        http_response_code(500);
    }
    echo json_encode(['ok' => false, 'error' => 'Server error']);
}
