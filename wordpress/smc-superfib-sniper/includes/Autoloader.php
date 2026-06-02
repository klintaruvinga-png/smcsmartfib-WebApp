<?php
namespace SMC\SuperFib;

class Autoloader {
    const PREFIX = 'SMC\\SuperFib\\';

    public static function register(): void {
        spl_autoload_register([__CLASS__, 'load']);
    }

    public static function load(string $class): void {
        if (strpos($class, self::PREFIX) !== 0) {
            return;
        }

        $relative_class = substr($class, strlen(self::PREFIX));
        $path = __DIR__ . '/' . str_replace('\\', '/', $relative_class) . '.php';

        if (file_exists($path)) {
            require_once $path;
        }
    }
}
