<?php
$rows = array(
    array(
        'feed_key' => 'H1H4_TEST_FEED',
        'normalized_symbol' => 'EURUSD',
        'timeframe' => '15min',
        'candle_open_time' => gmdate('Y-m-d H:i:s', time() - 3600),
        'open' => 1.1000,
        'high' => 1.1010,
        'low' => 1.0990,
        'close' => 1.1005,
        'confidence' => 'confirmed',
    ),
);
$query = "SELECT candle_open_time, open, high, low, close FROM wp_smc_sf_market_candles WHERE feed_key = 'H1H4_TEST_FEED' AND normalized_symbol = 'EURUSD' AND timeframe = '15min' AND confidence <> 'disputed' ORDER BY candle_open_time DESC LIMIT 40";
if (!preg_match('/SELECT .* FROM ([^ ]+) WHERE (.+)$/', $query, $matches)) {
    echo "NO MATCH\n";
    exit(1);
}
$conditions = $matches[2];
$filtered = array_filter($rows, function ($row) use ($conditions) {
    $patterns = array(
        'feed_key' => "/feed_key = '([^']+)'/",
        'normalized_symbol' => "/normalized_symbol = '([^']+)'/",
        'timeframe' => "/timeframe = '([^']+)'/",
        'candle_open_time' => "/candle_open_time = '([^']+)'/",
    );
    foreach ($patterns as $field => $pattern) {
        if (preg_match($pattern, $conditions, $match)) {
            if (!isset($row[$field]) || $row[$field] !== $match[1]) {
                return false;
            }
        }
    }
    return true;
});
$rows = array_values($filtered);
echo "rows after filter=" . count($rows) . "\n";
if (preg_match('/ORDER BY ([^\s]+) DESC/', $conditions, $match)) {
    $order_col = $match[1];
    usort($rows, function ($a, $b) use ($order_col) {
        return strcmp($b[$order_col] ?? '', $a[$order_col] ?? '');
    });
}
if (preg_match('/LIMIT (\d+)/', $conditions, $match)) {
    $rows = array_slice($rows, 0, (int) $match[1]);
}
echo "rows after order limit=" . count($rows) . "\n";
foreach ($rows as $r) {
    echo $r['candle_open_time'] . "\n";
}
