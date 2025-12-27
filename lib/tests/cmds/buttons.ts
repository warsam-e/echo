import { ActionRowBuilder, ButtonBuilder, ButtonStyle, Command } from '@index.ts';

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
				.addHandler('chat_input', (_bot, int) =>
					int.reply({
						components: [
							new ActionRowBuilder<ButtonBuilder>().addComponents(
								new ButtonBuilder()
									.setLabel('Test')
									.setCustomId('button1')
									.setStyle(ButtonStyle.Primary),
							),
						],
						ephemeral: true,
					}),
				),
			new Command({
				name: 'button2',
				description: 'Test button 2',
			})
				.addHandler('button', (_bot, int) => int.reply(int.customId))
				.addHandler('chat_input', (_bot, int) =>
					int.reply({
						components: [
							new ActionRowBuilder<ButtonBuilder>().addComponents(
								new ButtonBuilder()
									.setLabel('Test')
									.setCustomId('button2')
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
			.addHandler('chat_input', (_bot, int) =>
				int.reply({
					components: [
						new ActionRowBuilder<ButtonBuilder>().addComponents(
							new ButtonBuilder().setLabel('Test 2').setCustomId('button1').setStyle(ButtonStyle.Primary),
						),
					],
					ephemeral: true,
				}),
			),
	]);
