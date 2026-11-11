import {
	ActionRowBuilder,
	ApplicationCommandOptionType,
	ApplicationCommandType,
	type AutocompleteInteraction,
	ButtonBuilder,
	type ButtonInteraction,
	ButtonStyle,
	type ChatInputCommandInteraction,
	Command,
	type CommandInfo,
	type Echo,
	set_locales,
} from '$index.ts';

const choices = ['bar', 'bar2', 'bar3'];

const handle_autocomplete = (_bot: Echo, int: AutocompleteInteraction) =>
	int.respond(choices.map((value) => ({ name: value, value })));

const handle_button = (bot: Echo, int: ButtonInteraction) => {
	const action = bot.action(int);
	return int.reply([`Button clicked!`, `bot.action(int): ${action}`, `int.customId: ${int.customId}`].join('\n'));
};

const handle_chat = (bot: Echo, int: ChatInputCommandInteraction) => {
	const choice = int.options.getString('foo', true);
	if (!choices.includes(choice)) return int.reply('Choose bar, bar2, or bar3.');

	const row = new ActionRowBuilder<ButtonBuilder>().addComponents([
		new ButtonBuilder()
			.setLabel(`Show ${choice}`)
			.setCustomId(bot.id(int, `show-selected-option:${choice}`))
			.setStyle(ButtonStyle.Primary),
	]);
	return int.reply({
		components: [row],
	});
};

const command_info: CommandInfo = {
	name: 'foo',
	description: 'bar command stuff',
	options: [
		{
			name: 'foo',
			description: 'Choose what the button will show',
			required: true,
			type: ApplicationCommandOptionType.String,
			autocomplete: true,
		},
	],
};

export default new Command({
	name: 'sub',
	description: 'sub command stuff',
	type: ApplicationCommandType.ChatInput,
})
	.addSubCommandGroup({
		name: set_locales({ default: 'group1', ja: 'グループ1' }),
		description: set_locales({ default: 'a group', ja: 'サブコマンドのグループ' }),
		commands: [
			new Command(command_info)
				.addHandler('autocomplete', handle_autocomplete)
				.addHandler('button', handle_button)
				.addHandler('chat_input', handle_chat),
		],
	})
	.addSubCommandGroup({
		name: 'group2',
		description: 'a group',
		commands: [
			new Command(command_info)
				.addHandler('autocomplete', handle_autocomplete)
				.addHandler('button', handle_button)
				.addHandler('chat_input', handle_chat),
		],
	})
	.addSubCommandGroup({
		name: 'group1-with-a-very-very-long-tag',
		description: 'Demonstrates compact component IDs for long routes',
		commands: [
			new Command({ ...command_info, name: 'foo-with-a-very-very-long-option' })
				.addHandler('autocomplete', handle_autocomplete)
				.addHandler('button', handle_button)
				.addHandler('chat_input', handle_chat),
		],
	})
	.addSubCommands([
		new Command(command_info)
			.addHandler('autocomplete', handle_autocomplete)
			.addHandler('button', handle_button)
			.addHandler('chat_input', handle_chat),
	]);
