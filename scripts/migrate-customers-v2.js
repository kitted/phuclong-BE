require('dotenv').config();
const mongoose = require('mongoose');

async function main() {
  if (!process.env.MONGO) throw new Error('MONGO is required');
  await mongoose.connect(process.env.MONGO);
  const customers = mongoose.connection.collection('customers');
  const counters = mongoose.connection.collection('customercounters');
  const indexes = await customers.indexes();

  for (const field of ['phone', 'phones']) {
    const index = indexes.find((item) => item.key?.[field] === 1 && Object.keys(item.key).length === 1);
    if (index?.unique) await customers.dropIndex(index.name);
    await customers.createIndex({ [field]: 1 });
  }

  const segmentMap = {
    VIP: 'HIGHLY_ACTIVE',
    'THÂN THIẾT': 'HIGHLY_ACTIVE',
    'TIỀM NĂNG': 'ACTIVE',
    'ĐẠI LÝ': 'ACTIVE',
    'THƯỜNG': 'ACTIVE',
  };
  for (const [from, to] of Object.entries(segmentMap)) {
    await customers.updateMany({ segment: from }, { $set: { segment: to } });
  }

  const codes = await customers.find({ code: /^KH\d+$/ }, { projection: { code: 1 } }).toArray();
  const maxSequence = codes.reduce((max, row) => Math.max(max, Number(row.code.slice(2)) || 0), 0);
  if (maxSequence > 0) {
    await counters.updateOne(
      { key: 'CUSTOMER_CODE' },
      { $max: { sequence: maxSequence }, $setOnInsert: { key: 'CUSTOMER_CODE' } },
      { upsert: true },
    );
  }
  const verifiedIndexes = (await customers.indexes())
    .filter((index) => ['phone_1', 'phones_1'].includes(index.name))
    .map((index) => ({ name: index.name, key: index.key, unique: Boolean(index.unique) }));
  console.log(JSON.stringify({
    database: mongoose.connection.name,
    customerIndexes: verifiedIndexes,
    maxCustomerSequence: maxSequence,
  }, null, 2));
  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await mongoose.disconnect().catch(() => undefined);
  process.exitCode = 1;
});
