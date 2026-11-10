import { ActionRowBuilder, ButtonBuilder, ButtonStyle, Command, MessageFlags } from '$index.ts';

export default new Command({
	name: 'buttons',
	description: 'Test buttons',
})
	.addSubCommandGroup({
		name: 'sub',
		description: 'Test sub command groups',
		commands: [
			new Command({
				name: 'button1',
				description: 'Test button 1',
			})
				.addHandler('button', (_bot, int) => int.reply(int.customId))
				.addHandler('chat_input', (bot, int) =>
					int.reply({
						components: [
							new ActionRowBuilder<ButtonBuilder>().addComponents(
								new ButtonBuilder()
									.setLabel('Test')
									.setCustomId(bot.id(int, 'button-1'))
									.setStyle(ButtonStyle.Primary),
							),
						],
						flags: MessageFlags.Ephemeral,
					}),
				),
			new Command({
				name: 'button2',
				description: 'Test button 2',
			})
				.addHandler('button', (_bot, int) => int.reply(int.customId))
				.addHandler('chat_input', (bot, int) =>
					int.reply({
						components: [
							new ActionRowBuilder<ButtonBuilder>().addComponents(
								new ButtonBuilder()
									.setLabel('Test')
									.setCustomId(bot.id(int, 'button2'))
									.setStyle(ButtonStyle.Primary),
							),
						],
					}),
				),
		],
	})
	.addSubCommands([
		new Command({
			name: 'button3',
			description: 'Test button 3',
		})
			.addHandler('button', (_bot, int) => int.reply(int.customId))
			.addHandler('chat_input', (bot, int) =>
				int.reply({
					components: [
						new ActionRowBuilder<ButtonBuilder>().addComponents(
							new ButtonBuilder()
								.setLabel('Test 2')
								.setCustomId(bot.id(int, 'button3'))
								.setStyle(ButtonStyle.Primary),
						),
					],
					flags: MessageFlags.Ephemeral,
				}),
			),
	]);
