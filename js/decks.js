function getDeckIdFromUrl() {
	return new URLSearchParams(window.location.search).get('deck');
}

async function showDecksList() {
	document.querySelector('#deck-detail-view').classList.add('hidden');
	document.querySelector('#decks-list-view').classList.remove('hidden');
	var grid = document.querySelector('#decks-grid');
	var empty = document.querySelector('#decks-empty');
	var decks = await CardStorage.getAllDecks();
	decks.sort((a, b) => b.updatedAt - a.updatedAt);
	grid.innerHTML = '';
	empty.classList.toggle('hidden', decks.length > 0);
	for (var deck of decks) {
		grid.appendChild(await buildDeckTile(deck));
	}
}

async function buildDeckTile(deck) {
	var coverCard = null;
	if (deck.cardIds.length > 0) {
		coverCard = await CardStorage.getCard(deck.cardIds[0]);
	}
	var tile = document.createElement('div');
	tile.className = 'library-tile';

	var thumb = document.createElement('div');
	thumb.className = 'library-tile-thumb';
	thumb.onclick = function () { navigateToDeck(deck.id); }
	if (coverCard && coverCard.thumbnail) {
		var img = document.createElement('img');
		img.src = coverCard.thumbnail;
		thumb.appendChild(img);
	} else {
		thumb.textContent = 'No cards yet';
	}
	tile.appendChild(thumb);

	var body = document.createElement('div');
	body.className = 'library-tile-body';

	var title = document.createElement('h5');
	title.className = 'library-tile-title';
	title.textContent = deck.name;
	body.appendChild(title);

	var openButton = document.createElement('button');
	openButton.className = 'quick-export-button';
	openButton.textContent = 'Open';
	openButton.onclick = function () { navigateToDeck(deck.id); }
	body.appendChild(openButton);

	tile.appendChild(body);
	return tile;
}

function navigateToDeck(deckId) {
	// Relative to this page's own current path, so this works whether the
	// site is served from a domain root or a GitHub Pages subpath.
	history.pushState(null, '', '?deck=' + encodeURIComponent(deckId));
	showDeckDetail(deckId);
}

function navigateToDecksList() {
	history.pushState(null, '', window.location.pathname);
	showDecksList();
}

async function showDeckDetail(deckId) {
	var deck = await CardStorage.getDeck(deckId);
	if (!deck) {
		notify('Could not find that deck.', 4);
		showDecksList();
		return;
	}
	document.querySelector('#decks-list-view').classList.add('hidden');
	document.querySelector('#deck-detail-view').classList.remove('hidden');

	var nameInput = document.querySelector('#deck-name-input');
	nameInput.value = deck.name;
	nameInput.onchange = async function () {
		if (nameInput.value.trim()) {
			await CardStorage.renameDeck(deck.id, nameInput.value.trim());
		}
	}

	document.querySelector('#delete-deck-button').onclick = async function () {
		if (confirm('Delete the deck "' + deck.name + '"? Saved cards themselves will not be deleted.')) {
			await CardStorage.deleteDeck(deck.id);
			navigateToDecksList();
		}
	}

	document.querySelector('#download-deck-button').onclick = async function () {
		var cards = await Promise.all(deck.cardIds.map(id => CardStorage.getCard(id)));
		for (var card of cards) {
			if (!card || !card.thumbnail) { continue; }
			var link = document.createElement('a');
			link.href = card.thumbnail;
			link.download = (card.name || 'card') + '.jpg';
			document.body.appendChild(link);
			link.click();
			link.remove();
			// small delay so browsers don't drop rapid-fire downloads
			await new Promise(resolve => setTimeout(resolve, 200));
		}
	}

	await renderDeckCardsList(deck);
}

async function renderDeckCardsList(deck) {
	var list = document.querySelector('#deck-cards-list');
	var empty = document.querySelector('#deck-cards-empty');
	list.innerHTML = '';
	empty.classList.toggle('hidden', deck.cardIds.length > 0);
	var cards = await Promise.all(deck.cardIds.map(id => CardStorage.getCard(id)));
	cards.forEach(card => {
		if (!card) { return; }
		list.appendChild(buildCardTile(card, null, {
			onChange: function () { showDeckDetail(deck.id); },
			onRemove: async function (cardId) {
				await CardStorage.removeCardFromDeck(deck.id, cardId);
				showDeckDetail(deck.id);
			}
		}));
	});
}

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

function startDecklistImport(entries, job) {
	if (entries.length === 0) {
		notify('Paste at least one card first.', 4);
		return;
	}
	sessionStorage.setItem('pendingDecklistImport', JSON.stringify(Object.assign({ entries }, job)));
	window.location.href = '../?importDecklist=1';
}

document.addEventListener('DOMContentLoaded', function () {
	document.querySelector('#decklist-import-submit').onclick = async function () {
		var text = document.querySelector('#decklist-import-text').value;
		var name = document.querySelector('#decklist-new-deck-name').value.trim() || 'Unnamed Deck';
		var entries = parseDecklist(text);
		if (entries.length === 0) {
			var id = await CardStorage.createDeck(name);
			navigateToDeck(id);
			return;
		}
		startDecklistImport(entries, { newDeckName: name });
	}

	document.querySelector('#deck-decklist-import-submit').onclick = function () {
		var text = document.querySelector('#deck-decklist-import-text').value;
		var deckId = getDeckIdFromUrl();
		startDecklistImport(parseDecklist(text), { targetDeckId: deckId });
	}
	window.addEventListener('popstate', function () {
		var deckId = getDeckIdFromUrl();
		if (deckId) { showDeckDetail(deckId); } else { showDecksList(); }
	});
	var initialDeckId = getDeckIdFromUrl();
	if (initialDeckId) {
		showDeckDetail(initialDeckId);
	} else {
		showDecksList();
	}
});
