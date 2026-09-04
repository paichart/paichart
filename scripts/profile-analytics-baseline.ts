/**
 * Analytics Performance Baseline Measurement
 * Phase 3A-PRE Task 1: Measure current performance before optimization
 *
 * Profiles all analytics endpoints to establish baseline metrics:
 * - Response times (p50, p95, p99)
 * - Identifies bottlenecks
 * - Documents current state for comparison after optimization
 *
 * Usage:
 *   ts-node -r tsconfig-paths/register scripts/profile-analytics-baseline.ts
 *
 * Requirements:
 * - Server must be running (npm run dev)
 * - Valid auth token for API requests
 */

interface ProfileResult {
  endpoint: string;
  iterations: number;
  times: number[];
  min: number;
  max: number;
  avg: number;
  p50: number;
  p95: number;
  p99: number;
}

/**
 * Profile a single endpoint with multiple iterations
 */
async function profileEndpoint(
  url: string,
  headers: Record<string, string>,
  iterations: number = 50
): Promise<ProfileResult> {
  const times: number[] = [];

  console.log(`\n📊 Profiling: ${url}`);
  console.log(`   Iterations: ${iterations}`);

  for (let i = 0; i < iterations; i++) {
    const start = Date.now();

    try {
      const response = await fetch(url, { headers });

      if (!response.ok) {
        console.warn(`   ⚠️  Iteration ${i + 1}: ${response.status} ${response.statusText}`);
        continue;
      }

      await response.json(); // Parse response
    } catch (error) {
      console.error(`   ❌ Iteration ${i + 1} failed:`, error instanceof Error ? error.message : error);
      continue;
    }

    const end = Date.now();
    const duration = end - start;
    times.push(duration);

    // Progress indicator
    if ((i + 1) % 10 === 0) {
      process.stdout.write(`   Progress: ${i + 1}/${iterations}\r`);
    }
  }

  if (times.length === 0) {
    throw new Error(`No successful requests for ${url}`);
  }

  // Sort times for percentile calculation
  times.sort((a, b) => a - b);

  const min = times[0];
  const max = times[times.length - 1];
  const avg = Math.round(times.reduce((a, b) => a + b, 0) / times.length);
  const p50 = times[Math.floor(times.length * 0.5)];
  const p95 = times[Math.floor(times.length * 0.95)];
  const p99 = times[Math.floor(times.length * 0.99)];

  return {
    endpoint: url,
    iterations: times.length,
    times,
    min,
    max,
    avg,
    p50,
    p95,
    p99
  };
}

/**
 * Main profiling function
 */
async function runBaselineProfiling() {
  console.log('🔬 Analytics Performance Baseline Measurement');
  console.log('=============================================\n');

  // Configuration
  const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
  const AUTH_TOKEN = process.env.AUTH_TOKEN || '';
  const ITERATIONS = parseInt(process.env.ITERATIONS || '50');

  if (!AUTH_TOKEN) {
    console.error('❌ Error: AUTH_TOKEN environment variable required');
    console.error('');
    console.error('Get token by:');
    console.error('1. Login to http://localhost:3000');
    console.error('2. Open DevTools → Application → Cookies');
    console.error('3. Copy "token" cookie value');
    console.error('4. Run: AUTH_TOKEN="your-token" ts-node ...');
    process.exit(1);
  }

  // Get a POV ID for testing (use first accessible POV)
  console.log('📋 Fetching POV ID for testing...');
  const povsResponse = await fetch(`${BASE_URL}/api/pov`, {
    headers: { Authorization: `Bearer ${AUTH_TOKEN}` }
  });

  if (!povsResponse.ok) {
    console.error('❌ Failed to fetch POVs. Check AUTH_TOKEN is valid.');
    process.exit(1);
  }

  const povsData = await povsResponse.json();
  const povs = povsData.data || povsData;

  if (!povs || povs.length === 0) {
    console.error('❌ No POVs found. Create a POV first.');
    process.exit(1);
  }

  const testPOVId = povs[0].id;
  console.log(`✅ Using POV: ${povs[0].title} (${testPOVId})\n`);

  const headers = {
    'Authorization': `Bearer ${AUTH_TOKEN}`,
    'Content-Type': 'application/json'
  };

  // Endpoints to profile
  const endpoints = [
    {
      // MCP analytics (domain=mcp) + its deprecated /api/mcp/analytics wrapper removed 2026-06-24
      // with the Tools & ROI tab.
      name: 'Task Analytics Performance (unified)',
      url: `${BASE_URL}/api/analytics?domain=tasks&metrics=performance&povId=${testPOVId}&timeRange=30d`
    },
    {
      name: 'Task Analytics Insights (unified)',
      url: `${BASE_URL}/api/analytics?domain=tasks&metrics=insights&povId=${testPOVId}&timeRange=30d`
    },
    {
      name: 'Agent Executions Summary',
      url: `${BASE_URL}/api/agent-executions/summary?povId=${testPOVId}&timeRange=30d`
    },
    {
      name: 'Analytics Overview (unified)',
      url: `${BASE_URL}/api/analytics?domain=overview&povId=${testPOVId}&timeRange=30d`
    }
  ];

  const results: ProfileResult[] = [];

  // Profile each endpoint
  for (const endpoint of endpoints) {
    try {
      const result = await profileEndpoint(endpoint.url, headers, ITERATIONS);
      results.push(result);

      console.log(`\n   ✅ ${endpoint.name}`);
      console.log(`   Min: ${result.min}ms | Max: ${result.max}ms | Avg: ${result.avg}ms`);
      console.log(`   p50: ${result.p50}ms | p95: ${result.p95}ms | p99: ${result.p99}ms`);
    } catch (error) {
      console.error(`\n   ❌ ${endpoint.name} failed:`, error instanceof Error ? error.message : error);
    }
  }

  // Generate report
  console.log('\n\n📊 BASELINE PERFORMANCE REPORT');
  console.log('=============================================\n');
  console.log('| Endpoint | p50 | p95 | p99 | Avg | Iterations |');
  console.log('|----------|-----|-----|-----|-----|------------|');

  for (const result of results) {
    const name = result.endpoint.split('/api/')[1].split('?')[0].padEnd(30);
    console.log(
      `| ${name} | ${result.p50}ms | ${result.p95}ms | ${result.p99}ms | ${result.avg}ms | ${result.iterations} |`
    );
  }

  console.log('\n');

  // Identify slowest endpoint
  const slowest = results.reduce((prev, current) =>
    current.p95 > prev.p95 ? current : prev
  );

  console.log(`🐌 Slowest Endpoint: ${slowest.endpoint.split('/api/')[1].split('?')[0]}`);
  console.log(`   p95: ${slowest.p95}ms (95% of requests slower than this)`);
  console.log(`   Optimization Target: This endpoint should be optimized first\n`);

  // Calculate recommended optimization target
  const targetImprovement = 0.65; // 65% improvement goal
  const targetP95 = Math.round(slowest.p95 * (1 - targetImprovement));

  console.log(`🎯 Optimization Target:`);
  console.log(`   Current p95: ${slowest.p95}ms`);
  console.log(`   Target p95: ${targetP95}ms (65% improvement)`);
  console.log(`   Savings: ${slowest.p95 - targetP95}ms per request\n`);

  // Save results to file
  const report = {
    date: new Date().toISOString(),
    baseUrl: BASE_URL,
    iterations: ITERATIONS,
    testPOV: {
      id: testPOVId,
      title: povs[0].title
    },
    results,
    summary: {
      slowestEndpoint: slowest.endpoint.split('/api/')[1].split('?')[0],
      slowestP95: slowest.p95,
      targetP95,
      improvementGoal: '65%'
    }
  };

  const fs = require('fs');
  const reportPath = 'docs/performance/analytics-baseline-2025-12-12.json';

  // Create directory if needed
  if (!fs.existsSync('docs/performance')) {
    fs.mkdirSync('docs/performance', { recursive: true });
  }

  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

  console.log(`💾 Report saved to: ${reportPath}\n`);
  console.log('✅ Baseline measurement complete!');
  console.log('   Next: Optimize the slowest endpoint to achieve 65% improvement\n');
}

// Run profiling
runBaselineProfiling().catch(error => {
  console.error('❌ Profiling failed:', error);
  process.exit(1);
});
