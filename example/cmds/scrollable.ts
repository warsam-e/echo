import { AttachmentBuilder, Command, create_scrollable, MediaGalleryBuilder, TextDisplayBuilder } from '$index.ts';

export default new Command({
	name: 'scrollable',
	description: 'Browse Discord’s six default avatars',
}).addHandler('chat_input', (_, int) =>
	create_scrollable({
		int,
		data: () => Array.from({ length: 6 }, (_, index) => ({ index, title: `Default avatar ${index + 1}` })),
		match: async ({ index, title }) => {
			const response = await fetch(`https://cdn.discordapp.com/embed/avatars/${index}.png`);
			if (!response.ok) throw new Error(`Image request failed with status ${response.status}.`);
			if (response.headers.get('content-type')?.split(';', 1)[0] !== 'image/png') {
				throw new Error('The image source did not return a PNG.');
			}

			const buf = await response.arrayBuffer().then(Buffer.from);
			const image = new AttachmentBuilder(buf, { name: 'avatar.png' });
			return {
				files: [image],
				components: [
					new TextDisplayBuilder().setContent(`## ${title}`),
					new MediaGalleryBuilder().addItems((item) =>
						item.setURL('attachment://avatar.png').setDescription(title),
					),
				],
			};
		},
	}),
);
