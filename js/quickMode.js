// Quick Mode: simplified name/type/rules/pt editing on top of the existing card.text engine.
function quickFieldEdited(key, value) {
	if (!card.text[key]) return;
	card.text[key].text = curlyQuotes(value);
	drawTextBuffer();
	autoFrameBuffer();
}

function populateQuickFields() {
	var map = {title: 'quick-title', type: 'quick-type', rules: 'quick-rules'};
	Object.entries(map).forEach(([key, id]) => {
		var el = document.querySelector('#' + id);
		var exists = !!card.text[key];
		el.closest('.quick-field-row').classList.toggle('hidden', !exists);
		if (exists) el.value = card.text[key].text;
	});

	var statKey = card.text.pt ? 'pt' : (card.text.loyalty ? 'loyalty' : (card.text.defense ? 'defense' : null));
	var statEl = document.querySelector('#quick-pt');
	var statRow = statEl.closest('.quick-field-row');
	if (statKey) {
		statRow.classList.remove('hidden');
		statEl.value = card.text[statKey].text;
		statEl.oninput = function() { quickFieldEdited(statKey, this.value); };
		statEl.previousElementSibling.innerHTML =
			statKey == 'pt' ? 'Power/Toughness' : (statKey == 'loyalty' ? 'Loyalty' : 'Defense');
	} else {
		statRow.classList.add('hidden');
	}

	var exotic = ['planeswalker', 'saga', 'pokemon', 'battle'].some(v => (card.version || '').includes(v));
	document.querySelector('#quick-advanced-notice').classList.toggle('hidden', !exotic);
}
