const app = require('./app');
const connectDB = require('./config/db');
const { port } = require('./config/env');
const mongoose = require('mongoose');

async function start() {
  await connectDB();
  const server = app.listen(port, () => console.log(`API listening on port ${port}`));

  const shutdown = async (signal) => {
    console.log(`${signal} received, shutting down`);
    server.close(async () => {
      await mongoose.disconnect();
      process.exit(0);
    });
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

start().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
