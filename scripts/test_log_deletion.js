const { 
  initialize, 
  createServer, 
  startServer, 
  deleteServer
} = require('../api/api');
const connectDB = require('../api/db');
const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');

async function run() {
  await connectDB();
  await initialize();

  console.log('--- Test: Creating and deleting server to verify log unlinking ---');
  
  const createRes = await createServer('mc.hypixel.net', 25565, '1.20.1', 'java', 'admin');
  const projectId = createRes.projectId;
  console.log(`Created project: ${projectId}`);
  
  await startServer(projectId, 'admin');
  console.log(`Started project ${projectId}`);

  // Let it write to logs for a brief moment
  await new Promise(resolve => setTimeout(resolve, 1000));

  const logPath = path.join(__dirname, '../data/logs', `${projectId}.log`);
  const eventPath = path.join(__dirname, '../data/events', `${projectId}.log`);

  const logExistsBefore = fs.existsSync(logPath);
  console.log(`Log file exists before delete? ${logExistsBefore}`);

  console.log('Deleting server...');
  await deleteServer(projectId, 'admin');

  // Check if logs exist
  const logExistsAfter = fs.existsSync(logPath);
  const eventExistsAfter = fs.existsSync(eventPath);

  console.log(`Log file exists after delete? ${logExistsAfter}`);
  console.log(`Event file exists after delete? ${eventExistsAfter}`);

  if (logExistsAfter) {
    console.error('TEST FAILED: Log file was not deleted!');
  } else {
    console.log('TEST PASSED: Log file was successfully deleted.');
  }

  await mongoose.disconnect();
  process.exit(0);
}

run();
