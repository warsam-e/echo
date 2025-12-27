import { inspect } from 'node:util';
import { ActionRowBuilder, ApplicationCommandType, ButtonBuilder, ButtonStyle, Command } from '@index.ts';

export default new Command({
	name: 'context action',
	type: ApplicationCommandType.Message,
})
	.addHandler('button', (_bot, int) => int.reply(int.customId))
	.addHandler('message_context_menu', async (_bot, int) => {
		const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
			new ButtonBuilder().setLabel('Test').setCustomId('context action-test').setStyle(ButtonStyle.Primary),
		);
		int.reply({
			content: `\`\`\`js\n${inspect(int.targetMessage, false, 0)}\`\`\``,
			components: [row],
		});
	});
