require('dotenv').config();
const mongoose = require('mongoose');
const Project = require('./api/models/Project');

async function check() {
  const uri = process.env.MONGODB_URI;
  console.log('Connecting to MongoDB...');
  await mongoose.connect(uri);
  console.log('Connected! Fetching servers...');
  
  const projects = await Project.find({});
  console.log(`Total servers in DB: ${projects.length}`);
  
  let onlineCount = 0;
  let offlineCount = 0;
  
  projects.forEach(p => {
    console.log(`- ID: ${p.projectId}, Host: ${p.host}:${p.port}, Status: ${p.status}, Owner: ${p.owner}, Type: ${p.type}`);
    if (p.status === 'running') {
      onlineCount++;
    } else {
      offlineCount++;
    }
  });
  
  console.log(`\nSummary:`);
  console.log(`Online: ${onlineCount}`);
  console.log(`Offline: ${offlineCount}`);
  
  await mongoose.disconnect();
  console.log('Disconnected.');
}

check().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
