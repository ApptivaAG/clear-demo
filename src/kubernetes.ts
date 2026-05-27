import prompts from 'prompts';

export async function restartKubernetesDeployment(projectId: string) {
  const namespace = `bubble-demo-${projectId}-chatbot`;

  console.log('\n🔄 Kubernetes Chatbot Restart');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`\nNamespace: ${namespace}\n`);

  const { confirm } = await prompts({
    type: 'confirm',
    name: 'confirm',
    message: 'Do you want to restart the Kubernetes deployment now?',
    initial: true,
  });

  if (!confirm) {
    console.log('\n   ⏭️  Skipped Kubernetes restart');
    console.log('   ℹ️  To restart manually later, use:\n');
    console.log(`   kubectl rollout restart deployment -n ${namespace}\n`);
    console.log('   Or use Lens:');
    console.log(`   1. Select namespace: ${namespace}`);
    console.log('   2. Navigate to Workloads > Deployments');
    console.log('   3. Right-click the deployment and select "Restart"\n');
    return;
  }

  console.log(`\n   Executing: kubectl rollout restart deployment -n ${namespace}`);

  try {
    // Execute rollout restart
    const { execSync } = await import('child_process');

    execSync(`kubectl rollout restart deployment -n ${namespace}`, {
      stdio: 'inherit',
    });

    console.log(`\n   Waiting for rollout to complete...`);

    // Wait for rollout status
    execSync(`kubectl rollout status deployment -n ${namespace}`, {
      stdio: 'inherit',
    });

    console.log('\n   ✅ Deployment restarted successfully!');
    console.log('   The chatbot is now running with fresh data.\n');
  } catch (error) {
    console.error('\n   ⚠️  Failed to restart deployment automatically');
    if (error instanceof Error) {
      console.error(`   Error: ${error.message}\n`);
    }
    console.log('   Please restart manually using Lens:\n');
    console.log('   1. Open Lens');
    console.log(`   2. Select namespace: ${namespace}`);
    console.log('   3. Navigate to Workloads > Deployments');
    console.log('   4. Right-click the deployment and select "Restart"');
    console.log('   5. Wait for the new pods to be ready\n');
  }
}

/**
 * Get an environment variable from a Kubernetes secret
 * @param namespace - The Kubernetes namespace
 * @param secretName - The name of the secret
 * @param key - The key to retrieve from the secret
 * @returns The decoded value or null if not found
 */
export async function getKubernetesSecretValue(
  namespace: string,
  secretName: string,
  key: string
): Promise<string | null> {
  try {
    const { execSync } = await import('child_process');
    const base64Value = execSync(
      `kubectl get secret ${secretName} -n ${namespace} -o jsonpath='{.data.${key}}'`,
      { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }
    ).trim();

    if (!base64Value) {
      return null;
    }

    return Buffer.from(base64Value, 'base64').toString('utf-8');
  } catch (error) {
    return null;
  }
}
