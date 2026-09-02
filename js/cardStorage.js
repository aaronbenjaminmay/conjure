// Shared IndexedDB-backed storage for saved cards and decks.
// Loaded as a plain global script (no bundler in this repo) and exposes
// a single `CardStorage` object used by the creator page, My Cards, and Decks.
var CardStorage = (function () {
	const DB_NAME = 'cardConjurerLibrary';
	const DB_VERSION = 1;
	let dbPromise = null;

	function openDB() {
		if (dbPromise) {
			return dbPromise;
		}
		dbPromise = new Promise((resolve, reject) => {
			const request = indexedDB.open(DB_NAME, DB_VERSION);
			request.onupgradeneeded = function (event) {
				const db = event.target.result;
				if (!db.objectStoreNames.contains('cards')) {
					db.createObjectStore('cards', { keyPath: 'id' });
				}
				if (!db.objectStoreNames.contains('decks')) {
					db.createObjectStore('decks', { keyPath: 'id' });
				}
			};
			request.onsuccess = function (event) { resolve(event.target.result); }
			request.onerror = function (event) { reject(event.target.error); }
		});
		return dbPromise;
	}

	function withStore(storeName, mode, callback) {
		return openDB().then(db => new Promise((resolve, reject) => {
			const tx = db.transaction(storeName, mode);
			const store = tx.objectStore(storeName);
			const result = callback(store);
			tx.oncomplete = function () { resolve(result); }
			tx.onerror = function (event) { reject(event.target.error); }
		}));
	}

	function requestToPromise(request) {
		return new Promise((resolve, reject) => {
			request.onsuccess = function () { resolve(request.result); }
			request.onerror = function (event) { reject(event.target.error); }
		});
	}

	function makeId() {
		if (window.crypto && crypto.randomUUID) {
			return crypto.randomUUID();
		}
		return 'id-' + Date.now() + '-' + Math.random().toString(16).slice(2);
	}

	// ---- Cards ----

	function getAllCards() {
		return openDB().then(db => new Promise((resolve, reject) => {
			const tx = db.transaction('cards', 'readonly');
			const request = tx.objectStore('cards').getAll();
			request.onsuccess = function () { resolve(request.result || []); }
			request.onerror = function (event) { reject(event.target.error); }
		}));
	}

	function getCard(id) {
		return openDB().then(db => new Promise((resolve, reject) => {
			const tx = db.transaction('cards', 'readonly');
			const request = tx.objectStore('cards').get(id);
			request.onsuccess = function () { resolve(request.result || null); }
			request.onerror = function (event) { reject(event.target.error); }
		}));
	}

	// id: existing card id to update, or null/undefined to create a new one.
	// Returns a Promise<string> resolving to the card's id.
	function saveCard(id, name, data, thumbnail) {
		return openDB().then(db => new Promise((resolve, reject) => {
			const tx = db.transaction('cards', 'readwrite');
			const store = tx.objectStore('cards');
			const now = Date.now();
			const getRequest = id ? store.get(id) : null;
			const finish = (existing) => {
				const record = {
					id: id || makeId(),
					name: name || 'Unnamed Card',
					thumbnail: thumbnail || (existing && existing.thumbnail) || null,
					data: data,
					createdAt: (existing && existing.createdAt) || now,
					updatedAt: now
				};
				store.put(record);
				tx.oncomplete = function () { resolve(record.id); }
			};
			if (getRequest) {
				getRequest.onsuccess = function () { finish(getRequest.result); }
				getRequest.onerror = function (event) { reject(event.target.error); }
			} else {
				finish(null);
			}
			tx.onerror = function (event) { reject(event.target.error); }
		}));
	}

	function deleteCard(id) {
		return withStore('cards', 'readwrite', store => store.delete(id))
			.then(() => removeCardFromAllDecks(id));
	}

	// name: optional override for the duplicate's name (defaults to "<original> (copy)").
	function duplicateCard(id, name) {
		return getCard(id).then(existing => {
			if (!existing) {
				return null;
			}
			const now = Date.now();
			const record = {
				id: makeId(),
				name: name || (existing.name + ' (copy)'),
				thumbnail: existing.thumbnail,
				data: existing.data,
				createdAt: now,
				updatedAt: now
			};
			return withStore('cards', 'readwrite', store => store.put(record)).then(() => record.id);
		});
	}

	function removeCardFromAllDecks(cardId) {
		return getAllDecks().then(decks => {
			const affected = decks.filter(deck => deck.cardIds && deck.cardIds.includes(cardId));
			return Promise.all(affected.map(deck => {
				deck.cardIds = deck.cardIds.filter(id => id !== cardId);
				deck.updatedAt = Date.now();
				return withStore('decks', 'readwrite', store => store.put(deck));
			}));
		});
	}

	// ---- Decks ----

	function getAllDecks() {
		return openDB().then(db => new Promise((resolve, reject) => {
			const tx = db.transaction('decks', 'readonly');
			const request = tx.objectStore('decks').getAll();
			request.onsuccess = function () { resolve(request.result || []); }
			request.onerror = function (event) { reject(event.target.error); }
		}));
	}

	function getDeck(id) {
		return openDB().then(db => new Promise((resolve, reject) => {
			const tx = db.transaction('decks', 'readonly');
			const request = tx.objectStore('decks').get(id);
			request.onsuccess = function () { resolve(request.result || null); }
			request.onerror = function (event) { reject(event.target.error); }
		}));
	}

	function createDeck(name) {
		const now = Date.now();
		const record = { id: makeId(), name: name || 'Unnamed Deck', cardIds: [], createdAt: now, updatedAt: now };
		return withStore('decks', 'readwrite', store => store.put(record)).then(() => record.id);
	}

	function renameDeck(id, name) {
		return getDeck(id).then(deck => {
			if (!deck) { return; }
			deck.name = name;
			deck.updatedAt = Date.now();
			return withStore('decks', 'readwrite', store => store.put(deck));
		});
	}

	function deleteDeck(id) {
		return withStore('decks', 'readwrite', store => store.delete(id));
	}

	function addCardToDeck(deckId, cardId) {
		return getDeck(deckId).then(deck => {
			if (!deck) { return; }
			if (!deck.cardIds.includes(cardId)) {
				deck.cardIds.push(cardId);
				deck.updatedAt = Date.now();
				return withStore('decks', 'readwrite', store => store.put(deck));
			}
		});
	}

	function removeCardFromDeck(deckId, cardId) {
		return getDeck(deckId).then(deck => {
			if (!deck) { return; }
			deck.cardIds = deck.cardIds.filter(id => id !== cardId);
			deck.updatedAt = Date.now();
			return withStore('decks', 'readwrite', store => store.put(deck));
		});
	}

	function reorderDeckCards(deckId, orderedCardIds) {
		return getDeck(deckId).then(deck => {
			if (!deck) { return; }
			deck.cardIds = orderedCardIds;
			deck.updatedAt = Date.now();
			return withStore('decks', 'readwrite', store => store.put(deck));
		});
	}

	// ---- One-time migration from the legacy localStorage save system ----

	function migrateLegacyLocalStorageCards() {
		if (localStorage.getItem('cardConjurerLibraryMigrated')) {
			return Promise.resolve();
		}
		let legacyKeys = [];
		try {
			legacyKeys = JSON.parse(localStorage.getItem('cardKeys')) || [];
		} catch (error) {
			legacyKeys = [];
		}
		const imports = legacyKeys.map(key => {
			let data;
			try {
				data = JSON.parse(localStorage.getItem(key));
			} catch (error) {
				data = null;
			}
			if (!data) {
				return Promise.resolve();
			}
			return saveCard(null, key, data, null);
		});
		return Promise.all(imports).then(() => {
			localStorage.setItem('cardConjurerLibraryMigrated', 'true');
		});
	}

	return {
		getAllCards,
		getCard,
		saveCard,
		deleteCard,
		duplicateCard,
		getAllDecks,
		getDeck,
		createDeck,
		renameDeck,
		deleteDeck,
		addCardToDeck,
		removeCardFromDeck,
		reorderDeckCards,
		migrateLegacyLocalStorageCards
	};
})();
