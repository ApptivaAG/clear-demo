import { MongoClient } from 'mongodb';
import prompts from 'prompts';
import { getKubernetesSecretValue } from './kubernetes.js';

export async function performMongoDBCleanup(projectId: string) {
  // Try to get connection string from Kubernetes first
  let connectionString = await getMongoDBUrlFromKubernetes(projectId);

  // Fallback to manual password entry if Kubernetes fetch fails
  if (!connectionString) {
    console.log('⚠️  Could not fetch from Kubernetes, falling back to manual entry\n');

    const { password } = await prompts({
      type: 'password',
      name: 'password',
      message: 'Enter MongoDB password:',
      validate: (value) => (value.length > 0 ? true : 'Password is required'),
    });

    if (!password) {
      console.log('❌ Operation cancelled');
      process.exit(0);
    }

    connectionString = `mongodb+srv://demo-${projectId}:${password}@production.1zpny.mongodb.net/demo-${projectId}?retryWrites=true&w=majority`;
  }

  console.log('\n📡 Connecting to MongoDB...');
  const client = new MongoClient(connectionString);

  try {
    await client.connect();
    console.log('✅ Connected successfully\n');

    const db = client.db(`demo-${projectId}`);

    // Get all collections with their document counts
    const collections = await getAllCollectionsWithCounts(db);

    if (collections.length === 0) {
      console.log('ℹ️  No collections found in database');
      return;
    }

    // Display detailed summaries and collection table
    await displayCollectionSummaries(db, collections);

    // Calculate total documents for confirmation message
    const totalDocuments = collections.reduce((sum, col) => sum + col.count, 0);

    // Single confirmation to delete all collections
    const { confirmDelete } = await prompts({
      type: 'confirm',
      name: 'confirmDelete',
      message: `Delete all ${collections.length} collection(s) with ${totalDocuments} total document(s)?`,
      initial: false,
    });

    if (confirmDelete) {
      // Delete all collections
      await deleteAllCollections(db, collections);
      console.log('\n✅ Collections deleted successfully!');
    } else {
      console.log('\n⏭️  Skipped collection deletion');
    }

    console.log('\n✨ Database operations completed!');
  } catch (error) {
    console.error('\n❌ Error:', error instanceof Error ? error.message : error);
    process.exit(1);
  } finally {
    await client.close();
    console.log('🔌 Connection closed');
  }
}

async function getMongoDBUrlFromKubernetes(projectId: string): Promise<string | null> {
  const namespace = `bubble-demo-${projectId}-chatbot`;
  const secretName = 'env-vars';

  console.log('📡 Fetching MongoDB credentials from Kubernetes...');

  // Try MONGO_DB_URL first, then fall back to CHATBOT_MONGO_DB_URL
  let connectionString = await getKubernetesSecretValue(namespace, secretName, 'MONGO_DB_URL');

  if (!connectionString) {
    connectionString = await getKubernetesSecretValue(namespace, secretName, 'CHATBOT_MONGO_DB_URL');
  }

  if (!connectionString) {
    return null;
  }

  console.log('✅ Credentials retrieved from Kubernetes\n');
  return connectionString;
}

async function getAllCollectionsWithCounts(db: any) {
  const collectionsList = await db.listCollections().toArray();
  const collections = [];

  for (const col of collectionsList) {
    const collection = db.collection(col.name);
    const count = await collection.countDocuments();
    collections.push({ name: col.name, count });
  }

  return collections;
}

async function displayCollectionSummaries(
  db: any,
  collections: { name: string; count: number }[]
) {
  console.log('📋 Collection Summaries:\n');

  // Only show summaries for specific collections
  const collectionsToSummarize = ['users', 'chatbots', 'knowledgebases'];

  for (const col of collections) {
    const collectionName = col.name;
    const count = col.count;

    // Skip collections we don't want to summarize
    if (!collectionsToSummarize.includes(collectionName)) {
      continue;
    }

    // Show collection name with count
    console.log(`   ${collectionName} (${count === 0 ? 'empty' : count}):`);

    if (count === 0) {
      console.log('');
      continue;
    }

    try {
      const documents = await db.collection(collectionName).find({}).limit(10).toArray();

      // Format based on collection type
      if (collectionName === 'users') {
        for (const doc of documents) {
          const name = `${doc.firstName || ''} ${doc.lastName || ''}`.trim();
          const email = doc.email || '';
          const role = doc.role || '';
          console.log(`      • ${name} <${email}> (${role})`);
        }
      } else if (collectionName === 'chatbots') {
        for (const doc of documents) {
          const name = doc.name || 'Unnamed';
          const tone = doc.toneOfVoice || '';
          const formality = doc.formalityLevel || '';
          console.log(`      • ${name} (${tone}, ${formality})`);
        }
      } else if (collectionName === 'knowledgebases') {
        for (const doc of documents) {
          const name = doc.name || 'Unnamed';
          const type = doc.type || '';
          const status = doc.indexingStatus || '';
          console.log(`      • ${name} (${type}, ${status})`);
        }
      }

      console.log('');
    } catch (error) {
      console.log(`      ⚠️  Could not fetch documents\n`);
    }
  }

  // Display all collections in a formatted table
  console.log('📊 Collections in database:\n');
  console.log('   Collection Name                    Documents');
  console.log('   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  let totalDocuments = 0;
  for (const col of collections) {
    const paddedName = col.name.padEnd(35);
    const paddedCount = col.count.toString().padStart(6);
    console.log(`   ${paddedName}${paddedCount}`);
    totalDocuments += col.count;
  }

  console.log('   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  const paddedTotal = 'Total:'.padEnd(35);
  const paddedTotalCount = totalDocuments.toString().padStart(6);
  console.log(`   ${paddedTotal}${paddedTotalCount}\n`);
}

async function deleteAllCollections(
  db: any,
  collections: { name: string; count: number }[]
) {
  console.log('\n🗑️  Deleting collections...\n');

  for (const col of collections) {
    try {
      await db.collection(col.name).drop();
      console.log(`   ✅ Deleted collection: ${col.name} (${col.count} document(s))`);
    } catch (error) {
      console.error(
        `   ❌ Failed to delete ${col.name}:`,
        error instanceof Error ? error.message : error
      );
    }
  }
}
