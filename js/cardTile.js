// Shared card-tile component, built as one function/CSS system with three
// presentations (per Figma: cardCard, deckCard, deckListCard):
//   - cardCard (My Cards): thumbnail, title, ⋮ menu (Edit/Duplicate/Delete),
//     and an "Add to deck" picker. Call with no `onRemove`.
//   - deckListCard (a deck's own card list on Deck Detail): thumbnail, title,
//     ⋮ menu (Edit/Duplicate/Remove from Deck) — no deck picker, since a card
//     already in this deck isn't choosing a deck here. Call with `onRemove`.
//   - deckCard (a deck itself, on the Decks list) has its own builder,
//     buildDeckTile() in decks.js, since it represents a deck rather than a card.
//
// options:
//   onChange()          — called after Duplicate or Delete/Remove succeeds, so the
//                          caller can re-render its own view.
//   onRemove(cardId)     — if provided, this is a deckListCard: the deck picker is
//                          omitted, and the menu's third item reads "Remove from
//                          Deck" and calls this instead of permanently deleting the
//                          saved card. Omit to get the cardCard behavior (Delete +
//                          deck picker).
function buildCardTile(card, decks, options) {
	options = options || {};
	var tile = document.createElement('div');
	tile.className = 'library-tile';

	var thumb = document.createElement('div');
	thumb.className = 'library-tile-thumb';
	thumb.onclick = function () { window.location.href = '../?card=' + encodeURIComponent(card.id); }
	if (card.thumbnail) {
		var img = document.createElement('img');
		img.src = card.thumbnail;
		img.alt = card.name;
		thumb.appendChild(img);
	} else {
		thumb.textContent = 'No preview';
	}
	tile.appendChild(thumb);

	var body = document.createElement('div');
	body.className = 'library-tile-body';

	var titleRow = document.createElement('div');
	titleRow.className = 'library-tile-title-row';

	var title = document.createElement('h5');
	title.className = 'library-tile-title';
	title.textContent = card.name || 'Unnamed Card';
	titleRow.appendChild(title);

	var menuWrap = document.createElement('div');
	menuWrap.className = 'library-tile-menu-wrap';

	var menuButton = document.createElement('button');
	menuButton.className = 'library-tile-menu-button';
	menuButton.setAttribute('aria-label', 'More actions');
	var menuIcon = document.createElement('img');
	menuIcon.src = '../img/quickMode/menu-dots.svg';
	menuIcon.alt = '';
	menuButton.appendChild(menuIcon);
	menuWrap.appendChild(menuButton);

	var menu = document.createElement('div');
	menu.className = 'library-tile-menu hidden';

	var editItem = document.createElement('button');
	editItem.textContent = 'Edit';
	editItem.onclick = function () { window.location.href = '../?card=' + encodeURIComponent(card.id); }
	menu.appendChild(editItem);

	var duplicateItem = document.createElement('button');
	duplicateItem.textContent = 'Duplicate';
	duplicateItem.onclick = async function () {
		menu.classList.add('hidden');
		await CardStorage.duplicateCard(card.id);
		if (options.onChange) { options.onChange(); }
	}
	menu.appendChild(duplicateItem);

	var lastItem = document.createElement('button');
	if (options.onRemove) {
		lastItem.textContent = 'Remove from Deck';
		lastItem.onclick = function () {
			menu.classList.add('hidden');
			options.onRemove(card.id);
		}
	} else {
		lastItem.textContent = 'Delete';
		lastItem.onclick = async function () {
			menu.classList.add('hidden');
			if (confirm('Delete "' + card.name + '"? This cannot be undone.')) {
				await CardStorage.deleteCard(card.id);
				if (options.onChange) { options.onChange(); }
			}
		}
	}
	menu.appendChild(lastItem);

	menuButton.onclick = function (event) {
		event.stopPropagation();
		var wasHidden = menu.classList.contains('hidden');
		closeAllCardMenus();
		if (wasHidden) { menu.classList.remove('hidden'); }
	}
	menuWrap.appendChild(menu);
	titleRow.appendChild(menuWrap);
	body.appendChild(titleRow);

	// deckListCard (options.onRemove set) has no deck picker — a card already
	// in this deck isn't choosing a deck from within that same deck's list.
	if (!options.onRemove) {
		var deckSelect = document.createElement('select');
		deckSelect.className = 'input';
		var placeholder = document.createElement('option');
		placeholder.textContent = 'Add to deck...';
		placeholder.setAttribute('selected', 'selected');
		placeholder.setAttribute('disabled', 'disabled');
		deckSelect.appendChild(placeholder);
		decks.forEach(deck => {
			var option = document.createElement('option');
			option.value = deck.id;
			option.textContent = deck.name;
			deckSelect.appendChild(option);
		});
		var newDeckOption = document.createElement('option');
		newDeckOption.value = '__new__';
		newDeckOption.textContent = '+ New deck...';
		deckSelect.appendChild(newDeckOption);
		deckSelect.onchange = async function () {
			var value = deckSelect.value;
			var deckId = value;
			if (value === '__new__') {
				var name = prompt('Enter a name for the new deck:');
				if (!name) { deckSelect.value = ''; return; }
				deckId = await CardStorage.createDeck(name.trim());
			}
			await CardStorage.addCardToDeck(deckId, card.id);
			notify('Added "' + card.name + '" to the deck.', 3);
			deckSelect.value = '';
		}
		body.appendChild(deckSelect);
	}

	tile.appendChild(body);
	return tile;
}

function closeAllCardMenus() {
	document.querySelectorAll('.library-tile-menu').forEach(menu => menu.classList.add('hidden'));
}

document.addEventListener('click', closeAllCardMenus);
