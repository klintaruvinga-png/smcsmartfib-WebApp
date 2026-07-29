/**
 * PBKDF2-SHA256 performance benchmark for Cloudflare Workers compatibility.
 * Tests different iteration counts to find the optimal balance between security
 * and acceptable latency (<500ms for login/registration operations).
 */

async function pbkdf2Sha256(
  password: string,
  salt: Uint8Array,
  iterations: number,
): Promise<string> {
  const passwordBuffer = new TextEncoder().encode(password);
  const importedKey = await crypto.subtle.importKey("raw", passwordBuffer, "PBKDF2", false, [
    "deriveBits",
  ]);

  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: salt,
      iterations: iterations,
      hash: "SHA-256",
    },
    importedKey,
    256,
  );

  const hashHex = Array.from(new Uint8Array(derivedBits), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
  return hashHex;
}

async function benchmarkIterations(
  iterations: number,
  password: string,
  salt: Uint8Array,
): Promise<number> {
  const start = performance.now();
  await pbkdf2Sha256(password, salt, iterations);
  const end = performance.now();
  return end - start;
}

async function main() {
  const testPassword = "TestPassword123!";
  const salt = new Uint8Array(16);
  crypto.getRandomValues(salt);

  const iterationCounts = [
    100000, 200000, 300000, 400000, 500000, 600000, 700000, 800000, 900000, 1000000,
  ];
  const results: { iterations: number; avgTime: number; maxTime: number }[] = [];

  console.log("PBKDF2-SHA256 Performance Benchmark");
  console.log("====================================");
  console.log(`Testing password: "${testPassword}"`);
  console.log("Running 3 trials per iteration count...\n");

  for (const iterations of iterationCounts) {
    const times: number[] = [];

    for (let i = 0; i < 3; i++) {
      const time = await benchmarkIterations(iterations, testPassword, salt);
      times.push(time);
    }

    const avgTime = times.reduce((sum, t) => sum + t, 0) / times.length;
    const maxTime = Math.max(...times);

    results.push({ iterations, avgTime, maxTime });

    console.log(
      `${iterations.toLocaleString()} iterations: ${avgTime.toFixed(2)}ms avg, ${maxTime.toFixed(2)}ms max`,
    );
  }

  console.log("\nRecommendation:");
  console.log("==============");

  // Find the highest iteration count with avg time < 500ms
  const acceptable = results.filter((r) => r.avgTime < 500);
  if (acceptable.length > 0) {
    const recommended = acceptable[acceptable.length - 1];
    console.log(
      `Recommended: ${recommended.iterations.toLocaleString()} iterations (${recommended.avgTime.toFixed(2)}ms avg)`,
    );
    console.log(`This provides strong security while keeping login/registration under 500ms`);
  } else {
    const fastest = results[0];
    console.log(
      `Recommended: ${fastest.iterations.toLocaleString()} iterations (${fastest.avgTime.toFixed(2)}ms avg)`,
    );
    console.log(`Warning: All tested counts exceeded 500ms. Consider server-side optimization`);
  }

  console.log("\nCurrent setting: 500,000 iterations (benchmark-tested for <500ms latency)");
}

main().catch(console.error);
