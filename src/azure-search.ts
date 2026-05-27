import prompts from 'prompts';
import { getKubernetesSecretValue } from './kubernetes.js';

export interface AzureSearchCredentials {
  endpoint: string;
  apiKey: string;
  indexName: string;
}

export async function performAzureSearchCleanup(projectId: string) {
  console.log('\n🔍 Azure AI Search Index Cleanup');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  // Try to get credentials from Kubernetes
  const credentials = await getAzureSearchCredentialsFromKubernetes(projectId);

  if (credentials) {
    // Automatic deletion flow
    console.log(`   Index name: ${credentials.indexName}`);
    console.log(`   Endpoint:   ${credentials.endpoint}\n`);

    const { confirmDelete } = await prompts({
      type: 'confirm',
      name: 'confirmDelete',
      message: `Delete Azure AI Search index "${credentials.indexName}"?`,
      initial: false,
    });

    if (confirmDelete) {
      console.log('\n   🗑️  Deleting index...');
      const success = await deleteAzureSearchIndex(credentials);

      if (success) {
        console.log('   ✅ Azure AI Search index deleted successfully\n');
      } else {
        console.log('   ⚠️  Failed to delete automatically. Please delete manually.\n');
        displayManualAzureSearchLinks(projectId);
      }
    } else {
      console.log('\n   ⏭️  Skipped Azure AI Search index deletion\n');
    }
  } else {
    // Fallback to manual flow
    console.log('⚠️  Could not fetch credentials from Kubernetes\n');
    displayManualAzureSearchLinks(projectId);

    const { confirmed } = await prompts({
      type: 'confirm',
      name: 'confirmed',
      message: 'Have you completed the Azure AI Search index cleanup?',
      initial: false,
    });

    if (confirmed) {
      console.log('   ✅ Azure AI Search index cleanup confirmed\n');
    } else {
      console.log('   ⚠️  Please complete the Azure AI Search index cleanup manually\n');
    }
  }
}

async function getAzureSearchCredentialsFromKubernetes(
  projectId: string
): Promise<AzureSearchCredentials | null> {
  const namespace = `bubble-demo-${projectId}-chatbot`;
  const secretName = 'env-vars';

  console.log('📡 Fetching Azure AI Search credentials from Kubernetes...');

  const endpoint = await getKubernetesSecretValue(namespace, secretName, 'AZURE_AI_SEARCH_ENDPOINT');
  const apiKey = await getKubernetesSecretValue(namespace, secretName, 'AZURE_AI_SEARCH_API_KEY');
  const indexName = await getKubernetesSecretValue(namespace, secretName, 'AZURE_AI_SEARCH_INDEX_NAME');

  if (!endpoint || !apiKey || !indexName) {
    return null;
  }

  console.log('✅ Credentials retrieved from Kubernetes\n');
  return { endpoint, apiKey, indexName };
}

async function deleteAzureSearchIndex(credentials: AzureSearchCredentials): Promise<boolean> {
  const { endpoint, apiKey, indexName } = credentials;
  const url = `${endpoint}/indexes/${indexName}?api-version=2023-11-01`;

  try {
    const response = await fetch(url, {
      method: 'DELETE',
      headers: {
        'api-key': apiKey,
      },
    });

    if (response.status === 204 || response.status === 404) {
      // 204 = deleted successfully, 404 = index didn't exist
      return true;
    }

    console.error(`   ❌ Failed to delete index: ${response.status} ${response.statusText}`);
    return false;
  } catch (error) {
    console.error(`   ❌ Error:`, error instanceof Error ? error.message : error);
    return false;
  }
}

async function displayManualAzureSearchLinks(projectId: string) {
  console.log(`\n   To complete the cleanup, delete the Azure AI Search index:\n`);
  console.log(`   Index name: bubble-demo-${projectId}\n`);

  // Try to get endpoint from kubectl
  const credentials = await getAzureSearchCredentialsFromKubernetes(projectId);

  if (credentials) {
    console.log(`   Azure Search Service Endpoint: ${credentials.endpoint}`);
    console.log(`   Index to delete: ${credentials.indexName}\n`);
    console.log(`   Direct index URL: ${credentials.endpoint}/indexes/${credentials.indexName}\n`);
  } else {
    console.log('   ⚠️  Could not retrieve Azure Search endpoint from Kubernetes');
    console.log(`   Please check the namespace: bubble-demo-${projectId}-chatbot\n`);
  }

  console.log('   Instructions:');
  console.log('   1. Open Azure Portal and navigate to your Azure AI Search service');
  console.log('   2. Find the index listed above');
  console.log('   3. Click the "Delete" button');
  console.log('   4. Confirm the deletion\n');
}
