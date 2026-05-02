/**
 * Fix: Mở lại các Investment Orders bị đóng sai
 * (matchedNodes < totalNodes nhưng status = 'closed')
 */
const { MongoClient } = require('mongodb');

const MONGO_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/p2p_lending';

async function main() {
  const client = new MongoClient(MONGO_URI);
  await client.connect();
  const db = client.db();

  const collection = db.collection('investmentorders');

  // Tìm tất cả order bị đóng sai (matchedNodes < totalNodes nhưng status = 'closed')
  const wronglyClosed = await collection.find({
    status: 'closed',
    $expr: { $lt: ['$matchedNodes', '$totalNodes'] },
  }).toArray();

  console.log(`Found ${wronglyClosed.length} orders wrongly closed:`);
  for (const order of wronglyClosed) {
    console.log(`  - Order ${order._id}: matchedNodes=${order.matchedNodes}/${order.totalNodes} (${Math.round(order.matchedNodes / order.totalNodes * 100)}%) → Reopening...`);
  }

  if (wronglyClosed.length > 0) {
    const result = await collection.updateMany(
      {
        status: 'closed',
        $expr: { $lt: ['$matchedNodes', '$totalNodes'] },
      },
      { $set: { status: 'open' } },
    );
    console.log(`✅ Fixed ${result.modifiedCount} orders → status='open'`);
  } else {
    console.log('✅ No orders to fix');
  }

  await client.close();
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
