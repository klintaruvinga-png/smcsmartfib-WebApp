"use strict";

(function (window, document) {
    var booted = false;
    var REQUIRED_GLOBALS = [
        "xtab",
        "fetchPrices",
        "fetchRegimes",
        "fetchLiveSignals",
        "renderTradeQueue",
        "generatePlan",
        "exportReport",
        "exportPlanHTML",
        "saveZarRate",
        "saveApiKey",
        "onTimeframeChange",
        "clearTradeQueue",
        "showChart",
        "openLiveChart",
        "selectPairForPlan",
        "removeInstrument",
        "removePair",
        "smcLogin",
        "smcLogout",
    ];

    function bindPublicApi() {
        // Public globals are already owned by sniper-dashboard-core.js.
        // Keep bootstrap non-destructive so it never overwrites working handlers.
    }

    function validateBridge() {
        var bridge = window.SniperDashboardData;
        if (!bridge) {
            throw new Error("SniperDashboardData bridge missing");
        }
        ["getProfile", "getSignals", "getCandidateSymbols", "getRegime", "isChopCondition"].forEach(
            function (method) {
                if (typeof bridge[method] !== "function") {
                    throw new Error("SniperDashboardData." + method + " missing");
                }
            },
        );
        var boot = window.SNIPER || {};
        if (!boot.rest_url || !boot.nonce || !boot.fib_timeframe || !boot.user_account) {
            throw new Error("SNIPER boot contract incomplete");
        }
        return true;
    }

    function verifyCoreGlobals() {
        var missing = REQUIRED_GLOBALS.filter(function (name) {
            return typeof window[name] !== "function";
        });
        if (!missing.length) {
            return true;
        }
        console.error(
            "[SniperDashboard] Compatibility check failed. Missing core globals: " +
                missing.join(", "),
        );
        return false;
    }

    function boot() {
        if (booted) return;
        booted = true;
        validateBridge();
        bindPublicApi();
        if (!window.SniperDashboardCore || typeof window.SniperDashboardCore.init !== "function") {
            console.error(
                "[SniperDashboard] Compatibility check failed. SniperDashboardCore.init missing.",
            );
            return;
        }
        window.SniperDashboardCore.init();
        verifyCoreGlobals();
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", boot, { once: true });
    } else {
        boot();
    }
})(window, document);
