chrome.storage.local.get('pendingBooking', (result) => {
  const booking = result.pendingBooking;
  const statusEl = document.getElementById('status');
  const detailEl = document.getElementById('detail');

  if (!booking) {
    statusEl.className = 'status idle';
    statusEl.textContent = 'Ready to book demos';
    return;
  }

  if (booking.status === 'pending') {
    statusEl.className = 'status pending';
    statusEl.textContent = '⏳ Updating TeleCRM...';
    detailEl.textContent = `Phone: ${booking.phone} | ${booking.date} ${booking.time}`;
  } else if (booking.status === 'complete') {
    statusEl.className = 'status complete';
    statusEl.textContent = '✅ TeleCRM Updated!';
    detailEl.textContent = `Phone: ${booking.phone} | ${booking.date} ${booking.time}`;
  } else if (booking.status === 'failed') {
    statusEl.className = 'status failed';
    statusEl.textContent = '❌ Update Failed';
    detailEl.textContent = booking.error || 'Unknown error';
  }
});

function clearStatus() {
  chrome.storage.local.remove('pendingBooking', () => {
    document.getElementById('status').className = 'status idle';
    document.getElementById('status').textContent = 'Ready to book demos';
    document.getElementById('detail').textContent = '';
  });
}
