import {
	ActionRowBuilder,
	type APIEmbed,
	type AttachmentBuilder,
	type Awaitable,
	ButtonBuilder,
	type ButtonInteraction,
	ButtonStyle,
	type EmbedBuilder,
	type InteractionEditReplyOptions,
	type InteractionReplyOptions,
	type InteractionResponse,
	type Message,
	type MessageComponentInteraction,
	type RepliableInteraction,
} from 'discord.js';
import type { AnySelectMenuBuilder } from '$discord.ts';

// biome-ignore lint/suspicious/noExplicitAny: it's needed here
export type ScrollableDataType = Array<Record<string, any>>;
export type ScrollableDataFn<Data extends ScrollableDataType> = () => Awaitable<Data>;

export interface ScrollableContent {
	content?: string;
	embed?: EmbedBuilder | APIEmbed;
	files?: AttachmentBuilder[];
	components?: Array<ActionRowBuilder<ButtonBuilder | AnySelectMenuBuilder>>;
}

export type ScrollableControlType = 'initiator' | 'all';

export interface ScrollableData<Data extends ScrollableDataType> {
	/** The original interaction, used for initiating the scrollable instance */
	int: RepliableInteraction;
	/**
	 * Show the page count on the buttons row
	 * @default false
	 */
	show_page_count?: boolean;
	/**
	 * The message to show when the data fetching fails
	 * @default { content: "Failed to get data." }
	 */
	fail_msg?: ScrollableContent;
	/** The array data to be used in the scrollable */
	data: ScrollableDataFn<Data>;
	/**
	 * Who can control the scrollable.
	 * @default 'initiator'
	 */
	controllable?: ScrollableControlType;
	/** The function to match the data with the content */
	match: (val: Data[number], index: number, array: Array<Data[number]>) => Awaitable<ScrollableContent>;
}

async function _try_prom<T>(prom: Awaitable<T>): Promise<T | undefined> {
	try {
		return await prom;
	} catch (e) {
		console.error(e);
	}
}

/**
 * The Scrollable class that handles the scrollable message content.
 * Use the exported {@link create_scrollable} to create a new instance of a scrollable message.
 * @internal
 */
class Scrollable<Data extends ScrollableDataType> {
	readonly #_data: Required<ScrollableData<Data>>;
	#_scrollable_data: Data;
	#_int: RepliableInteraction;
	#_index = 0;
	#_current_content_cache?: ScrollableContent;
	#_reloading = false;

	private constructor(data: ScrollableData<Data>, res: Data) {
		this.#_data = {
			...data,
			fail_msg: data.fail_msg ?? { content: 'Failed to get data.' },
			show_page_count: data.show_page_count ?? false,
			controllable: data.controllable ?? 'initiator',
		};
		this.#_int = data.int;
		this.#_scrollable_data = res;
	}

	async #_getContent() {
		if (this.#_current_content_cache) return this.#_current_content_cache;
		const current_data = this.#_scrollable_data.at(this.#_index);
		if (!current_data) return this.#_data.fail_msg;
		const current_content = await _try_prom(this.#_data.match(current_data, this.#_index, this.#_scrollable_data));
		if (!current_content) return this.#_data.fail_msg;
		this.#_current_content_cache = current_content;
		return current_content;
	}

	async #_updateReloading(val: boolean) {
		const content = await this.#_getContent();
		this.#_reloading = val;
		this.#_int.editReply({ components: this.#_renderComponents(content.components) });
	}

	#_getPayload<Editing extends boolean>(
		data: ScrollableContent,
		_editing?: Editing,
	): Editing extends true ? InteractionEditReplyOptions : InteractionReplyOptions {
		if (data.content === undefined && data.embed === undefined && data.files === undefined)
			throw new Error('No content, embed or files provided.');
		return {
			...(data.content !== undefined ? { content: data.content } : {}),
			...(data.embed ? { embeds: [data.embed] } : {}),
			files: data.files,
		};
	}

	/**
	 * Reloads the data and updates the message content.
	 *
	 * Typically this is called by the reload button, but can be called manually.
	 */
	async reloadData(bint: ButtonInteraction | null): Promise<void> {
		if (bint) {
			await this.#_updateReloading(true);
			await bint.deferUpdate();
		}

		this.#_current_content_cache = undefined;

		this.#_scrollable_data = await this.#_data.data();
		this.#_index = 0;

		const current_content = await this.#_getContent();

		const components = this.#_renderComponents(current_content.components);

		await _try_prom(
			this.#_int.editReply({
				components,
				...this.#_getPayload(current_content, true),
			}),
		);

		if (bint) this.#_updateReloading(false);
	}

	/**
	 * init Scrollable, this shouldnt be called directly. use the exported {@link create_scrollable}.
	 * @internal
	 * @hidden
	 */
	static async init<Data extends ScrollableDataType>(data: ScrollableData<Data>): Promise<void> {
		const res = await _try_prom(data.data());
		if (res) return new Scrollable(data, res).#init();
		if (data.int.replied || data.int.deferred)
			data.int.editReply(data.fail_msg ?? { content: 'Failed to get data.' });
		else data.int.reply(data.fail_msg ?? { content: 'Failed to get data.' });
	}

	#_renderComponents(
		extra_rows?: ScrollableContent['components'],
	): Array<ActionRowBuilder<ButtonBuilder | AnySelectMenuBuilder>> {
		const rows: ActionRowBuilder<ButtonBuilder | AnySelectMenuBuilder>[] = [];
		const has_data = !!this.#_scrollable_data.length;
		const can_go_back = !this.#_reloading && has_data && this.#_index !== 0;
		const can_go_forward = !this.#_reloading && has_data && this.#_scrollable_data.length > this.#_index + 1;
		const can_reload = !this.#_reloading;

		if (extra_rows) rows.push(...extra_rows);

		const btns = [
			new ButtonBuilder()
				.setCustomId('scrollable_prev')
				.setLabel('←')
				.setStyle(ButtonStyle.Secondary)
				.setDisabled(!can_go_back),
			new ButtonBuilder()
				.setCustomId('scrollable_next')
				.setLabel('→')
				.setStyle(ButtonStyle.Secondary)
				.setDisabled(!can_go_forward),
			new ButtonBuilder()
				.setCustomId('scrollable_reload')
				.setLabel('↻')
				.setStyle(ButtonStyle.Secondary)
				.setDisabled(!can_reload),
			...(this.#_data.show_page_count && has_data
				? [
						new ButtonBuilder()
							.setCustomId('scrollable_page_count')
							.setLabel(`${this.#_index + 1} / ${this.#_scrollable_data.length}`)
							.setStyle(ButtonStyle.Secondary)
							.setDisabled(true),
					]
				: []),
		];

		const chunks = [];
		for (let i = 0; i < btns.length; i += 5) chunks.push(btns.slice(i, i + 5));

		for (const chunk of chunks) {
			const row = new ActionRowBuilder<ButtonBuilder>().addComponents(chunk);
			rows.push(row);
		}

		return rows;
	}

	async #init() {
		const { int } = this.#_data;
		if (!int.isRepliable()) throw new Error('Interaction is not repliable.');

		let msg: Message | InteractionResponse | undefined;

		const current_content = await this.#_getContent();
		const components = this.#_renderComponents(current_content.components);

		if (int.deferred || int.replied) {
			msg = await _try_prom(
				this.#_int.editReply({
					components,
					...this.#_getPayload(current_content, true),
				}),
			);
		} else {
			msg = await _try_prom(
				this.#_int.reply({
					components,
					...this.#_getPayload(current_content, false),
				}),
			);
		}

		if (!msg) throw new Error('Scrollable failed to send.');

		const filter = (i: MessageComponentInteraction) =>
			i.customId === 'scrollable_prev' || i.customId === 'scrollable_next' || i.customId === 'scrollable_reload';
		const collector = msg.createMessageComponentCollector({ filter });
		collector.on('collect', async (bint) => {
			if (this.#_data.controllable === 'initiator' && bint.user.id !== int.user.id) return bint.deferUpdate();
			if (bint.isButton()) {
				switch (bint.customId) {
					case 'scrollable_prev':
						await this.#_move('prev', bint);
						break;
					case 'scrollable_next':
						await this.#_move('next', bint);
						break;
					case 'scrollable_reload':
						await this.reloadData(bint);
						break;
				}
			}
		});
	}

	async #_move(action: 'prev' | 'next', bint?: ButtonInteraction) {
		switch (action) {
			case 'prev':
				if (this.#_index > 0) this.#_index--;
				break;
			case 'next':
				if (this.#_index < this.#_scrollable_data.length - 1) this.#_index++;
				break;
		}

		this.#_current_content_cache = undefined;
		const current_content = await this.#_getContent();
		const components = this.#_renderComponents(current_content.components);

		await _try_prom(
			this.#_int.editReply({
				components,
				...this.#_getPayload(current_content, true),
			}),
		);

		if (bint) await bint.deferUpdate();
	}
}

/**
 * Creating an instance of {@link Scrollable}.
 *
 * See {@link ScrollableData} for required/available options.
 * @example
 * ```ts
 * import {Command, create_scrollable} from 'echo';
 *
 * new Command({...})
 * .addHandler("chat_input", (bot, int) => create_scrollable({
 *   int,
 *   data: () => [{title: "foo"}, {title: "bar"}],
 *   match: (v) => ({
 *      content: `## ${v.title}`
 *   })
 * }));
 *
 * ```
 */
export const create_scrollable = <Data extends ScrollableDataType>(data: ScrollableData<Data>) => Scrollable.init(data);

export type { Scrollable };
