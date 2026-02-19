#!/usr/bin/env node

/**
 * Admin App Smoke Test
 * Tests the critical paths of the admin application
 */

const BASE_URL = process.env.BASE_URL || 'https://alcomatcher.com';

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(message, color = colors.reset) {
  console.log(`${color}${message}${colors.reset}`);
}

function logSuccess(message) {
  log(`✓ ${message}`, colors.green);
}

function logError(message) {
  log(`✗ ${message}`, colors.red);
}

function logInfo(message) {
  log(`ℹ ${message}`, colors.cyan);
}

function logWarning(message) {
  log(`⚠ ${message}`, colors.yellow);
}

class SmokeTest {
  constructor() {
    this.passed = 0;
    this.failed = 0;
    this.warnings = 0;
  }

  async test(name, fn) {
    try {
      log(`\n${colors.blue}Testing: ${name}${colors.reset}`);
      await fn();
      logSuccess(`${name} passed`);
      this.passed++;
    } catch (error) {
      logError(`${name} failed: ${error.message}`);
      this.failed++;
    }
  }

  async testEndpoint(name, url, options = {}) {
    await this.test(name, async () => {
      const response = await fetch(url, options);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        const data = await response.json();
        logInfo(`Response: ${JSON.stringify(data).substring(0, 100)}...`);
        return data;
      } else if (contentType && contentType.includes('text/html')) {
        const text = await response.text();
        logInfo(`HTML response (${text.length} bytes)`);
        return text;
      }

      return response;
    });
  }

  async run() {
    log(`\n${'='.repeat(60)}`, colors.blue);
    log('Admin App Smoke Test Suite', colors.blue);
    log(`Base URL: ${BASE_URL}`, colors.blue);
    log(`${'='.repeat(60)}\n`, colors.blue);

    // Test 1: Health check
    await this.testEndpoint(
      'Health Check',
      `${BASE_URL}/health`
    );

    // Test 2: Admin page loads (redirects handled)
    await this.test('Admin Page Loads', async () => {
      const response = await fetch(`${BASE_URL}/admin`, {
        redirect: 'manual'
      });

      // Should either load (200) or redirect to login (302)
      if (response.status !== 200 && response.status !== 302) {
        throw new Error(`Expected 200 or 302, got ${response.status}`);
      }

      if (response.status === 302) {
        logWarning('Redirected to login (expected if not authenticated)');
        this.warnings++;
      } else {
        logInfo('Admin page loaded successfully');
      }
    });

    // Test 3: Admin queue redirect
    await this.test('Admin Queue Redirects', async () => {
      const response = await fetch(`${BASE_URL}/admin/queue`, {
        redirect: 'manual'
      });

      if (response.status !== 302) {
        throw new Error(`Expected 302 redirect, got ${response.status}`);
      }

      const location = response.headers.get('location');
      if (!location.includes('/admin/applications')) {
        throw new Error(`Expected redirect to /admin/applications, got ${location}`);
      }

      logInfo(`Correctly redirects to: ${location}`);
    });

    // Test 4: Admin dashboard redirect
    await this.test('Admin Dashboard Redirects', async () => {
      const response = await fetch(`${BASE_URL}/admin/dashboard`, {
        redirect: 'manual'
      });

      if (response.status !== 302) {
        throw new Error(`Expected 302 redirect, got ${response.status}`);
      }

      const location = response.headers.get('location');
      if (!location.includes('/admin')) {
        throw new Error(`Expected redirect to /admin, got ${location}`);
      }

      logInfo(`Correctly redirects to: ${location}`);
    });

    // Test 5: API endpoints require authentication
    await this.test('API Authentication Required', async () => {
      const response = await fetch(`${BASE_URL}/api/admin/queue`);

      // Should return 401 or redirect to login
      if (response.status !== 401 && response.status !== 302) {
        logWarning(`Expected 401 or 302, got ${response.status} (may have open auth)`);
        this.warnings++;
      } else {
        logInfo('API correctly requires authentication');
      }
    });

    // Test 6: Static assets load
    await this.test('Static Assets Available', async () => {
      const response = await fetch(`${BASE_URL}/admin.html`);

      if (!response.ok) {
        throw new Error(`Admin HTML not found: ${response.status}`);
      }

      const html = await response.text();
      if (!html.includes('<!doctype html') && !html.includes('<!DOCTYPE html')) {
        throw new Error('Response does not appear to be HTML');
      }

      logInfo('Admin HTML loads correctly');
    });

    // Print summary
    this.printSummary();
  }

  printSummary() {
    log(`\n${'='.repeat(60)}`, colors.blue);
    log('Test Summary', colors.blue);
    log(`${'='.repeat(60)}`, colors.blue);
    log(`Passed:   ${this.passed}`, colors.green);
    if (this.failed > 0) {
      log(`Failed:   ${this.failed}`, colors.red);
    }
    if (this.warnings > 0) {
      log(`Warnings: ${this.warnings}`, colors.yellow);
    }
    log(`Total:    ${this.passed + this.failed}`, colors.cyan);
    log(`${'='.repeat(60)}\n`, colors.blue);

    if (this.failed > 0) {
      log('Some tests failed!', colors.red);
      process.exit(1);
    } else {
      log('All tests passed!', colors.green);
      if (this.warnings > 0) {
        log(`(${this.warnings} warnings)`, colors.yellow);
      }
      process.exit(0);
    }
  }
}

// Run tests
const tester = new SmokeTest();
tester.run().catch(error => {
  logError(`Fatal error: ${error.message}`);
  console.error(error);
  process.exit(1);
});
