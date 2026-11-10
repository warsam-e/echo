import { ButtonBuilder, ButtonStyle, ContainerBuilder, MessageFlags, UserSelectMenuBuilder } from 'discord.js';
import { Command } from '$mod/index.ts';

export default new Command({
	name: 'comp',
	description: 'a command to test out the new components stuff',
})
	.addHandler('button', (_bot, int) => int.reply(`${int.customId} was clicked!`))
	.addHandler('select_menu', (_bot, int) => int.reply(`${int.values.join(', ')} was selected!`))
	.addHandler('chat_input', async (bot, int) => {
		const container = new ContainerBuilder()
			.addTextDisplayComponents((x) =>
				x.setContent(
					'This text is inside a Text Display component! You can use **any __markdown__** available inside this component too.',
				),
			)
			.addActionRowComponents((r) =>
				r.addComponents(
					new UserSelectMenuBuilder()
						.setCustomId(bot.customId('select', int))
						.setPlaceholder('Select a user!'),
				),
			)
			.addSeparatorComponents((s) => s)
			.addActionRowComponents((r) =>
				r.addComponents(
					new ButtonBuilder()
						.setCustomId(bot.customId('button', int))
						.setLabel('Click me!')
						.setStyle(ButtonStyle.Primary),
				),
			);

		await int.reply({
			components: [container],
			flags: [MessageFlags.IsComponentsV2],
		});
	});
