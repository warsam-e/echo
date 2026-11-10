import { AttachmentBuilder, Command, create_scrollable, MediaGalleryBuilder, TextDisplayBuilder } from '$index.ts';

export default new Command({
	name: 'scrollable',
	description: 'Browse ten pages with an image loaded for each page',
}).addHandler('chat_input', (_, int) =>
	create_scrollable({
		int,
		data: () => Array.from({ length: 10 }, (_, index) => ({ title: `Page ${index + 1}` })),
		match: async ({ title }) => {
			const response = await fetch('https://thispersondoesnotexist.com/');
			if (!response.ok) throw new Error(`Image request failed with status ${response.status}.`);

			const image = new AttachmentBuilder(Buffer.from(await response.arrayBuffer()), { name: 'portrait.jpg' });
			return {
				files: [image],
				components: [
					new TextDisplayBuilder().setContent(`## ${title}`),
					new MediaGalleryBuilder().addItems((item) =>
						item.setURL('attachment://portrait.jpg').setDescription(`Portrait for ${title}`),
					),
				],
			};
		},
	}),
);
