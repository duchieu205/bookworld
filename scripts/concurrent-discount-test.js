/*
  Concurrent discount usage test script
  Usage: set environment variables and run with node:
    SERVER_URL=http://localhost:5004 TOKEN_A=... TOKEN_B=... node scripts/concurrent-discount-test.js

  It will:
    - Create an order for user A and pay via wallet concurrently with user B
    - Print the Discount document before and after

  NOTE: Adjust endpoints and payload as needed for your setup.
*/

import fetch from "node-fetch";

const SERVER = process.env.SERVER_URL || "http://localhost:5004";
const TOKEN_A = process.env.TOKEN_A; // Bearer token for user A
const TOKEN_B = process.env.TOKEN_B; // Bearer token for user B
const DISCOUNT_CODE = process.env.DISCOUNT_CODE || "TEST1"; // The code to test

if (!TOKEN_A || !TOKEN_B) {
  console.error("Please set TOKEN_A and TOKEN_B environment variables (JWT tokens for two users)");
  process.exit(1);
}

const payload = {
  items: [
    { product_id: process.env.PRODUCT_ID, variant_id: process.env.VARIANT_ID, quantity: 1 }
  ],
  shipping_fee: 0,
  discountCode: DISCOUNT_CODE
};

async function run() {
  try {
    // Get discount before
    const beforeResp = await fetch(`${SERVER}/api/discounts?code=${DISCOUNT_CODE}`, { headers: { Authorization: `Bearer ${TOKEN_A}` } }).catch(() => null);
    const before = beforeResp ? await beforeResp.json() : null;
    console.log("Before discount:", before?.data || before);

    const reqA = fetch(`${SERVER}/api/wallet/create`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN_A}` }, body: JSON.stringify(payload) });
    const reqB = fetch(`${SERVER}/api/wallet/create`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN_B}` }, body: JSON.stringify(payload) });

    const results = await Promise.allSettled([reqA, reqB]);
    console.log("Results:");
    console.log(await Promise.all(results.map(async r => {
      if (r.status === 'fulfilled') {
        try { const j = await r.value.json(); return { status: 'fulfilled', value: j }; } catch (e) { return { status: 'fulfilled', value: null }; }
      } else {
        return { status: 'rejected', reason: r.reason?.message || r.reason };
      }
    })));

    // Get discount after
    const afterResp = await fetch(`${SERVER}/api/discounts?code=${DISCOUNT_CODE}`, { headers: { Authorization: `Bearer ${TOKEN_A}` } }).catch(() => null);
    const after = afterResp ? await afterResp.json() : null;
    console.log("After discount:", after?.data || after);

  } catch (err) {
    console.error("Test error:", err.message, err.response?.data);
  }
}

run();
