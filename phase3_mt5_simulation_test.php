<?php
/**
 * Phase 3 Testing: Simulate MT5 EA sending price and candlestick data to backend
 *
 * This script simulates the MT5 EA sending webhook payloads to the WordPress REST API
 * to test if the backend correctly receives and stores price and candlestick data.
 */

// Configuration - Update these for your WordPress instance
$wordpress_url = 'https://trader.stokvelsociety.co.za//wp-json/sniper/v1/snapshot';
$auth_token = 'dD9c lGv5 GDw6 KlB4 T2vv PMmIyour-application-password'; // WP Application Password

// Sample MT5 payload (matches the format from MarketDataEngine.mqh)
$sample_payload = [
    'symbol' => 'EURUSD',
    'normalized_symbol' => 'EURUSD',
    'tick' => [
        'bid' => 1.0845,
        'ask' => 1.0847,
        'spread' => 2,
        'timestamp' => '2026-05-03T12:00:00.000Z',
        'volume' => 100
    ],
    'candle_m1' => [
        'open' => 1.0840,
        'high' => 1.0850,
        'low' => 1.0835,
        'close' => 1.0845,
        'volume' => 5000,
        'timestamp' => '2026-05-03T12:00:00Z'
    ],
    'freshness' => 'LIVE',
    'session' => 'London',
    'is_synthetic' => false
];

echo "Phase 3 Testing: Simulating MT5 EA webhook to backend\n";
echo "==================================================\n\n";

echo "Sending payload to: $wordpress_url\n";
echo "Payload:\n" . json_encode($sample_payload, JSON_PRETTY_PRINT) . "\n\n";

$json_body = json_encode($sample_payload);
$auth_header = 'Basic ' . base64_encode('username:' . $auth_token); // Replace 'username' with actual WP username

if (function_exists('curl_init')) {
    $ch = curl_init();
    curl_setopt($ch, CURLOPT_URL, $wordpress_url);
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_POSTFIELDS, $json_body);
    curl_setopt($ch, CURLOPT_HTTPHEADER, [
        'Content-Type: application/json',
        'Authorization: ' . $auth_header,
    ]);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
    $response = curl_exec($ch);
    $http_code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $curl_err  = curl_error($ch);
    curl_close($ch);

    if ($curl_err) {
        echo "cURL Error: $curl_err\n";
        exit(1);
    }
} else {
    // Fallback: use file_get_contents (no extension required)
    $context = stream_context_create([
        'http' => [
            'method'        => 'POST',
            'header'        => implode("\r\n", [
                'Content-Type: application/json',
                'Authorization: ' . $auth_header,
            ]),
            'content'       => $json_body,
            'ignore_errors' => true,
            'timeout'       => 15,
        ],
        'ssl' => [
            'verify_peer'      => false,
            'verify_peer_name' => false,
        ],
    ]);
    $response  = file_get_contents($wordpress_url, false, $context);
    $http_code = 0;
    foreach ($http_response_header ?? [] as $h) {
        if (preg_match('#^HTTP/\S+\s+(\d+)#', $h, $m)) {
            $http_code = (int) $m[1];
        }
    }
    if ($response === false) {
        echo "Request failed (file_get_contents). Check URL and network.\n";
        exit(1);
    }
}

echo "HTTP Response Code: $http_code\n";
echo "Response:\n$response\n\n";

if ($http_code === 200) {
    $response_data = json_decode($response, true);
    if (isset($response_data['ok']) && $response_data['ok'] === true) {
        echo "SUCCESS: Backend accepted the MT5 payload\n";
        echo "Price data (tick) should be stored in snapshots table with source='mt5'\n";
        echo "Candlestick data (M1) should be stored in candles table with source='mt5'\n";
        echo "Freshness state should be stored as transient\n";
        echo "Session state should be stored as transient\n";
    } else {
        echo "FAILURE: Backend rejected the payload\n";
    }
} else {
    echo "FAILURE: HTTP error $http_code\n";
}

echo "\nNext Steps:\n";
echo "1. Configure the correct WordPress URL and auth token above\n";
echo "2. Run this script to send test data\n";
echo "3. Check WordPress database for stored data\n";
echo "4. Verify dashboard shows MT5 as authoritative source\n";
echo "5. Run actual MT5 EA and monitor incoming webhooks\n";
?>