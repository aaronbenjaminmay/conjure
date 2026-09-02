// Bulk decklist import: reads a pending job left in sessionStorage by the Decks page,
// then drives the same Scryfall-lookup + auto-frame pipeline Quick Mode's "Load a real
// card by name" already uses, once per decklist entry, saving each result to the library.
const DECKLIST_SESSION_KEY = 'pendingDecklistImport';
const DECKLIST_SETTLE_MS = 3000;

function parseDecklist(text) {
	return text.split('\n')
		.map(line => line.trim())
		.filter(line => line && !line.startsWith('//') && !line.startsWith('#'))
		.map(line => {
			// Strip trailing set/collector annotations, e.g. "4 Lightning Bolt (LEA) 123"
			line = line.replace(/\s*[\(\[][A-Za-z0-9]{2,6}[\)\]]\s*\S*\s*$/, '').trim();
			var match = line.match(/^(\d+)\s*x?\s+(.+)$/i);
			if (match) {
				return { quantity: Math.max(1, parseInt(match[1], 10)), name: match[2].trim() };
			}
			return { quantity: 1, name: line };
		})
		.filter(entry => entry.name.length > 0);
}

function fetchScryfallDataAsync(name, timeoutMs = 8000) {
	return new Promise(resolve => {
		var settled = false;
		fetchScryfallData(name, function (cards) {
			if (!settled) { settled = true; resolve(cards); }
		}, '');
		setTimeout(function () {
			if (!settled) { settled = true; resolve(null); }
		}, timeoutMs);
	});
}

function decklistLog(message) {
	var log = document.querySelector('#decklist-import-log');
	var line = document.createElement('div');
	line.textContent = message;
	log.appendChild(line);
	log.scrollTop = log.scrollHeight;
}

// A lookup with no response within the timeout is ambiguous: it could be a genuine
// "no such card", or Scryfall silently throttling/blocking the request (which shows up
// in the browser as a network/CORS failure, not a clean 404 — fetchScryfallData's
// onreadystatechange never fires its callback for either case). Retry with backoff
// before giving up, since a throttled request usually succeeds once traffic slows down.
async function fetchScryfallDataWithRetry(name, maxAttempts = 3) {
	for (var attempt = 1; attempt <= maxAttempts; attempt++) {
		var results = await fetchScryfallDataAsync(name);
		if (results && results.length > 0) {
			return results;
		}
		if (attempt < maxAttempts) {
			decklistLog('No response for "' + name + '", waiting and retrying (' + attempt + '/' + (maxAttempts - 1) + ')...');
			await new Promise(resolve => setTimeout(resolve, 6000 * attempt));
		}
	}
	return null;
}

async function waitForDefaultCardText(timeoutMs = 5000) {
	var start = performance.now();
	while (!(card.text && card.text.title) && performance.now() - start < timeoutMs) {
		await new Promise(resolve => setTimeout(resolve, 20));
	}
}

async function runDecklistImport() {
	var raw = sessionStorage.getItem(DECKLIST_SESSION_KEY);
	sessionStorage.removeItem(DECKLIST_SESSION_KEY);
	if (!raw) { return; }
	var job = JSON.parse(raw);
	var entries = job.entries || [];
	if (entries.length === 0) { return; }

	var overlay = document.querySelector('#decklist-import-overlay');
	var status = document.querySelector('#decklist-import-status');
	var progress = document.querySelector('#decklist-import-progress');
	overlay.classList.remove('hidden');

	await waitForDefaultCardText();

	var deckId = job.targetDeckId;
	if (!deckId) {
		deckId = await CardStorage.createDeck(job.newDeckName || 'Imported Deck');
	}

	// Arm auto-frame the same way the manual Quick Mode search does, once, up front.
	if (document.querySelector('#autoFrame').value == 'false') {
		document.querySelector('#autoFrame').value = 'M15Regular-1';
		localStorage.setItem('autoFrame', 'M15Regular-1');
		document.querySelector('#autoLoadFrameVersion').checked = true;
		localStorage.setItem('autoLoadFrameVersion', 'true');
	}

	var notFoundCount = 0;
	var errorCount = 0;
	var importedCount = 0;

	for (var i = 0; i < entries.length; i++) {
		var entry = entries[i];
		status.textContent = 'Importing ' + entry.name + '...';
		progress.textContent = (i + 1) + ' / ' + entries.length;

		try {
			var results = await fetchScryfallDataWithRetry(entry.name);
			if (!results || results.length === 0) {
				notFoundCount++;
				decklistLog('Not found: ' + entry.name);
				continue;
			}

			document.querySelector('#import-name').value = entry.name;
			importCard(results);

			// Let the debounced auto-frame/text redraw and the async art/set-symbol fetches settle.
			await new Promise(resolve => setTimeout(resolve, DECKLIST_SETTLE_MS));

			var thumbnail = generateCardThumbnail();
			var snapshot = buildSerializableCardSnapshot();
			var cardName = getCardName();
			var firstId = await CardStorage.saveCard(null, cardName, snapshot, thumbnail);
			await CardStorage.addCardToDeck(deckId, firstId);

			for (var copy = 1; copy < entry.quantity; copy++) {
				var dupId = await CardStorage.duplicateCard(firstId, cardName);
				await CardStorage.addCardToDeck(deckId, dupId);
			}

			importedCount += entry.quantity;
			decklistLog('Added ' + entry.quantity + '× ' + cardName);
		} catch (error) {
			// Never let one bad entry (an unexpected Scryfall response shape, etc.) abort the whole batch.
			errorCount++;
			decklistLog('Error importing "' + entry.name + '": ' + error.message);
			console.error('Decklist import failed for "' + entry.name + '"', error);
		}
	}

	var summary = 'Done. Imported ' + importedCount + ' card' + (importedCount == 1 ? '' : 's') + '.';
	if (notFoundCount) { summary += ' ' + notFoundCount + ' not found.'; }
	if (errorCount) { summary += ' ' + errorCount + ' failed with an error.'; }
	status.textContent = summary;
	progress.textContent = '';

	var doneButton = document.querySelector('#decklist-import-done');
	doneButton.classList.remove('hidden');
	doneButton.onclick = function () {
		window.location.href = '/decks/?deck=' + encodeURIComponent(deckId);
	};
}

if (params.get('importDecklist')) {
	runDecklistImport();
}
