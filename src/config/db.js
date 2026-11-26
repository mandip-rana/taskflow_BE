const mongoose = require('mongoose');
const env = require('./env');

mongoose.set('strictQuery', true);

mongoose.connection.on('disconnected', () => console.warn('MongoDB disconnected'));
mongoose.connection.on('reconnected', () => console.log('MongoDB reconnected'));
mongoose.connection.on('error', (error) => console.error('MongoDB error:', error.message));

const connectDB = async (uri = env.mongoUri) => {
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
  console.log(`MongoDB connected: ${mongoose.connection.host}/${mongoose.connection.name}`);
};

const disconnectDB = () => mongoose.connection.close();

const isDBConnected = () => mongoose.connection.readyState === 1;

module.exports = { connectDB, disconnectDB, isDBConnected };
