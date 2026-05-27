#!/usr/bin/env node

import prompts from 'prompts';
import { performMongoDBCleanup } from './mongodb.js';
import { performAzureSearchCleanup } from './azure-search.js';
import { restartKubernetesDeployment } from './kubernetes.js';



async function main() {
  console.log('🧹 Demo Chatbot Cleanup Tool\n');

  // Prompt for project ID
  const { projectId } = await prompts({
    type: 'text',
    name: 'projectId',
    message: 'Enter project ID (e.g., kd6zk2):',
    validate: (value) => (value.length > 0 ? true : 'Project ID is required'),
  });

  if (!projectId) {
    console.log('❌ Operation cancelled');
    process.exit(0);
  }

  // Perform MongoDB cleanup
  await performMongoDBCleanup(projectId);

  // Perform Azure AI Search index cleanup
  await performAzureSearchCleanup(projectId);

  // Restart Kubernetes deployment
  await restartKubernetesDeployment(projectId);
}

// Handle SIGINT (Ctrl+C)
process.on('SIGINT', () => {
  console.log('\n\n❌ Operation cancelled by user');
  process.exit(0);
});

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
