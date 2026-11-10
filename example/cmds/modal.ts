import {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	Command,
	EmbedBuilder,
	LabelBuilder,
	ModalBuilder,
	TextInputBuilder,
	TextInputStyle,
} from '$index.ts';

const openModal = new Command({
	name: 'one',
	description: 'Open a modal from a channel message',
});

openModal
	.addHandler('button', (bot, int) => {
		const modal = new ModalBuilder().setCustomId(bot.id(int, 'modal')).setTitle('Modal');
		modal.addLabelComponents(
			new LabelBuilder()
				.setLabel('Text input')
				.setTextInputComponent(new TextInputBuilder().setCustomId('text').setStyle(TextInputStyle.Paragraph)),
		);
		return int.showModal(modal);
	})
	.addHandler('modal_submit', (_, int) => {
		const text = int.fields.getTextInputValue('text');
		return int.reply({ embeds: [new EmbedBuilder().setTitle('Modal submitted').setDescription(text)] });
	})
	.addHandler('chat_input', async (bot, int) => {
		await int.deferReply();
		const channel = int.channel;
		if (!channel?.isSendable()) return int.editReply('This channel is not sendable.');

		await channel.send({
			components: [
				new ActionRowBuilder<ButtonBuilder>().addComponents(
					new ButtonBuilder()
						.setCustomId(bot.id(openModal, 'open-modal'))
						.setLabel('Open modal')
						.setStyle(ButtonStyle.Primary),
				),
			],
		});
		return int.deleteReply();
	});

export default new Command({
	name: 'modal',
	description: 'Modal command',
}).addSubCommandGroup({
	name: 'group',
	description: 'group',
	commands: [openModal],
});
