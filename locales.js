const fs = require('fs');

module.exports = class {
	#locales = {};
	#file;
	constructor(file) {
		this.#file = file;

		for(let language of fs.readdirSync(process.cwd() + '/locales/'))
		{
			if(fs.existsSync(process.cwd() + '/locales/' + language + '/' + this.#file + '.json'))
			{
				try {
					this.#locales[language] = require(process.cwd() + '/locales/' + language + '/' + this.#file + '.json');
				}
				catch(e)
				{
					console.log('Could not load ' + language + ' locale : ' + e)
				}
			}
		}
	}

	get(term, locale = undefined)
	{
		if(this.#locales[locale] === undefined)
		{
			if(this.#locales['en-US'] !== undefined)
			{
				locale = 'en-US';
			}
			else return 'Text going here not found (pls report it with `/feedback`)';
		}

		let splitted_args = term.split('.');
		let iterated_value = this.#locales[locale];
		for(let term_part of splitted_args)
		{
			if(iterated_value[term_part] !== undefined)
			{
				iterated_value = iterated_value[term_part];
			}
			else return locale === 'en-US' ? 'Text going here not found (pls report it with `/feedback`)' : this.get(term, 'en-US');
		}

		return typeof iterated_value == "string" ? iterated_value : "Text going here corrupted (pls report it with `/feedback`)";
	}

	all(term)
	{
		let splitted_args = term.split('.');

		let locale_object = {};
		for(let language of Object.keys(this.#locales))
		{
			let iterated_value = this.#locales[language];
			for(let term_part of splitted_args)
			{
				if(iterated_value[term_part] !== undefined)
				{
					iterated_value = iterated_value[term_part];
				}
				else break;
			}

			if(typeof iterated_value === "string")
			{
				locale_object[language] = iterated_value;
			}
		}

		return locale_object;
	}

	place(term, params)
	{
		for(let param_key of Object.keys(params))
		{
			term = term.replace('{' + param_key + '}', params[param_key]);
		}

		return term;
	}
}