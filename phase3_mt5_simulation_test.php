<?php
/**
 * Phase 3 Testing: Simulate MT5 EA sending price and candlestick data to backend
 *
 * This script simulates the MT5 EA sending webhook payloads to the WordPress REST API
 * to test if the backend correctly receives and stores price and candlestick data.
 */

// Configuration - set these through environment variables for your WordPress instance.
$wordpress_url = getenv('SMC_SF_EA_ENDPOINT') ?: 'https://trader.stokvelsociety.co.za/wp-json/sniper/v1/ea/market-stream';
$api_key       = getenv('SMC_SF_EA_API_KEY') ?: '';
$user_id       = (int) (getenv('SMC_SF_EA_USER_ID') ?: 1);

if ($api_key === '') {
    echo "Missing SMC_SF_EA_API_KEY environment variable.\n";
    exit(1);
}

// Sample MT5 payload (matches the format from MarketDataEngine.mqh)
$sample_payload = [
    'user_id' => $user_id,
    'symbol' => 'EURUSD',
    'normalized_symbol' => 'EURUSD',
    'timeframe' => 'M1',
    'timestamp' => gmdate('c'),
    'bid' => 1.0845,
    'ask' => 1.0847,
    'freshness' => 'LIVE',
    'session' => 'London',
    'candle' => [
        'time' => gmdate('c', time() - 60),
        'open' => 1.0840,
        'high' => 1.0850,
        'low' => 1.0835,
        'close' => 1.0845,
        'volume' => 5000
    ],
    'is_synthetic' => false
];

echo "Phase 3 Testing: Simulating MT5 EA webhook to backend\n";
echo "==================================================\n\n";

echo "Sending payload to: $wordpress_url\n";
echo "Payload:\n" . json_encode($sample_payload, JSON_PRETTY_PRINT) . "\n\n";

$json_body = json_encode($sample_payload);

if (function_exists('curl_init')) {
    $ch = curl_init();
    curl_setopt($ch, CURLOPT_URL, $wordpress_url);
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_POSTFIELDS, $json_body);
    curl_setopt($ch, CURLOPT_HTTPHEADER, [
        'Content-Type: application/json',
        'X-API-KEY: ' . $api_key,
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
} elseif (in_array(parse_url($wordpress_url, PHP_URL_SCHEME), stream_get_wrappers())) {
    // Fallback: file_get_contents — gate on the actual URL scheme, not a hardcoded 'https'
    $context = stream_context_create([
        'http' => [
            'method'        => 'POST',
            'header'        => implode("\r\n", [
                'Content-Type: application/json',
                'X-API-KEY: ' . $api_key,
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
} elseif (function_exists('exec')) {
    // Last resort: shell out to curl.exe (bundled with Windows 10+) or PowerShell
    $escaped_url  = escapeshellarg($wordpress_url);
    $escaped_body = escapeshellarg($json_body);
    $escaped_auth = escapeshellarg('X-API-KEY: ' . $api_key);

    // Try curl.exe first (Windows 10 1803+ ships it in System32)
    exec('curl.exe --version 2>NUL', $ver_out, $ver_ret);
    if ($ver_ret === 0) {
        // Write body to a temp file to avoid shell quoting issues with JSON on Windows
        $tmp = tempnam(sys_get_temp_dir(), 'mt5_');
        file_put_contents($tmp, $json_body);
        $escaped_tmp = escapeshellarg($tmp);

        // Use a safe sentinel with no newline so cmd.exe doesn't split the command
        $cmd = "curl.exe -s -o - -w \"__HTTP_CODE__:%{http_code}\" "
             . "-X POST $escaped_url "
             . "-H \"Content-Type: application/json\" "
             . "-H $escaped_auth "
             . "--data @$escaped_tmp "
             . "--insecure";
        exec($cmd, $out, $ret);
        @unlink($tmp);
        $raw       = implode("\n", $out);
        $http_code = 0;
        if (preg_match('#__HTTP_CODE__:(\d+)$#', $raw, $m)) {
            $http_code = (int) $m[1];
            $response  = preg_replace('#__HTTP_CODE__:\d+$#', '', $raw);
        } else {
            $response = $raw;
        }
        if ($ret !== 0 && $http_code === 0) {
            echo "curl.exe failed (exit $ret). Check URL and network.\n";
            exit(1);
        }
    } else {
        // Final fallback: PowerShell Invoke-WebRequest
        $ps_body = str_replace("'", "''", $json_body);
        $ps_cmd  = "powershell -NoProfile -Command \""
                 . "\$r = Invoke-WebRequest -Uri '$wordpress_url' "
                 . "-Method POST "
                 . "-Headers @{'Content-Type'='application/json';'X-API-KEY'='" . addslashes($api_key) . "'} "
                 . "-Body '" . $ps_body . "' -UseBasicParsing; "
                 . "Write-Output (\$r.StatusCode.ToString() + '|' + \$r.Content)"
                 . "\"";
        exec($ps_cmd, $out, $ret);
        $raw = implode('', $out);
        if ($ret !== 0 || strpos($raw, '|') === false) {
            echo "PowerShell request failed. Check URL and network.\n";
            exit(1);
        }
        [$http_code, $response] = explode('|', $raw, 2);
        $http_code = (int) $http_code;
    }
} else {
    echo "No HTTP transport available: PHP curl extension, openssl wrapper, and exec() are all disabled.\n";
    echo "Enable at least one of: extension=curl, extension=openssl, or allow exec() in php.ini.\n";
    exit(1);
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
