require('dotenv').config();

async function run() {
  const apiUrl = 'https://afk.hypepath.uz';
  const username = process.env.ADMIN_USERNAME;
  const password = process.env.ADMIN_PASSWORD;

  console.log(`Authenticating with VM server (${apiUrl}) as ${username}...`);
  
  try {
    const loginRes = await fetch(`${apiUrl}/api/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ username, password })
    });

    if (!loginRes.ok) {
      const errText = await loginRes.text();
      throw new Error(`Login failed with status ${loginRes.status}: ${errText}`);
    }

    const loginData = await loginRes.json();
    const token = loginData.token;
    console.log('Authenticated successfully!');

    console.log('Fetching projects from VM server...');
    const projectsRes = await fetch(`${apiUrl}/api/projects`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (!projectsRes.ok) {
      const errText = await projectsRes.text();
      throw new Error(`Failed to fetch projects with status ${projectsRes.status}: ${errText}`);
    }

    const projectsData = await projectsRes.json();
    if (!projectsData.success || !projectsData.projects) {
      throw new Error(`Invalid response format: ${JSON.stringify(projectsData)}`);
    }

    const projectsList = Object.values(projectsData.projects);
    console.log(`\nTotal servers on VM: ${projectsList.length}`);

    let onlineCount = 0;
    let offlineCount = 0;

    projectsList.forEach(p => {
      console.log(`- ID: ${p.id}, Host: ${p.host}:${p.port}, Status: ${p.status}, Owner: ${p.owner}, Type: ${p.type}`);
      if (p.status === 'running') {
        onlineCount++;
      } else {
        offlineCount++;
      }
    });

    console.log(`\nSummary:`);
    console.log(`Online: ${onlineCount}`);
    console.log(`Offline: ${offlineCount}`);

  } catch (err) {
    console.error('Error connecting to VM server:', err.message);
  }
}

run();
