#!/bin/bash
##
## collect-parity-validation.sh
## 
## Collects two-user parity snapshot AFTER canonical feed stabilization patch.
## Used to compare against baseline to confirm convergence.
##
## Usage: scripts/collect-parity-validation.sh > reports/canonical-feed-post-patch-parity.json
##

set -euo pipefail

# Configuration
BACKEND_URL="${BACKEND_URL:-https://trader.stokvelsociety.co.za/wp-json}"
USER_A="${PARITY_USER_A:-user_parity_a}"
USER_B="${PARITY_USER_B:-user_parity_b}"
PASSWORD="${PARITY_PASSWORD:-test_password_parity}"
ITERATIONS="${PARITY_ITERATIONS:-3}"
POLL_INTERVAL_SEC="${PARITY_POLL_INTERVAL:-2}"

##
## Helper: Get auth token for user
##
get_auth_token() {
    local user=$1
    local pass=$2
    local response
    
    response=$(curl -s -X POST \
        "${BACKEND_URL}/auth/login" \
        -H "Content-Type: application/json" \
        -d "{\"username\":\"$user\",\"password\":\"$pass\"}" \
        -w "\n%{http_code}")
    
    local http_code=$(echo "$response" | tail -n1)
    local body=$(echo "$response" | head -n-1)
    
    if [ "$http_code" != "200" ]; then
        echo "ERROR: Auth failed for user $user (HTTP $http_code)" >&2
        return 1
    fi
    
    echo "$body" | jq -r '.token // .access_token // empty'
}

##
## Helper: Get snapshot for user
##
get_snapshot() {
    local token=$1
    local user=$2
    
    curl -s -H "Authorization: Bearer $token" \
        "${BACKEND_URL}/sniper/v1/snapshot/unified?cacheBust=true" \
        | jq --arg user "$user" '{
            user: $user,
            timestamp: now | todate,
            prices: .prices | map({symbol, bid, ask, mid, state, age_sec, feed_key, source, updatedAt})
        }'
}

##
## Helper: Compare two price arrays for parity
##
compare_parity() {
    local prices_a=$1
    local prices_b=$2
    
    # Extract feed_keys and state per symbol; diff should be empty if canonical
    local by_symbol_a=$(echo "$prices_a" | jq -s 'map({symbol, feed_key, state}) | sort_by(.symbol)')
    local by_symbol_b=$(echo "$prices_b" | jq -s 'map({symbol, feed_key, state}) | sort_by(.symbol)')
    
    if [ "$by_symbol_a" == "$by_symbol_b" ]; then
        echo "PARITY_OK"
    else
        echo "PARITY_DIVERGENCE"
    fi
}

##
## Main: Collect post-patch validation
##
main() {
    local token_a token_b
    local snapshots=()
    local parity_results=()
    
    echo "[VALIDATION] Authenticating users..." >&2
    token_a=$(get_auth_token "$USER_A" "$PASSWORD") || exit 1
    token_b=$(get_auth_token "$USER_B" "$PASSWORD") || exit 1
    
    echo "[VALIDATION] Collecting $ITERATIONS snapshots and comparing..." >&2
    for i in $(seq 1 "$ITERATIONS"); do
        echo "[VALIDATION] Poll $i/$ITERATIONS" >&2
        
        local snap_a=$(get_snapshot "$token_a" "$USER_A")
        local snap_b=$(get_snapshot "$token_b" "$USER_B")
        
        local prices_a=$(echo "$snap_a" | jq '.prices')
        local prices_b=$(echo "$snap_b" | jq '.prices')
        
        local parity=$(compare_parity "$prices_a" "$prices_b")
        parity_results+=("$parity")
        
        snapshots+=("{\"poll\":$i,\"userA\":$snap_a,\"userB\":$snap_b,\"parity\":\"$parity\"}")
        
        if [ "$i" -lt "$ITERATIONS" ]; then
            sleep "$POLL_INTERVAL_SEC"
        fi
    done
    
    # Output combined validation as JSON array
    echo "["
    for i in $(seq 0 $((${#snapshots[@]} - 1))); do
        echo "${snapshots[$i]}"
        if [ "$i" -lt $((${#snapshots[@]} - 1)) ]; then
            echo ","
        fi
    done
    echo "]"
    
    # Summary
    echo "[VALIDATION] Summary:" >&2
    local parity_ok=0
    local parity_fail=0
    for result in "${parity_results[@]}"; do
        if [ "$result" == "PARITY_OK" ]; then
            ((parity_ok++))
        else
            ((parity_fail++))
        fi
    done
    
    echo "[VALIDATION] PARITY_OK: $parity_ok/$ITERATIONS" >&2
    if [ "$parity_fail" -gt 0 ]; then
        echo "[VALIDATION] PARITY_DIVERGENCE: $parity_fail/$ITERATIONS" >&2
        exit 1
    fi
}

main "$@"
