// Runs on TeleCRM pages automatically
// Checks if there's a pending booking and processes it

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function processPendingBooking() {
  const result = await chrome.storage.local.get('pendingBooking');
  const booking = result.pendingBooking;

  if (!booking || booking.status !== 'pending') return;

  console.log('[FLABS] Processing booking for:', booking.phone);

  try {
    // Step 1: Wait for page to load
    await sleep(2000);

    // Step 2: Find search input and search by phone
    const searchInput = document.querySelector('input[placeholder="Search lead"]');
    if (!searchInput) {
      console.log('[FLABS] Search input not found, retrying...');
      setTimeout(processPendingBooking, 2000);
      return;
    }

    // Strip non-digits and leading 91 country code
    const cleanPhone = booking.phone.replace(/\D/g, '').replace(/^91/, '');
    searchInput.focus();
    searchInput.value = '';
    searchInput.dispatchEvent(new Event('input', { bubbles: true }));
    await sleep(500);

    // Type each character to trigger React input handlers
    for (const char of cleanPhone) {
      searchInput.value += char;
      searchInput.dispatchEvent(new Event('input', { bubbles: true }));
      await sleep(50);
    }
    await sleep(2000);

    // Step 3: Click first lead in results
    const leadLink = document.querySelector('table tbody tr:first-child td:first-child a') ||
                     document.querySelector('[class*="lead-name"]') ||
                     document.querySelector('table tbody tr:first-child a');

    if (!leadLink) {
      throw new Error('Lead not found for phone: ' + cleanPhone);
    }

    leadLink.click();
    await sleep(3000);

    // Step 4: Click status badge
    const statusBadge = document.querySelector('[class*="status-badge"]') ||
                        document.querySelector('[class*="StatusBadge"]') ||
                        document.querySelector('.status-badge');

    if (!statusBadge) throw new Error('Status badge not found');
    statusBadge.click();
    await sleep(1000);

    // Step 5: Click "Want Demo" option
    const allElements = document.querySelectorAll('div, span, li, button');
    let wantDemoEl = null;
    for (const el of allElements) {
      if (el.textContent.trim() === 'Want Demo') {
        wantDemoEl = el;
        break;
      }
    }
    if (!wantDemoEl) throw new Error('Want Demo option not found');
    wantDemoEl.click();
    await sleep(2000);

    // Step 6: Fill date in the sales form
    const dateInput = document.querySelector('input[placeholder="DD/MM/YYYY HH:mm:ss"]');
    if (dateInput) {
      const [y, m, d] = booking.date.split('-');
      const formattedDate = `${d}/${m}/${y} ${booking.time}:00`;
      dateInput.focus();
      dateInput.value = formattedDate;
      dateInput.dispatchEvent(new Event('input', { bubbles: true }));
      dateInput.dispatchEvent(new Event('change', { bubbles: true }));
      await sleep(500);
    }

    // Step 7: Click Next / Proceed button
    const allButtons = document.querySelectorAll('button');
    let nextBtn = null;
    for (const btn of allButtons) {
      if (btn.textContent.trim() === 'Next' || btn.textContent.trim() === 'Proceed to next') {
        nextBtn = btn;
        break;
      }
    }
    if (nextBtn) {
      nextBtn.click();
      await sleep(1500);
    }

    // Mark as complete
    await chrome.storage.local.set({
      pendingBooking: { ...booking, status: 'complete' }
    });
    chrome.runtime.sendMessage({ type: 'BOOKING_COMPLETE', data: booking });
    console.log('[FLABS] TeleCRM updated successfully for:', cleanPhone);

  } catch (error) {
    console.error('[FLABS] Error:', error.message);
    await chrome.storage.local.set({
      pendingBooking: { ...booking, status: 'failed', error: error.message }
    });
    chrome.runtime.sendMessage({ type: 'BOOKING_FAILED', data: booking, error: error.message });
  }
}

// Run when TeleCRM all-leads page loads
if (window.location.href.includes('/leads/all-leads')) {
  processPendingBooking();
}
