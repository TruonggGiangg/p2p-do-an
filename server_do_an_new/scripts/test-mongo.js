const { MongoClient } = require('mongodb');

async function run() {
  const uri = 'mongodb+srv://truonggiang2299z:gzTwiKgl04tI2dFU@bt001.rpdv1gp.mongodb.net/p2p_new';
  const client = new MongoClient(uri);
  
  try {
    await client.connect();
    const db = client.db('p2p_new');
    const orderColl = db.collection('investment_orders');
    
    const filter = {
        $expr: { $gte: [{ $ifNull: ['$matchedNodes', 0] }, { $ifNull: ['$totalNodes', 1] }] }
    };
    
    console.log("Filter:", JSON.stringify(filter, null, 2));
    const orders = await orderColl.find(filter).toArray();
    console.log(`Matched Bids Count ($expr): ${orders.length}`);
    for (const o of orders) {
      console.log(`Order ${o._id} - matchedNodes: ${o.matchedNodes}, totalNodes: ${o.totalNodes}, status: ${o.status}`);
    }

    const filter2 = { status: 'closed' };
    const closedOrders = await orderColl.find(filter2).toArray();
    console.log(`\nClosed Bids Count (status: 'closed'): ${closedOrders.length}`);
    for (const o of closedOrders) {
      console.log(`Order ${o._id} - matchedNodes: ${o.matchedNodes}, totalNodes: ${o.totalNodes}, status: ${o.status}`);
    }

  } finally {
    await client.close();
  }
}

run().catch(console.error);
