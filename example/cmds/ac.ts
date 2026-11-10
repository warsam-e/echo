import { ApplicationCommandOptionType, Command } from '$index.ts';

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
		const query = int.options.getFocused();
		return int.respond(
			Array.from(query)
				.slice(0, 25)
				.map((character) => ({
					name: `${character.toUpperCase()} - ${character}`,
					value: character,
				})),
		);
	})
	.addHandler('chat_input', (_bot, int) =>
		int.reply({ content: int.options.getString('query', true), allowedMentions: { parse: [] } }),
	);
