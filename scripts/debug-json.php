<?php
$raw = file_get_contents('mt5-levels.json');
echo "Length: " . strlen($raw) . "\n";
echo "First 300: " . substr($raw, 0, 300) . "\n";
echo "Last 100: " . substr($raw, -100) . "\n";
$decoded = json_decode($raw);
echo "json_decode error: " . json_last_error_msg() . "\n";
if ($decoded) { echo "First entry: "; var_dump($decoded[0]); }
