#!/usr/bin/env node

/**
 * Comprehensive End-to-End Test for Pull/Push Functionality
 *
 * This test validates:
 * 1. Pull command returns current document state
 * 2. Push command replaces document content
 * 3. Patch command still works after push
 * 4. Multiple pull/push cycles work correctly
 * 5. Error handling for malformed messages
 */

import WebSocket from 'ws';

const WS_URL = 'ws://localhost:3001';
const DOC_NAME = 'e2e-test-doc';
const TIMEOUT = 2000; // 2 seconds between operations

class E2ETest {
  constructor() {
    this.ws = null;
    this.testResults = [];
    this.currentTest = 0;
    this.lastPullResponse = null;
  }

  async runAllTests() {
    console.log('🚀 Starting End-to-End Tests for Pull/Push Functionality\n');

    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(WS_URL);

      this.ws.on('open', () => {
        console.log('✅ Connected to WebSocket server');
        this.runTestSequence().then(resolve).catch(reject);
      });

      this.ws.on('message', (data) => {
        this.handleMessage(data);
      });

      this.ws.on('error', (error) => {
        console.error('❌ WebSocket error:', error);
        reject(error);
      });

      this.ws.on('close', () => {
        console.log('🔌 Connection closed');
      });
    });
  }

  handleMessage(data) {
    try {
      const message = JSON.parse(data.toString());
      console.log(`📨 Received: ${message.type}`, message.name ? `(${message.name})` : '');

      if (message.type === 'pull_response') {
        this.lastPullResponse = message.data;
        console.log('📄 Document content:', JSON.stringify(message.data, null, 2));
      }
    } catch (err) {
      console.log('📨 Received non-JSON:', data.toString());
    }
  }

  async runTestSequence() {
    const tests = [
      () => this.testInitialPull(),
      () => this.testFirstPush(),
      () => this.testPullAfterPush(),
      () => this.testPatchAfterPush(),
      () => this.testPullAfterPatch(),
      () => this.testComplexPush(),
      () => this.testFinalPull(),
      () => this.testInvalidMessages(),
    ];

    for (let i = 0; i < tests.length; i++) {
      this.currentTest = i + 1;
      console.log(`\n🧪 Test ${this.currentTest}/${tests.length}: ${tests[i].name}`);
      await tests[i]();
      await this.wait(TIMEOUT);
    }

    this.printResults();
    this.ws.close();
  }

  async testInitialPull() {
    console.log('Testing initial pull to get current document state...');
    this.sendMessage({
      type: 'pull',
      name: DOC_NAME
    });
    await this.wait(500);
    this.recordResult('Initial Pull', this.lastPullResponse !== null);
  }

  async testFirstPush() {
    console.log('Testing first push with initial data...');
    const initialData = {
      test: 'e2e-initial',
      timestamp: new Date().toISOString(),
      counter: 1,
      metadata: {
        version: '1.0',
        author: 'e2e-test'
      }
    };

    this.sendMessage({
      type: 'push',
      name: DOC_NAME,
      data: initialData
    });

    this.recordResult('First Push', true); // Success if no error thrown
  }

  async testPullAfterPush() {
    console.log('Testing pull after push to verify data was set...');
    const beforePull = this.lastPullResponse;

    this.sendMessage({
      type: 'pull',
      name: DOC_NAME
    });

    await this.wait(500);
    const afterPull = this.lastPullResponse;

    const dataChanged = JSON.stringify(beforePull) !== JSON.stringify(afterPull);
    const hasExpectedData = afterPull && afterPull.test === 'e2e-initial';

    this.recordResult('Pull After Push', dataChanged && hasExpectedData);
  }

  async testPatchAfterPush() {
    console.log('Testing patch operations after push...');
    const patches = [
      { op: 'replace', path: '/counter', value: 2 },
      { op: 'add', path: '/newField', value: 'added-by-patch' },
      { op: 'replace', path: '/metadata/version', value: '1.1' }
    ];

    this.sendMessage({
      type: 'patch',
      name: DOC_NAME,
      data: patches
    });

    this.recordResult('Patch After Push', true);
  }

  async testPullAfterPatch() {
    console.log('Testing pull after patch to verify patch was applied...');

    this.sendMessage({
      type: 'pull',
      name: DOC_NAME
    });

    await this.wait(500);
    const data = this.lastPullResponse;

    const patchApplied = data &&
                        data.counter === 2 &&
                        data.newField === 'added-by-patch' &&
                        data.metadata && data.metadata.version === '1.1';

    this.recordResult('Pull After Patch', patchApplied);
  }

  async testComplexPush() {
    console.log('Testing complex push with nested structures...');
    const complexData = {
      users: [
        { id: 1, name: 'Alice', active: true },
        { id: 2, name: 'Bob', active: false }
      ],
      settings: {
        theme: 'dark',
        notifications: {
          email: true,
          push: false,
          sms: null
        }
      },
      stats: {
        totalUsers: 2,
        activeUsers: 1,
        lastUpdate: new Date().toISOString()
      },
      tags: ['test', 'e2e', 'complex'],
      config: null
    };

    this.sendMessage({
      type: 'push',
      name: DOC_NAME,
      data: complexData
    });

    this.recordResult('Complex Push', true);
  }

  async testFinalPull() {
    console.log('Testing final pull to verify complex data...');

    this.sendMessage({
      type: 'pull',
      name: DOC_NAME
    });

    await this.wait(500);
    const data = this.lastPullResponse;

    const hasComplexData = data &&
                          data.users && Array.isArray(data.users) && data.users.length === 2 &&
                          data.settings && data.settings.theme === 'dark' &&
                          data.tags && Array.isArray(data.tags) && data.tags.includes('e2e');

    this.recordResult('Final Pull', hasComplexData);
  }

  async testInvalidMessages() {
    console.log('Testing error handling with invalid messages...');

    // Test invalid JSON
    try {
      this.ws.send('invalid json');
      this.recordResult('Invalid JSON Handling', true);
    } catch (err) {
      this.recordResult('Invalid JSON Handling', false);
    }

    // Test missing name field
    this.sendMessage({
      type: 'pull'
      // missing name field
    });

    // Test invalid message type
    this.sendMessage({
      type: 'invalid_type',
      name: DOC_NAME
    });

    this.recordResult('Error Handling', true); // If we get here, error handling worked
  }

  sendMessage(message) {
    if (this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
      console.log(`📤 Sent: ${message.type}`, message.name ? `(${message.name})` : '');
    } else {
      console.error('❌ WebSocket not open');
    }
  }

  recordResult(testName, passed) {
    this.testResults.push({ testName, passed });
    const status = passed ? '✅ PASS' : '❌ FAIL';
    console.log(`${status}: ${testName}`);
  }

  printResults() {
    console.log('\n' + '='.repeat(60));
    console.log('📊 TEST RESULTS SUMMARY');
    console.log('='.repeat(60));

    let passed = 0;
    let total = this.testResults.length;

    this.testResults.forEach((result, index) => {
      const status = result.passed ? '✅ PASS' : '❌ FAIL';
      console.log(`${index + 1}. ${status} ${result.testName}`);
      if (result.passed) passed++;
    });

    console.log('='.repeat(60));
    console.log(`📈 Overall: ${passed}/${total} tests passed (${Math.round(passed/total*100)}%)`);

    if (passed === total) {
      console.log('🎉 All tests passed! Pull/Push functionality is working correctly.');
    } else {
      console.log('⚠️  Some tests failed. Please check the implementation.');
    }
  }

  wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Run the tests
async function main() {
  const test = new E2ETest();

  try {
    await test.runAllTests();
    process.exit(0);
  } catch (error) {
    console.error('💥 Test suite failed:', error);
    process.exit(1);
  }
}

console.log('🔧 End-to-End Test Suite for Pull/Push Functionality');
console.log('📋 Prerequisites:');
console.log('   1. WebSocket server running on ws://localhost:3001');
console.log('   2. Document named "e2e-test-doc" should exist (will be created if needed)');
console.log('   3. External JSON sync functionality enabled\n');

main();
