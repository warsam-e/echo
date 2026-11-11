import { inspect } from 'node:util';
import { ApplicationCommandOptionType, AttachmentBuilder } from 'discord.js';
import type { Echo } from '$index.ts';
import { Command } from '$mod/index.ts';

export default <T extends Echo>() =>
	new Command<T>({
		name: 'eval',
		description: 'evaluate javascript',
		options: [
			{
				name: 'script',
				description: 'the code',
				type: ApplicationCommandOptionType.String,
				required: true,
			},
		],
		owners_only: true,
	}).addHandler('chat_input', async (bot, int) => {
		const script = int.options.getString('script', true);
		await int.deferReply();

		let run: unknown;
		try {
			run = await Object.getPrototypeOf(async () => '').constructor('bot', 'int', `return ${script}`)(bot, int);
		} catch (e) {
			console.error(e);
			run = e;
		}

		const output = inspect(run, { depth: 0 });
		const content = `Output for \`${script}\`:\n\`\`\`js\n${output}\n\`\`\``;
		if (content.length > 2_000) {
			return int.editReply({ files: [new AttachmentBuilder(Buffer.from(output), { name: 'eval-output.txt' })] });
		}
		return int.editReply({ content, allowedMentions: { parse: [] } });
	});
