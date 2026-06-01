const mongoose = require('mongoose');

async function main() {
  await mongoose.connect('mongodb://localhost:27017/p2p_lending');
  const userSchema = new mongoose.Schema({}, { strict: false });
  const User = mongoose.model('User', userSchema, 'users');

  const user16 = await User.findOne({ username: '0399614016' });
  console.log("USER 16 IN MONGO:", JSON.stringify(user16, null, 2));

  const user15 = await User.findOne({ username: '0399614015' });
  console.log("USER 15 IN MONGO:", JSON.stringify(user15, null, 2));

  await mongoose.disconnect();
}

main().catch(console.error);
