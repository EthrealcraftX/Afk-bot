document.addEventListener('DOMContentLoaded', async () => {
    try {
        const token = localStorage.getItem('token');
        if (!token) return;
        const response = await fetch('/api/projects', { headers: { 'Authorization': `Bearer ${token}` } });
        const data = await response.json();
        console.log('parsed');
    } catch (e) { console.error(e); }
});

async function startServer(serverId) {
    try {
        const token = localStorage.getItem('token');
        const response = await fetch(`/api/projects/${serverId}/start`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        const data = await response.json();
    } catch (error) {
        console.error('Error starting server:', error);
    }
}

async function stopServer(serverId) { }
async function deleteServer(serverId) { }
function showToast(message, type) { }
