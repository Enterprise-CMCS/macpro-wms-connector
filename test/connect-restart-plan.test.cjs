const assert = require('node:assert/strict');
const test = require('node:test');
const { planRestartPaths } = require('../lib/connect-restart-plan');

test('restarts each failed task when the connector itself is running', () => {
  const paths = planRestartPaths('wms-oracle-cdc', {
    name: 'wms-oracle-cdc',
    connector: { state: 'RUNNING' },
    tasks: [
      { id: 0, state: 'FAILED' },
      { id: 1, state: 'RUNNING' },
      { id: 2, state: 'FAILED' },
    ],
  });
  assert.deepEqual(paths, [
    '/connectors/wms-oracle-cdc/tasks/0/restart',
    '/connectors/wms-oracle-cdc/tasks/2/restart',
  ]);
});

test('restarts the connector and its failed tasks when both have failed', () => {
  const paths = planRestartPaths('wms-oracle-cdc', {
    name: 'wms-oracle-cdc',
    connector: { state: 'FAILED' },
    tasks: [{ id: 0, state: 'FAILED' }],
  });
  assert.deepEqual(paths, [
    '/connectors/wms-oracle-cdc/restart',
    '/connectors/wms-oracle-cdc/tasks/0/restart',
  ]);
});

test('falls back to a connector restart when no task has hard-failed', () => {
  assert.deepEqual(
    planRestartPaths('wms-oracle-cdc', {
      name: 'wms-oracle-cdc',
      connector: { state: 'RUNNING' },
      tasks: [{ id: 0, state: 'UNASSIGNED' }],
    }),
    ['/connectors/wms-oracle-cdc/restart']
  );
  assert.deepEqual(
    planRestartPaths('wms-oracle-cdc', { name: 'wms-oracle-cdc', connector: { state: 'RUNNING' }, tasks: [] }),
    ['/connectors/wms-oracle-cdc/restart']
  );
});

test('falls back to a connector restart when status is unavailable', () => {
  assert.deepEqual(planRestartPaths('wms oracle', undefined), ['/connectors/wms%20oracle/restart']);
});

test('never sends the Kafka 3.x-only restart query parameters', () => {
  const paths = planRestartPaths('wms-oracle-cdc', {
    name: 'wms-oracle-cdc',
    connector: { state: 'FAILED' },
    tasks: [{ id: 0, state: 'FAILED' }],
  });
  for (const path of paths) {
    assert.doesNotMatch(path, /includeTasks|onlyFailed/);
  }
});
