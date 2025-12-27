import { ApplicationCommandOptionType } from '$discord.ts';
import type { Echo } from '$index.ts';
import { Command } from '$mod/index.ts';

export default <T extends Echo>() =>
	new Command<T>({
		name: 'echo',
		description: 'send back what the user sent',
		options: [
			{
				name: 'string',
				description: 'the string you want sent back to you',
				type: ApplicationCommandOptionType.String,
				required: true,
			},
		],
	}).addHandler('chat_input', (_, int) => {
		const string = int.options.getString('string', true);
		return int.reply(string);
	});
