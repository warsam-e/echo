import { ApplicationCommandOptionType, Command } from '@index.ts';

export default new Command({
	name: 'ac',
	description: 'ac test',
	options: [
		{
			name: 'query',
			description: 'query',
			type: ApplicationCommandOptionType.String,
			required: true,
			autocomplete: true,
		},
	],
})
	.addHandler('autocomplete', (_bot, int) => {
		const str = int.options.getString('query', true);
		return int.respond(
			str.split('').map((c) => ({
				name: `${c.toUpperCase()} - ${c}`,
				value: c,
			})),
		);
	})
	.addHandler('chat_input', (_bot, int) => int.reply(int.options.getString('query', true)));
