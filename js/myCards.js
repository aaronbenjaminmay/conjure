async function renderCardsGrid() {
	var grid = document.querySelector('#cards-grid');
	var empty = document.querySelector('#cards-empty');
	var [cards, decks] = await Promise.all([CardStorage.getAllCards(), CardStorage.getAllDecks()]);
	cards.sort((a, b) => b.updatedAt - a.updatedAt);
	grid.innerHTML = '';
	empty.classList.toggle('hidden', cards.length > 0);
	cards.forEach(card => grid.appendChild(buildCardTile(card, decks, { onChange: renderCardsGrid })));
}

document.addEventListener('DOMContentLoaded', renderCardsGrid);
