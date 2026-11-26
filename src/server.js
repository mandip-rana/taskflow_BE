const app = require('./app');
const env = require('./config/env');
const { connectDB, disconnectDB } = require('./config/db');

let server;
let shuttingDown = false;

const shutdown = async (reason, exitCode = 0) => {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`${reason} received, shutting down gracefully...`);

  // Force exit if in-flight requests don't finish in time.
  const forceExit = setTimeout(() => {
    console.error('Shutdown timed out, forcing exit');
    process.exit(1);
  }, env.shutdownTimeoutMs);
  forceExit.unref();

  try {
    if (server) {
      await new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
        server.closeIdleConnections();
      });
    }
    await disconnectDB();
    console.log('Shutdown complete');
    process.exit(exitCode);
  } catch (error) {
    console.error('Error during shutdown:', error);
    process.exit(1);
  }
};

const start = async () => {
  try {
    await connectDB();
    server = app.listen(env.port, () => {
      console.log(`TaskFlow API running on port ${env.port} (${env.nodeEnv})`);
    });
  } catch (error) {
    console.error('Failed to start server:', error.message);
    process.exit(1);
  }
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled promise rejection:', reason);
  shutdown('unhandledRejection', 1);
});
process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
  shutdown('uncaughtException', 1);
});

start();
