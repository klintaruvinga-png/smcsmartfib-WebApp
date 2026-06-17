#!/bin/bash
##
## collect-parity-baseline.sh
## 
## Collects two-user parity snapshot BEFORE canonical feed stabilization patch.
## Used as baseline for post-patch validation.
##
## Usage: scripts/collect-parity-baseline.sh > reports/canonical-feed-pre-patch-divergence.json
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
## Main: Collect baseline parity
##
main() {
    local token_a token_b
    local snapshots=()
    
    echo "[BASELINE] Authenticating users..." >&2
    token_a=$(get_auth_token "$USER_A" "$PASSWORD") || exit 1
    token_b=$(get_auth_token "$USER_B" "$PASSWORD") || exit 1
    
    echo "[BASELINE] Collecting $ITERATIONS snapshots..." >&2
    for i in $(seq 1 "$ITERATIONS"); do
        echo "[BASELINE] Poll $i/$ITERATIONS" >&2
        
        local snap_a=$(get_snapshot "$token_a" "$USER_A")
        local snap_b=$(get_snapshot "$token_b" "$USER_B")
        
        snapshots+=("{\"poll\":$i,\"userA\":$snap_a,\"userB\":$snap_b}")
        
        if [ "$i" -lt "$ITERATIONS" ]; then
            sleep "$POLL_INTERVAL_SEC"
        fi
    done
    
    # Output combined baseline as JSON array
    echo "["
    for i in $(seq 0 $((${#snapshots[@]} - 1))); do
        echo "${snapshots[$i]}"
        if [ "$i" -lt $((${#snapshots[@]} - 1)) ]; then
            echo ","
        fi
    done
    echo "]"
}

main "$@"
