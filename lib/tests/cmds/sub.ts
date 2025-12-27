import {
	ActionRowBuilder,
	ApplicationCommandOptionType,
	ApplicationCommandType,
	type AutocompleteInteraction,
	ButtonBuilder,
	type ButtonInteraction,
	ButtonStyle,
	Command,
	type CommandInfo,
	type Echo,
	type RepliableInteraction,
} from '$index.ts';

const handle_autocomplete = (_bot: Echo, int: AutocompleteInteraction) =>
	int.respond([
		{
			name: 'bar',
			value: 'bar',
		},
		{
			name: 'bar2',
			value: 'bar2',
		},
		{
			name: 'bar3',
			value: 'bar3',
		},
	]);

const handle_button = (_bot: Echo, int: ButtonInteraction) => int.reply(int.customId);

const handle_chat = (_bot: Echo, int: RepliableInteraction) => {
	const row = new ActionRowBuilder<ButtonBuilder>().addComponents([
		new ButtonBuilder().setLabel('blah').setCustomId('ah').setStyle(ButtonStyle.Primary),
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
			description: 'random shit',
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
		name: 'group1',
		description: 'a group',
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
	.addSubCommands([
		new Command(command_info)
			.addHandler('autocomplete', handle_autocomplete)
			.addHandler('button', handle_button)
			.addHandler('chat_input', handle_chat),
	]);
