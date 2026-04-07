import {
	ActionRowBuilder,
	AttachmentBuilder,
	ButtonBuilder,
	ButtonStyle,
	Command,
	create_scrollable,
	MediaGalleryBuilder,
	TextDisplayBuilder,
} from '$index.ts';

export default new Command({
	name: 'scrollable',
	description: 'scrollable content',
})
	.addHandler('button', (_bot, int) => int.reply(int.customId))
	.addHandler('chat_input', async (_bot, int) => {
		await int.reply('loading...');

		const make_data = (index: number) => ({
			title: `Page ${index + 1}`,
			description: 'This is page {page}',
			author: `Author ${index + 1}`,
			// random date using math random
			date: new Date(2021, Math.floor(Math.random() * 12), Math.floor(Math.random() * 31)),
		});

		const gen_data = () => Array.from({ length: 10 }, (_, i) => make_data(i));

		await create_scrollable({
			int,
			data: gen_data,
			show_page_count: true,
			match: async (val, index) => {
				const res = await fetch('https://thispersondoesnotexist.com/').then((r) => r.arrayBuffer());
				const img = new AttachmentBuilder(Buffer.from(res), {
					name: 'thispersondoesnotexist.jpg',
				});
				return {
					files: [img],
					components: [
						new TextDisplayBuilder().setContent(
							[
								`This is page ${index + 1}`,
								`Author: ${val.author}`,
								`Date: ${val.date.toDateString()}`,
							].join('\n'),
						),
						new MediaGalleryBuilder().addItems((i) =>
							i.setURL(`attachment://thispersondoesnotexist.jpg`).setDescription(`Image ${index + 1}`),
						),
						new ActionRowBuilder<ButtonBuilder>().addComponents(
							new ButtonBuilder()
								.setCustomId('scrollable-random')
								.setLabel('Random')
								.setStyle(ButtonStyle.Secondary),
						),
					],
				};
			},
		});
	});
