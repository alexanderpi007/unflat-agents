// A simulated iframe for browser boundary tests; this does not test Swarm storage.
export const proxyFixture = `<!doctype html><button id="connect" disabled>Owner: connect Swarm ID</button><script>
const send = message => parent.postMessage(message, 'http://localhost:3107');
document.getElementById('connect').onclick = () => {
  send({ type: 'connectionInfoChanged', canUpload: true, uploadMode: 'user-stamp',
    identity: { id: 'test-owner', name: 'Test owner', address: '11'.repeat(20), avatar: { source: 'generated', url: '' } } });
};
window.addEventListener('message', async event => {
  if (event.origin !== 'http://localhost:3107') return;
  const m = event.data;
  const reply = (type, data = {}) => send({ type, requestId: m.requestId, ...data });
  if (m.type === 'parentIdentify') {
    document.getElementById('connect').disabled = false;
    send({ type: 'proxyReady', authenticated: false, parentOrigin: event.origin, storageShared: false });
    send({ type: 'connectionInfoChanged', canUpload: false, uploadMode: 'unavailable' });
  }
  if (m.type === 'getNodeInfo') reply('error', { error: 'HTTP 404: node metadata endpoint unavailable' });
  if (m.type === 'getPostageBatch') reply('error', { error: 'HTTP 404: postage metadata endpoint unavailable' });
  if (m.type === 'uploadData') {
    const r = await fetch('/test-storage', { method: 'POST', body: JSON.stringify({ data: Array.from(m.data), options: { ...m.options, useWebSocket: m.useWebSocket, useWorkers: m.useWorkers, concurrency: m.concurrency } }) });
    const result = await r.json();
    if (result.error) reply('error', { error: result.error });
    else reply('uploadDataResponse', result);
  }
  if (m.type === 'downloadData') {
    const r = await fetch('/test-storage?reference=' + m.reference);
    const data = await r.json();
    if (data.error) reply('error', { error: data.error });
    else reply('downloadDataResponse', { data: new Uint8Array(data.bytes) });
  }
});
send({ type: 'proxyInitialized' });
</script>`;
