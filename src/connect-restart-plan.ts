export type ConnectorStatusResponse = {
  name: string;
  connector?: { state?: string };
  tasks?: Array<{ id?: number; state?: string; trace?: string }>;
};

/**
 * Returns the Kafka Connect REST paths to POST to recover a connector.
 * cp-kafka-connect 6.0.x ships Kafka 2.6, where `/connectors/{name}/restart` ignores
 * `includeTasks`/`onlyFailed` and restarts only the connector instance, so failed tasks
 * must be restarted individually.
 */
export function planRestartPaths(
  connectorName: string,
  status: ConnectorStatusResponse | undefined
): string[] {
  const encodedName = encodeURIComponent(connectorName);
  const connectorRestart = `/connectors/${encodedName}/restart`;
  if (!status) {
    return [connectorRestart];
  }

  const paths: string[] = [];
  if (status.connector?.state === 'FAILED') {
    paths.push(connectorRestart);
  }
  for (const task of status.tasks || []) {
    if (task.state === 'FAILED' && typeof task.id === 'number') {
      paths.push(`/connectors/${encodedName}/tasks/${task.id}/restart`);
    }
  }
  return paths.length > 0 ? paths : [connectorRestart];
}
