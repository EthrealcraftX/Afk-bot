const { 
  initialize, 
  createServer, 
  startServer, 
  deleteServer, 
  db: appDb 
} = require('../api/api');
const connectDB = require('../api/db');
const mongoose = require('mongoose');

async function run() {
  await connectDB();
  await initialize();

  console.log('--- Test 1: Deleting a running server AFTER a restart (No in-memory handle) ---');
  
  // Create a server
  const createRes = await createServer('mc.hypixel.net', 25565, '1.20.1', 'java', 'admin');
  const projectId = createRes.projectId;
  console.log(`Created project: ${projectId}`);
  
  // Start the server
  const startRes = await startServer(projectId, 'admin');
  const pid = startRes.pid;
  console.log(`Started project ${projectId} with PID ${pid}`);

  // Wait a little for the process to actually start running properly
  await new Promise(resolve => setTimeout(resolve, 2000));

  let isRunning = false;
  try {
    process.kill(pid, 0); // test if running
    isRunning = true;
  } catch (e) {
    isRunning = false;
  }
  console.log(`Is process ${pid} running before delete? ${isRunning}`);

  // Simulate a server restart by dropping the in-memory handle
  if (appDb.processes[projectId]) {
    delete appDb.processes[projectId];
    console.log('Dropped in-memory handle to simulate server restart.');
  }

  // Delete the server
  const delRes = await deleteServer(projectId, 'admin');
  console.log('Delete result:', delRes);

  // Check if process is still running
  let isRunningAfter = false;
  try {
    process.kill(pid, 0);
    isRunningAfter = true;
  } catch (e) {
    isRunningAfter = false;
  }
  console.log(`Is process ${pid} running after delete? ${isRunningAfter}`);

  if (isRunningAfter) {
    console.error('TEST FAILED: Zombie process still exists!');
    process.kill(pid, 'SIGTERM');
  } else {
    console.log('TEST PASSED: Process was killed during deleteServer.');
  }

  await mongoose.disconnect();
  process.exit(0);
}

run();
